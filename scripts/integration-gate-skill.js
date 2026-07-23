const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const REQUIRED_QUESTION_KEYS = [
  'providerName',
  'businessGoal',
  'sourceSystem',
  'targetSystem',
  'direction',
  'triggers',
  'connectionMethods',
  'authMethod',
  'credentials',
  'objectsAndEntities',
  'fieldMappings',
  'testMode',
  'logsAndRunHistory',
  'uiRequirements',
];

const DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL'];
const CONNECTION_METHODS = [
  'REST',
  'GraphQL',
  'Webhook receive',
  'Webhook send',
  'SQL direct connection',
  'ODBC',
  'SFTP/FTP',
  'File based (CSV/JSON/XML/Excel)',
  'Email (SMTP/IMAP/POP3)',
  'Message queue',
  'Other',
];
const AUTH_METHODS = ['API key', 'Bearer token', 'OAuth2', 'Basic', 'HMAC', 'Custom', 'Other'];
const TRIGGER_EXAMPLES = ['manual', 'scheduled', 'webhook', 'file polling', 'queue'];

const DEFAULT_COMMON = {
  providers: ['shopify', 'priority', 'salesforce', 'gmail', 'whatsapp', 'mysql'],
  sourceTargets: ['Shopify', 'Priority', 'Salesforce', 'WhatsApp', 'Gmail', 'Priority DB', 'warehouse DB'],
  testModes: ['test', 'dry_run', 'mock_output', 'live', 'email_test'],
  credentials: [
    'PRIORITY_API_URL',
    'PRIORITY_API_KEY',
    'PRIORITY_BASE_URL',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'SHOPIFY_API_URL',
    'WHATSAPP_TOKEN',
    'WHATSAPP_API_URL',
    'GOOGLE_REFRESH_TOKEN',
    'SALESFORCE_ACCESS_TOKEN',
  ],
  entities: ['order', 'customer', 'quote', 'invoice', 'inventory', 'webhook payload', 'file'],
  mappings: [
    'shopifyOrder.id -> priorityOrder.ExternalOrderId',
    'priorityInventory.qty -> shopifyInventory.quantity',
  ],
  triggers: TRIGGER_EXAMPLES,
  directions: DIRECTIONS,
};

