/**
 * Jest `setupFiles` entry - runs before each test file's own module graph
 * loads. Several core modules read process.env at require()-time
 * (src/core/auth.js throws if JWT_SECRET is missing; src/db/client.js
 * constructs PrismaClient reading DATABASE_URL; src/core/secrets.js and
 * src/core/integration-loader.js read their own env vars too), so these
 * values must exist before anything under src/ is first required.
 *
 * Uses a dedicated SQLite file and a dedicated secrets file (see
 * tests/setup/constants.js) so running the test suite never reads from or
 * writes to the developer's real local-data/dev.db or secrets.local.json.
 */
const { TEST_DATABASE_URL, TEST_SECRETS_PATH } = require('./constants');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN = '12h';
process.env.LOCAL_SECRET_KEY = 'test-only-key-not-for-prod-use!!';
process.env.LOCAL_SECRETS_PATH = TEST_SECRETS_PATH;
process.env.AUTH_MODE = 'mock';
process.env.QUEUE_MODE = 'local';
process.env.SECRETS_MODE = 'local';
process.env.SCHEDULER_MODE = 'off';
process.env.LOG_MODE = 'test'; // anything other than 'console' keeps test output quiet
process.env.INTEGRATIONS_ROOT = 'src/integrations';
