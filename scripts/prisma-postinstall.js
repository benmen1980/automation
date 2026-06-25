/**
 * postinstall hook — generates the Prisma Client.
 *
 * Local dev: no PRISMA_SCHEMA set, so this generates against the default
 * schema.prisma (SQLite) — same behavior as plain `prisma generate` before.
 *
 * AWS (Elastic Beanstalk): set the env var
 *   PRISMA_SCHEMA=prisma/schema.postgres.prisma
 * as an EB environment property (see docs/ops/aws-testing-environment-runbook.md). `npm install` runs this
 * script during every deploy, so the client generated on the instance always
 * matches the Postgres schema instead of the local SQLite one.
 */
const { execSync } = require('child_process');

const schema = process.env.PRISMA_SCHEMA || 'prisma/schema.prisma';

console.log(`[postinstall] prisma generate --schema=${schema}`);
execSync(`npx prisma generate --schema=${schema}`, { stdio: 'inherit' });