function unique(items) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function splitList(inputValue) {
  return (inputValue || '')
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitPromptSentences(input) {
  return String(input || '')
    .split(/[;\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractQuotedTokens(text) {
  const out = [];
  const re = /['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function extractArrayItems(text, key) {
  const re = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const match = text.match(re);
  if (!match) return [];
  return extractQuotedTokens(match[1]);
}

function collectUsageFromFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const directionMatch = text.match(/direction:\\s*['"]([^'"]+)['"]/);
    const direction = directionMatch?.[1]?.toUpperCase();
    const connectors = extractArrayItems(text, 'connectors');
    const triggerTokens = extractArrayItems(text, 'triggers');
    const testModes = extractArrayItems(text, 'modes');
    const credentialKeys = [];
    const keyRegex = /key:\\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = keyRegex.exec(text)) !== null) {
      credentialKeys.push(match[1]);
    }
    const descriptionMatch = text.match(/description:\\s*['"]([^'"]+)['"]/);
    const sourceTargets = [];
    if (descriptionMatch?.[1]) {
      const desc = descriptionMatch[1];
      const mapFromTo = desc.match(/(?:^|\\b)(from|to)\\s+([\\w\\s]+)/i);
      if (mapFromTo) {
        sourceTargets.push(mapFromTo[2].trim());
      }
    }
    const mappingLike = (desc) => (desc || '').match(/[a-zA-Z0-9_\\.]+\\s*->\\s*[a-zA-Z0-9_\\.]+/g);
    const mappings = [];
    for (const m of mappingLike(descriptionMatch?.[1] || '') || []) mappings.push(m);
    return { direction, connectors, triggerTokens, testModes, credentialKeys, sourceTargets, mappings };
  } catch {
    return { direction: undefined, connectors: [], triggerTokens: [], testModes: [], credentialKeys: [], sourceTargets: [], mappings: [] };
  }
}

function loadIntegrationUsagePatterns() {
  const roots = [
    path.resolve(process.cwd(), 'integrations'),
    path.resolve(process.cwd(), 'src', 'integrations'),
  ];
  const found = {
    providers: new Set(),
    sourceTargets: new Set(),
    directions: new Set(),
    triggers: new Set(),
    testModes: new Set(),
    credentials: new Set(),
    mappings: new Set(),
  };

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name !== 'manifest.js' && entry.name !== 'integration.js') continue;
      const usage = collectUsageFromFile(full);
      if (usage.direction) found.directions.add(usage.direction);
      for (const c of usage.connectors) found.providers.add(c.toLowerCase());
      for (const t of usage.triggerTokens) found.triggers.add(String(t).toLowerCase());
      for (const m of usage.testModes) found.testModes.add(String(m).toLowerCase());
      for (const c of usage.credentialKeys) found.credentials.add(c);
      for (const st of usage.sourceTargets) found.sourceTargets.add(st);
      for (const mp of usage.mappings) found.mappings.add(mp);
    }
  };

  for (const root of roots) walk(root);

  return {
    providers: unique(Array.from(found.providers)).length ? unique(Array.from(found.providers)) : DEFAULT_COMMON.providers,
    sourceTargets: unique(Array.from(found.sourceTargets)).length ? unique(Array.from(found.sourceTargets)) : DEFAULT_COMMON.sourceTargets,
    directions: unique(Array.from(found.directions)).length ? unique(Array.from(found.directions)) : DEFAULT_COMMON.directions,
    triggers: unique(Array.from(found.triggers)).length ? unique(Array.from(found.triggers)) : DEFAULT_COMMON.triggers,
    testModes: unique(Array.from(found.testModes)).length ? unique(Array.from(found.testModes)) : DEFAULT_COMMON.testModes,
    credentials: unique(Array.from(found.credentials)).length ? unique(Array.from(found.credentials)) : DEFAULT_COMMON.credentials,
    mappings: unique(Array.from(found.mappings)).length ? unique(Array.from(found.mappings)) : DEFAULT_COMMON.mappings,
    entities: DEFAULT_COMMON.entities,
  };
}

function isClearText(value) {
  return typeof value === 'string' && value.trim().length >= 3;
}

function isMissingArray(value) {
  return !Array.isArray(value) || value.length === 0;
}

function chooseFromAllowed(raw, allowed) {
  const values = splitList(raw);
  const normalized = [];
  const seen = new Set();
  const byLower = new Map(allowed.map((item) => [item.toLowerCase(), item]));
  for (const item of values) {
    const canonical = byLower.get(item.toLowerCase());
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }
  return normalized;
}

function normalizeOpenList(rawList, allowed) {
  const matched = chooseFromAllowed(rawList.join(','), allowed);
  if (matched.length) return unique(matched);
  return unique(rawList.map((value) => String(value || '').trim()).filter(Boolean));
}

function normalizeDirection(raw) {
  return (raw || '').trim().toUpperCase();
}

function nowIso() {
  return new Date().toISOString();
}

function formatExamples(items, fallback, limit = 8) {
  return unique(items && items.length ? items : fallback).slice(0, limit).join(', ');
}

async function askLine(rl, prompt) {
  return (await rl.question(`${prompt}\n> `)).trim();
}

async function askMultiline(rl, prompt, examples) {
  console.log(prompt);
  if (examples) {
    console.log(`Examples: ${examples}`);
  }
  console.log('Enter one item per line, then empty line to finish.');
  const items = [];
  for (;;) {
    const line = await rl.question('> ');
    if (!line.trim()) break;
    items.push(line.trim());
  }
  return items;
}

async function askRequiredText(rl, key, prompt, examples) {
  for (;;) {
    const answer = await askLine(rl, `${prompt}${examples ? `\nExamples: ${examples}` : ''}`);
    if (isClearText(answer)) return answer;
    console.log(`\nI still need a clear answer for ${key}.\n`);
  }
}

