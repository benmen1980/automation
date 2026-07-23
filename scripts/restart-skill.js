const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_COMMANDS = ['pm2 restart automation-api', 'npm run start'];
const DEFAULT_BACKEND_PORT = process.env.PORT || '3001';
const DEFAULT_FRONTEND_PORT = process.env.FRONTEND_PORT || '5173';
const DEFAULT_BACKEND_URL = `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`;
const DEFAULT_FRONTEND_URL = `http://127.0.0.1:${DEFAULT_FRONTEND_PORT}`;

const PROJECT_ROOT = process.cwd();
const HISTORY_PATH = path.resolve(process.env.RESTART_APP_HISTORY_PATH || path.join(PROJECT_ROOT, 'local-data', 'restart-skill', 'attempts.json'));
const HISTORY_LIMIT = Number.parseInt(process.env.RESTART_APP_HISTORY_LIMIT || '50', 10);
const HISTORY_WINDOW_MS = Number.parseInt(process.env.RESTART_APP_HISTORY_WINDOW_MS || String(24 * 60 * 60 * 1000), 10);
const COMMAND_TIMEOUT_MS = Number.parseInt(process.env.RESTART_APP_COMMAND_TIMEOUT_MS || '20000', 10);

function parseCommands(raw) {
  if (!raw) {
    return [...DEFAULT_COMMANDS];
  }

  return raw
    .split(';')
    .map((cmd) => cmd.trim())
    .filter(Boolean);
}

function sanitizeCommand(command) {
  if (!command) return '';
  return command.replace(
    /([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASS|PASSWORD|CLIENT)[A-Za-z0-9_]*)=([^\s"']+)/g,
    '$1=***REDACTED***'
  );
}

function normalizeCommand(command) {
  return (command || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function commandSignature(command) {
  return normalizeCommand(command).replace(/\s+/g, ' ').trim();
}

async function readHistory() {
  try {
    const raw = await fs.readFile(HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const attempts = Array.isArray(parsed?.attempts) ? parsed.attempts : [];
    return { ...parsed, attempts };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, attempts: [] };
    }
    throw error;
  }
}

async function persistHistory(history) {
  const payload = {
    ...history,
    updatedAt: new Date().toISOString(),
    attempts: history.attempts.slice(-HISTORY_LIMIT),
  };

  await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.writeFile(HISTORY_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function failedAttempts(attempts) {
  return attempts.filter((attempt) => attempt.status === 'failed');
}

function attemptsForCommand(attempts, normalizedCommand) {
  return attempts.filter((attempt) => commandSignature(attempt.command) === normalizedCommand);
}

function scoreCommand(command, attempts) {
  const sig = commandSignature(command);
  const matching = attemptsForCommand(attempts, sig);
  const failures = matching.filter((attempt) => attempt.status === 'failed');
  let score = failures.length;

  if (!matching.length) {
    return 0.001; // fresh attempts are preferred over unknown failures
  }

  for (const attempt of matching) {
    if (attempt.status !== 'failed') {
      score -= 0.2; // encourage commands with successful history
      continue;
    }

    const started = new Date(attempt.startedAt).getTime();
    if (Number.isNaN(started)) continue;

    const age = Date.now() - started;
    if (age < HISTORY_WINDOW_MS) {
      score += 0.1; // recent failures should be deprioritized more than old ones
    }
  }

  const recent = matching
    .slice()
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 3);
  const allRecentFailed = recent.length && recent.every((attempt) => attempt.status === 'failed');
  if (allRecentFailed) score += 1.5;

  return score;
}

function sortCommandsByLearning(commands, attempts) {
  return [...commands].sort((a, b) => {
    const scoreA = scoreCommand(a, attempts);
    const scoreB = scoreCommand(b, attempts);
    if (scoreA === scoreB) return normalizeCommand(a).localeCompare(normalizeCommand(b));
    return scoreA - scoreB;
  });
}

function runCommand(command) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, {
    shell: true,
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });

  const finishedAt = new Date().toISOString();
  if (result.error) {
    const error = result.error;
    const isTimeout = error.code === 'ETIMEDOUT';
    const status = isTimeout ? 'success' : 'failed';
    return {
      command,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      exitCode: null,
      error: isTimeout ? 'Command timed out and is treated as accepted restart launch.' : error.message,
      stdout: typeof result.stdout === 'string' ? result.stdout.slice(0, 2000) : '',
      stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, 2000) : '',
    };
  }

  const exitCode = result.status ?? 0;
  if (result.status === 0) {
    return {
      command,
      status: 'success',
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      exitCode,
      error: null,
      stdout: typeof result.stdout === 'string' ? result.stdout.slice(0, 2000) : '',
      stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, 2000) : '',
    };
  }

  const signal = result.signal ? ` killed by ${result.signal}` : '';
  return {
    command,
    status: 'failed',
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    exitCode,
    error: `Command exited with code ${exitCode}${signal}`,
    stdout: typeof result.stdout === 'string' ? result.stdout.slice(0, 2000) : '',
    stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, 2000) : '',
  };
}

function printAttempt(attempt) {
  const status = attempt.status.toUpperCase();
  const time = `${attempt.startedAt}`;
  const safeCommand = sanitizeCommand(attempt.command);

  if (attempt.status === 'success') return;
  if (attempt.error) {
    // eslint-disable-next-line no-console
    console.log(`[restart-skill] failed: ${safeCommand}`);
    console.log(attempt.error);
  }
  if (attempt.stderr) {
    // eslint-disable-next-line no-console
    console.log(attempt.stderr);
  }
}

async function probeUrl(url, label, attempts = 6, intervalMs = 1000) {
  const targetUrl = url || '';
  let lastError = '';

  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'manual',
      });
      const ok = response.status >= 200 && response.status < 400;
      return {
        label,
        url: targetUrl,
        working: ok,
        message: `HTTP ${response.status}`,
      };
    } catch (error) {
      lastError = error?.message || String(error);
    }

    if (i < attempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return {
    label,
    url: targetUrl,
    working: false,
    message: `unreachable (${lastError || 'request failed'})`,
  };
}

async function echoServiceStatus() {
  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;

  const [backend, frontend] = await Promise.all([
    probeUrl(backendUrl, 'backend'),
    probeUrl(frontendUrl, 'frontend'),
  ]);

  return {
    backend,
    frontend,
  };
}

async function run() {
  const commands = parseCommands(process.env.RESTART_APP_COMMANDS || '');
  const history = await readHistory();
  const sorted = sortCommandsByLearning(commands, history.attempts || []);
  const failed = failedAttempts(history.attempts || []);

  if (!sorted.length) {
    console.error('[restart-skill] No restart commands configured.');
    process.exitCode = 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[restart-skill] restarting...');

  for (const command of sorted) {
    const outcome = runCommand(command);
    history.attempts = history.attempts || [];
    history.attempts.push(outcome);
    printAttempt(outcome);
    await persistHistory(history);

    if (outcome.status === 'success') {
      const status = await echoServiceStatus();
      const activeUrl = status.backend.working ? status.backend.url : status.frontend.url;
      // eslint-disable-next-line no-console
      console.log(`Server restarted in URL: ${activeUrl}`);
      return;
    }
  }

  const cycleFailed = sorted.length;
  const message = `[restart-skill] All configured restart commands failed (${failed.length} prior failed runs plus ${cycleFailed} in this cycle).`;
  // eslint-disable-next-line no-console
  console.error(message);
  process.exitCode = 1;
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[restart-skill] Failed to execute restart skill:', error?.message || error);
  process.exitCode = 1;
});
