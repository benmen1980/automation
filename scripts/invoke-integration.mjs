import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLogger, loadConfig, normalizeError } from '@automation/shared';

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const integrationName = process.argv[2];
if (!integrationName) {
  console.error('Usage: node scripts/invoke-integration.mjs <integration-name> --fixture fixtures/sample-job.json');
  process.exitCode = 1;
} else {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fixturePath = getArgValue('--fixture', 'fixtures/sample-job.json');
  const integrationRoot = path.join(repoRoot, 'integrations', integrationName);
  const handlerPath = path.join(integrationRoot, 'src', 'handler.js');
  const absoluteFixture = path.isAbsolute(fixturePath) ? fixturePath : path.join(integrationRoot, fixturePath);
  const job = JSON.parse(await readFile(absoluteFixture, 'utf8'));
  const { handler } = await import(pathToFileURL(handlerPath));
  const context = {
    logger: createLogger({ service: integrationName, jobId: job.id || 'local-fixture' }),
    config: loadConfig(job),
    mocks: job.mocks || {},
    status: 'running',
  };

  try {
    const result = await handler(job, context);
    console.log(JSON.stringify({ status: 'success', result }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: normalizeError(error) }, null, 2));
    process.exitCode = 1;
  }
}