async function askRequiredArray(rl, key, prompt, options) {
  const { multiline, examples } = options || {};
  for (;;) {
    const promptText = `${prompt}${examples ? `\nExamples: ${examples}` : ''}`;
    const answer = multiline ? await askMultiline(rl, promptText) : splitList(await askLine(rl, promptText));
    if (!isMissingArray(answer)) return answer;
    console.log(`\nI still need concrete values for ${key} before this can be built.\n`);
  }
}

async function askDirection(rl, patterns) {
  for (;;) {
    const raw = await askLine(
      rl,
      `Direction: ${formatExamples(patterns.directions, DIRECTIONS).replaceAll(',', ' / ')}`
    );
    const direction = normalizeDirection(raw);
    if (patterns.directions.includes(direction) || DIRECTIONS.includes(direction)) return direction;
    console.log('\nUse one of INBOUND, OUTBOUND, BIDIRECTIONAL.\n');
  }
}

async function askTriggers(rl, patterns) {
  for (;;) {
    const examples = formatExamples(patterns.triggers, TRIGGER_EXAMPLES);
    const raw = await askLine(
      rl,
      `Trigger type(s). Examples: ${examples}. For scheduled, include interval phrase e.g. "scheduled every 10 minutes".`
    );
    const tokens = splitList(raw).map((value) => value.toLowerCase());
    const clean = [];
    for (const token of tokens) {
      if (token.startsWith('scheduled')) {
        clean.push(token);
        continue;
      }
      if (['manual', 'webhook', 'file polling', 'queue', 'other'].includes(token)) {
        clean.push(token);
      }
    }
    if (!isMissingArray(clean)) return clean;
    console.log('\nPlease provide at least one trigger type (webhook, scheduled, manual, ...).\n');
  }
}

function normalizeFromPrompt(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const normalized = {
    providerName: typeof raw.providerName === 'string' ? raw.providerName.trim() : '',
    businessGoal: typeof raw.businessGoal === 'string' ? raw.businessGoal.trim() : '',
    sourceSystem: typeof raw.sourceSystem === 'string' ? raw.sourceSystem.trim() : '',
    targetSystem: typeof raw.targetSystem === 'string' ? raw.targetSystem.trim() : '',
    direction: normalizeDirection(raw.direction),
    triggers: isMissingArray(raw.triggers) ? [] : raw.triggers.map((value) => String(value || '').trim()).filter(Boolean),
    connectionMethods: isMissingArray(raw.connectionMethods) ? [] : raw.connectionMethods.map((value) => String(value || '').trim()).filter(Boolean),
    authMethod: isMissingArray(raw.authMethod) ? [] : raw.authMethod.map((value) => String(value || '').trim()).filter(Boolean),
    credentials: isMissingArray(raw.credentials) ? [] : raw.credentials.map((value) => String(value || '').trim()).filter(Boolean),
    objectsAndEntities: isMissingArray(raw.objectsAndEntities) ? [] : raw.objectsAndEntities.map((value) => String(value || '').trim()).filter(Boolean),
    fieldMappings: isMissingArray(raw.fieldMappings) ? [] : raw.fieldMappings.map((value) => String(value || '').trim()).filter(Boolean),
    testMode: typeof raw.testMode === 'string' ? raw.testMode.trim() : '',
    logsAndRunHistory: typeof raw.logsAndRunHistory === 'string' ? raw.logsAndRunHistory.trim() : '',
    uiRequirements: isMissingArray(raw.uiRequirements) ? [] : raw.uiRequirements.map((value) => String(value || '').trim()).filter(Boolean),
  };
  normalized.connectionMethods = normalizeOpenList(normalized.connectionMethods, CONNECTION_METHODS);
  normalized.authMethod = normalizeOpenList(normalized.authMethod, AUTH_METHODS);
  if (!isMissingArray(raw.triggers)) {
    normalized.triggers = splitList(raw.triggers.join(',')).map((value) => value.toLowerCase()).filter(Boolean);
  }
  return normalized;
}

