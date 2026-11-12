jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../src/app', () => ({ listen: jest.fn() }));
jest.mock('../../src/core/scheduler', () => ({ start: jest.fn() }));
jest.mock('../../src/core/execution-telemetry', () => ({ startWatchdog: jest.fn() }));

beforeEach(() => { jest.resetModules(); jest.clearAllMocks(); });

test('server starts without scheduled runs or watchdog writes in this release', () => {
  require('../../src/server');
  expect(require('../../src/app').listen).toHaveBeenCalled();
  expect(require('../../src/core/scheduler').start).not.toHaveBeenCalled();
  expect(require('../../src/core/execution-telemetry').startWatchdog).not.toHaveBeenCalled();
});

test('watchdog can start without starting scheduled automations', () => {
  const policy = require('../../config/deployment-safety.json');
  try {
    policy.watchdogEnabled = true;
    require('../../src/server');
    expect(require('../../src/core/execution-telemetry').startWatchdog).toHaveBeenCalledTimes(1);
    expect(require('../../src/core/scheduler').start).not.toHaveBeenCalled();
  } finally { policy.watchdogEnabled = false; }
});

test('scheduler can start without starting the watchdog', async () => {
  const policy = require('../../config/deployment-safety.json');
  try {
    policy.schedulerEnabled = true;
    require('../../src/server');
    await Promise.resolve();
    expect(require('../../src/core/scheduler').start).toHaveBeenCalledTimes(1);
    expect(require('../../src/core/execution-telemetry').startWatchdog).not.toHaveBeenCalled();
  } finally { policy.schedulerEnabled = false; }
});
