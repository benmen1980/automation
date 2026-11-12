jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../src/app', () => ({ listen: jest.fn() }));
jest.mock('../../src/core/scheduler', () => ({ start: jest.fn() }));
jest.mock('../../src/core/execution-telemetry', () => ({ startWatchdog: jest.fn() }));

test('server starts without scheduled runs or watchdog writes in this release', () => {
  require('../../src/server');
  expect(require('../../src/app').listen).toHaveBeenCalled();
  expect(require('../../src/core/scheduler').start).not.toHaveBeenCalled();
  expect(require('../../src/core/execution-telemetry').startWatchdog).not.toHaveBeenCalled();
});