function extractFromPrompt(prompt, patterns) {
  if (!prompt) return {};
  const normalized = String(prompt).replace(/\r\n/g, '\n');
  const parsed = {};

  const simpleMatches = {
    providerName: /(?:provider|system|integration)\s*(?:name|system)?\s*[:=\-]\s*([^\n;]+)/i,
    businessGoal: /(?:business goal|goal|objective)\s*[:=\-]\s*([^\n;]+)/i,
    sourceSystem: /(?:source system|source)\s*[:=\-]\s*([^\n;]+)/i,
    targetSystem: /(?:target system|destination|target)\s*[:=\-]\s*([^\n;]+)/i,
    direction: /direction\s*[:=\-]\s*(inbound|outbound|bidirectional)/i,
    testMode: /(?:test mode|tests?|test runs?)\s*[:=\-]\s*([^\n;]+)/i,
    logsAndRunHistory: /(?:logs?|run history|job history)\s*[:=\-]\s*([^\n;]+)/i,
    uiRequirements: /(?:ui requirements?|settings)\s*[:=\-]\s*([^\n;]+)/i,
  };

  for (const [key, regex] of Object.entries(simpleMatches)) {
    const match = normalized.match(regex);
    if (match?.[1]) parsed[key] = match[1].trim();
  }

  const listMatches = {
    connectionMethods: /(?:connection methods?|connect(?:ion)?s? via|protocol|via)\s*[:=\-]\s*([^\n;]+)/i,
    authMethod: /auth(?:entication)?\s*method(?:s)?\s*[:=\-]\s*([^\n;]+)/i,
    credentials: /credentials?\s*[:=\-]\s*([^\n;]+)/i,
    objectsAndEntities: /(?:objects?|entities?|object and entities?)\s*[:=\-]\s*([^\n;]+)/i,
    fieldMappings: /(?:field mappings?|mappings?)\s*[:=\-]\s*([^\n;]+)/i,
    triggers: /(?:trigger[s]?|run mode[s]?)\s*[:=\-]\s*([^\n;]+)/i,
  };
  for (const [key, regex] of Object.entries(listMatches)) {
    const match = normalized.match(regex);
    if (!match?.[1]) continue;
    parsed[key] = splitList(match[1]);
  }

  const flowMatch = normalized.match(/(?:sync|integration|flow)\s+(?:between|from)\s+([A-Za-z0-9 _.-]+)\s+(?:to|->|into|toward|towards)\s+([A-Za-z0-9 _.-]+)/i);
  if (flowMatch) {
    if (!parsed.sourceSystem) parsed.sourceSystem = flowMatch[1].trim();
    if (!parsed.targetSystem) parsed.targetSystem = flowMatch[2].trim();
  }

  const mapLines = splitPromptSentences(normalized)
    .filter((line) => line.includes('->'))
    .map((line) => line.trim())
    .filter(Boolean);
  if (mapLines.length && !parsed.fieldMappings) parsed.fieldMappings = mapLines;

  if (!parsed.triggers?.length) {
    const t = new Set();
    const lowered = normalized.toLowerCase();
    if (/\bwebhook\b/.test(lowered)) t.add('webhook');
    if (/\bscheduled\b/.test(lowered)) t.add('scheduled');
    if (/\bmanual\b/.test(lowered)) t.add('manual');
    if (/\bqueue\b/.test(lowered)) t.add('queue');
    if (/\bfile polling\b|\bpolling\b/.test(lowered)) t.add('file polling');
    if (t.size) parsed.triggers = Array.from(t);
  }

  if (!parsed.connectionMethods?.length) {
    const lowered = normalized.toLowerCase();
    const detected = [];
    for (const method of CONNECTION_METHODS) {
      if (lowered.includes(method.toLowerCase())) detected.push(method);
    }
    if (detected.length) parsed.connectionMethods = detected;
  }

  if (!parsed.authMethod?.length) {
    const lowered = normalized.toLowerCase();
    const detected = [];
    if (/\boauth2?\b/.test(lowered)) detected.push('OAuth2');
    if (/\bapi key\b/.test(lowered)) detected.push('API key');
    if (/\bbearer\b/.test(lowered)) detected.push('Bearer token');
    if (/\bbasic\b/.test(lowered)) detected.push('Basic');
    if (/\bhmac\b/.test(lowered)) detected.push('HMAC');
    if (detected.length) parsed.authMethod = detected;
  }

  if (!parsed.testMode && /\b(dry.?run|mock|test)\b/i.test(normalized)) {
    const modes = [];
    if (/\bdry.?run/i.test(normalized)) modes.push('dry_run');
    if (/\bmock/i.test(normalized)) modes.push('mock_output');
    if (/\btest\b/i.test(normalized)) modes.push('test');
    if (modes.length) parsed.testMode = modes.join(', ');
  }

  if (!parsed.providerName) {
    const knownLine = splitPromptSentences(normalized).find((line) => {
      const lowered = line.toLowerCase();
      return patterns.providers.some((provider) => lowered.includes(String(provider).toLowerCase()));
    });
    if (knownLine) parsed.providerName = knownLine.split(/[^\w-]/)[0];
  }

  if (!parsed.credentials?.length) {
    const tokens = normalized.match(/\b[A-Z0-9_]+_?(?:API|TOKEN|KEY|SECRET|PASSWORD|URL|ID)\b/g);
    if (tokens?.length) parsed.credentials = unique(tokens);
  }

  return normalizeFromPrompt(parsed);
}

