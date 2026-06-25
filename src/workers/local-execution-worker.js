require('dotenv').config();
const { runExecutionJob } = require('../core/execution-runner');
const prisma = require('../db/client');

async function main() {
  const executionId = process.argv[2];
  if (!executionId) throw new Error('Usage: node src/workers/local-execution-worker.js <executionId>');
  const execution = await runExecutionJob(executionId);
  process.stdout.write(JSON.stringify({ executionId, status: execution.status }));
}

main()
  .catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
