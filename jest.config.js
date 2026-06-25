module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/test-env.js'],
  globalSetup: '<rootDir>/tests/setup/global-setup.js',
  globalTeardown: '<rootDir>/tests/setup/global-teardown.js',
  testPathIgnorePatterns: ['/node_modules/', '/frontend/', '/integrations/'],
  testTimeout: 15000,
  verbose: true,
};