function parsePromptArgs(argv) {
  let prompt = '';
  let saveToFile = false;
  for (let i = 2; i < argv.length; i++) {
    const current = argv[i];
    if (current === '--save') {
      saveToFile = true;
      continue;
    }
    if (current === '--prompt' || current === '-p') {
      if (i + 1 < argv.length) {
        prompt = argv[i + 1] || '';
        i += 1;
      }
      continue;
    }
    if (current.startsWith('--prompt=')) {
      prompt = current.substring('--prompt='.length);
    }
  }
  return { prompt, saveToFile };
}

function parseSeedFromPrompt(prompt, patterns) {
  return extractFromPrompt(prompt, patterns);
}

async function askIfMissingText(rl, currentValue, key, prompt, examples) {
  return isClearText(currentValue) ? currentValue : askRequiredText(rl, key, prompt, examples);
}

async function askIfMissingArray(rl, currentValue, key, prompt, options) {
  return isMissingArray(currentValue) ? askRequiredArray(rl, key, prompt, options) : currentValue;
}

async function collectAnswers(seed, patterns) {
  const rl = readline.createInterface({ input, output });
  const answers = {};

  try {
    answers.providerName = await askIfMissingText(
      rl,
      seed.providerName,
      'providerName',
      '1) Provider/system name for this integration',
      formatExamples(patterns.providers, DEFAULT_COMMON.providers, 10)
    );

    answers.businessGoal = await askIfMissingText(
      rl,
      seed.businessGoal,
      'businessGoal',
      '2) One-sentence business goal',
      'Sync new customers and orders from Shopify to Priority'
    );

    answers.sourceSystem = await askIfMissingText(
      rl,
      seed.sourceSystem,
      'sourceSystem',
      '3) What is the source system (who sends the data/action)?',
      formatExamples(patterns.sourceTargets, DEFAULT_COMMON.sourceTargets, 8)
    );

    answers.targetSystem = await askIfMissingText(
      rl,
      seed.targetSystem,
      'targetSystem',
      '4) What is the target system (where should it go)?',
      formatExamples(patterns.sourceTargets, DEFAULT_COMMON.sourceTargets, 8)
    );

    if (isClearText(seed.direction) && DIRECTIONS.includes(seed.direction.toUpperCase())) {
      answers.direction = normalizeDirection(seed.direction);
    } else {
      answers.direction = await askDirection(rl, patterns);
    }

    answers.triggers = await askIfMissingArray(
      rl,
      isMissingArray(seed.triggers) ? [] : seed.triggers,
      'triggers',
      '5) Trigger type(s). Examples can be manual, webhook, scheduled every 10 minutes, file polling, queue.',
      {
        multiline: false,
        examples: formatExamples(patterns.triggers, TRIGGER_EXAMPLES),
      }
    );
    if (!isMissingArray(answers.triggers) && answers.triggers.some((value) => value.toLowerCase() === 'scheduled') &&
      !answers.triggers.join(' ').toLowerCase().match(/every|cron|at | at/)) {
      console.log('Please include the schedule cadence for scheduled runs, e.g. "scheduled every 15 minutes".');
      const schedule = await askLine(rl, 'What is the exact schedule?');
      if (isClearText(schedule)) {
        answers.triggers = answers.triggers.map((t) => (t.toLowerCase() === 'scheduled' ? `scheduled ${schedule}` : t));
      }
    }

    answers.connectionMethods = await askIfMissingArray(
      rl,
      seed.connectionMethods,
      'connectionMethods',
      '6) Connection method(s). Direct question: REST, Webhook, SQL, ODBC, SFTP, file based, email, queue.',
      {
        multiline: false,
        examples: formatExamples(CONNECTION_METHODS, CONNECTION_METHODS),
      }
    );
    if (isMissingArray(answers.connectionMethods)) {
      answers.connectionMethods = splitList(await askLine(rl, '6b) Describe the connection method(s) in plain text.'));
    }

    answers.authMethod = await askIfMissingArray(
      rl,
      seed.authMethod,
      'authMethod',
      '7) Authentication method(s).',
      {
        multiline: false,
        examples: formatExamples(AUTH_METHODS, AUTH_METHODS),
      }
    );
    answers.authMethod = isMissingArray(answers.authMethod)
      ? await askRequiredArray(
          rl,
          'authMethod',
          '7b) Describe the authentication method',
          {
            multiline: true,
            examples: 'API key + token, OAuth2 refresh token flow, basic username/password',
          }
        )
      : answers.authMethod;

    answers.credentials = await askIfMissingArray(
      rl,
      seed.credentials,
      'credentials',
      '8) Required credential fields (names only).',
      {
        multiline: false,
        examples: formatExamples(patterns.credentials, DEFAULT_COMMON.credentials, 10),
      }
    );

    answers.objectsAndEntities = await askIfMissingArray(
      rl,
      seed.objectsAndEntities,
      'objectsAndEntities',
      '9) Source and target objects/entities to sync',
      {
        multiline: true,
        examples: formatExamples(patterns.entities, DEFAULT_COMMON.entities, 10),
      }
    );

    answers.fieldMappings = await askIfMissingArray(
      rl,
      seed.fieldMappings,
      'fieldMappings',
      '10) Field mapping examples (one per line, e.g. shopifyOrder.id -> priorityOrder.ExternalOrderId)',
      {
        multiline: true,
        examples: `${formatExamples(patterns.mappings, DEFAULT_COMMON.mappings, 8)}\norder.id -> invoice.id`,
      }
    );

    answers.testMode = await askIfMissingText(
      rl,
      seed.testMode,
      'testMode',
      '11) What tests should be supported (dry run / mock / live)?',
      `Use existing modes: ${formatExamples(patterns.testModes, DEFAULT_COMMON.testModes)}`
    );

    answers.logsAndRunHistory = await askIfMissingText(
      rl,
      seed.logsAndRunHistory,
      'logsAndRunHistory',
      '12) Expected logs and run history requirements',
      'Queued/running/success/failed, start/end time, status, request IDs, counts, and safe error summary.'
    );

    answers.uiRequirements = await askIfMissingArray(
      rl,
      seed.uiRequirements,
      'uiRequirements',
      '13) Settings UI requirements',
      {
        multiline: true,
        examples:
          'credential fields with helper text\nTest connection button\nRun integration test button\nClear save result and errors',
      }
    );
  } finally {
    rl.close();
  }

  answers.requestedAt = nowIso();
  return answers;
}

