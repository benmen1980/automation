const fs = require('fs');
const crypto = require('crypto');
const { deploy } = require('../../scripts/deploy-lambda-integration');

const env = { CODEBUILD_BUILD_SUCCEEDING: '1', INTEGRATION_NAME: 'example',
  CODEBUILD_BUILD_ID: 'example:build-1', CODEBUILD_START_TIME: '100', CODEBUILD_RESOLVED_SOURCE_VERSION: 'abc' };
const manifest = JSON.stringify({ automation_id: 'aut_0000000000000001', version: '1.2.13', connections: { worker_adapter: { package: 'integrations/example' } } });

function setup() {
  const bytes = Buffer.from('actual ZIP bytes');
  jest.spyOn(fs, 'readFileSync').mockImplementation(() => bytes);
  const actual = { LastUpdateStatus: 'Successful', State: 'Active', RevisionId: 'revision-2',
    CodeSha256: crypto.createHash('sha256').update(bytes).digest('base64') };
  const runAws = jest.fn((args) => {
    if (args[1] === 'update-function-code') return { RevisionId: 'revision-2' };
    return actual;
  });
  const store = { current: jest.fn(async () => null), publish: jest.fn(async (input) => { await input.verifyDeployment(); return input; }) };
  const readZipFile = jest.fn((zip, file) => file === 'automation.json' ? manifest : JSON.stringify({ commitSha: 'abc' }));
  return { env, actual, runAws, store, readZipFile };
}

afterEach(() => jest.restoreAllMocks());

test('publishes the manifest extracted from the ZIP only after waiting for and verifying Lambda', async () => {
  const options = setup();
  const result = await deploy(options);
  expect(result.body).toBe(manifest);
  expect(options.runAws.mock.calls.map(([args]) => args[1])).toEqual([
    'get-function-configuration', 'update-function-code', 'wait', 'get-function-configuration', 'get-function-configuration',
  ]);
  expect(options.store.publish).toHaveBeenCalledTimes(1);
});

test('failed build blocks both deployment and publication', async () => {
  const options = setup();
  await expect(deploy({ ...options, env: { ...env, CODEBUILD_BUILD_SUCCEEDING: '0' } })).rejects.toThrow('Build did not succeed');
  expect(options.runAws).not.toHaveBeenCalled();
  expect(options.store.publish).not.toHaveBeenCalled();
});

test.each(['update-function-code', 'wait'])('%s failure never publishes', async (operation) => {
  const options = setup();
  options.runAws.mockImplementation((args) => {
    if (args[1] === operation) throw new Error('AWS failure');
    return options.actual;
  });
  await expect(deploy(options)).rejects.toThrow('AWS failure');
  expect(options.store.publish).not.toHaveBeenCalled();
});

test.each([{ LastUpdateStatus: 'Failed' }, { CodeSha256: 'another artifact' }])('unverified Lambda state %j never publishes', async (change) => {
  const options = setup();
  Object.assign(options.actual, change);
  await expect(deploy(options)).rejects.toThrow('no longer matches');
  expect(options.store.publish).not.toHaveBeenCalled();
});

test('uses the completed revision and rejects changes after that verification', async () => {
  const options = setup();
  options.actual.RevisionId = 'completed-revision';
  const result = await deploy(options);
  options.actual.RevisionId = 'later-revision';
  await expect(result.verifyDeployment()).rejects.toThrow('no longer matches');
});

test('an older retry cannot deploy over a newer successful release', async () => {
  const options = setup();
  options.store.current.mockResolvedValue({ pointer: { deploymentId: 'newer-build', order: 200 } });
  await expect(deploy(options)).rejects.toThrow('Stale');
  expect(options.runAws).not.toHaveBeenCalled();
});

test('synchronization retry verifies the running artifact without redeploying Lambda', async () => {
  const options = setup();
  await deploy({ ...options, syncOnly: true });
  expect(options.runAws.mock.calls.every(([args]) => args[1] === 'get-function-configuration')).toBe(true);
  expect(options.store.publish).toHaveBeenCalledTimes(1);
});

test('reusing an existing deployment identity with a different artifact is blocked before Lambda changes', async () => {
  const options = setup();
  options.store.current.mockResolvedValue({ pointer: { deploymentId: env.CODEBUILD_BUILD_ID, order: 100, codeSha256: 'old ZIP' } });
  await expect(deploy(options)).rejects.toThrow('different contents');
  expect(options.runAws).not.toHaveBeenCalled();
});