function normalizeAnswers(rawAnswers) {
  return {
    ...rawAnswers,
    direction: normalizeDirection(rawAnswers.direction),
    connectionMethods: normalizeOpenList(rawAnswers.connectionMethods, CONNECTION_METHODS),
    authMethod: normalizeOpenList(rawAnswers.authMethod, AUTH_METHODS),
  };
}

function validateAnswers(answers, patterns) {
  const missing = [];
  for (const key of REQUIRED_QUESTION_KEYS) {
    if (key === 'direction') {
      const allowed = patterns.directions.length ? patterns.directions : DIRECTIONS;
      if (!allowed.includes(answers.direction)) {
        missing.push(`${key}: must be INBOUND, OUTBOUND, or BIDIRECTIONAL`);
      }
      continue;
    }
    if (key === 'triggers' && isMissingArray(answers[key])) {
      missing.push(`${key}: at least one trigger type is required`);
      continue;
    }
    if (
      ['connectionMethods', 'authMethod', 'credentials', 'objectsAndEntities', 'fieldMappings', 'uiRequirements'].includes(
        key
      ) &&
      isMissingArray(answers[key])
    ) {
      missing.push(`${key}: at least one entry is required`);
      continue;
    }
    if (isMissingArray(answers[key])) {
      if (typeof answers[key] === 'string') {
        missing.push(`${key}: this field is required`);
      } else {
        missing.push(`${key}: at least one value required`);
      }
    } else if (!isClearText(answers[key]) && !Array.isArray(answers[key])) {
      missing.push(`${key}: this field must be clear text`);
    }
  }
  return { ok: missing.length === 0, missing };
}

function printGateResult(result, answers) {
  console.log('\nIntegration Design Gate');
  console.log(`Provider: ${answers.providerName || '<missing>'}`);
  console.log(`Business goal: ${answers.businessGoal || '<missing>'}`);
  console.log(`Direction: ${answers.direction || '<missing>'}`);
  console.log(`Source -> Target: ${answers.sourceSystem || '<missing>'} -> ${answers.targetSystem || '<missing>'}`);
  console.log(`Triggers: ${(answers.triggers || []).join(', ') || '<missing>'}`);
  console.log(`Connect methods: ${(answers.connectionMethods || []).join(', ') || '<missing>'}`);
  console.log(`Auth: ${(answers.authMethod || []).join(', ') || '<missing>'}`);

  if (result.ok) {
    console.log('\nSTATUS: READY_TO_BUILD');
    console.log('All integration requirements are clear. Safe to continue.');
  } else {
    console.log('\nSTATUS: BLOCKED');
    console.log('Missing or unclear items:');
    for (const item of result.missing) {
      console.log(`- ${item}`);
    }
    console.log('\nKeep answering only the missing questions; the gate runs until everything is clear.');
  }
}

function persistBlueprint(answers) {
  const folder = path.resolve(process.cwd(), 'local-data', 'integration-blueprints');
  const file = `integration-gate-${(answers.providerName || 'integration').replace(/[^a-zA-Z0-9-_]/g, '-')}.json`;
  fs.mkdirSync(folder, { recursive: true });
  const outputPath = path.join(folder, file);
  fs.writeFileSync(outputPath, JSON.stringify(answers, null, 2), 'utf8');
  return outputPath;
}

async function run() {
  const patterns = loadIntegrationUsagePatterns();
  const { prompt, saveToFile } = parsePromptArgs(process.argv);
  const seed = parseSeedFromPrompt(prompt, patterns);
  if (prompt) {
    console.log('Loaded prompt into gate seed; checking for missing required fields.');
  }
  const raw = await collectAnswers(seed, patterns);
  const answers = normalizeAnswers(raw);
  const result = validateAnswers(answers, patterns);

  printGateResult(result, answers);

  if (result.ok && saveToFile) {
    const outputPath = persistBlueprint(answers);
    console.log(`\nSaved integration blueprint: ${outputPath}`);
  }

  if (result.ok) {
    console.log('\n--- begin integration-gate-output ---');
    console.log(JSON.stringify(answers, null, 2));
    console.log('--- end integration-gate-output ---');
    return;
  }

  process.exitCode = 1;
}

run().catch((error) => {
  console.error('[integration-gate] failed:', error?.message || error);
  process.exitCode = 1;
});
