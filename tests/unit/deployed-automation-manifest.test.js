const { createStore, digest, displayedManifest } = require('../../src/core/deployed-automation-manifest');

const automationId = 'aut_0000000000000001';
const body = (version) => JSON.stringify({ automation_id: automationId, version });
const failure = (status) => Object.assign(new Error('S3 error'), { $metadata: { httpStatusCode: status } });

function memoryStore() {
  const objects = new Map();
  const client = { send: jest.fn(async (command) => {
    const input = command.input;
    const existing = objects.get(input.Key);
    if (command.constructor.name === 'GetObjectCommand') {
      if (!existing) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => existing.body }, ETag: existing.etag };
    }
    if ((input.IfNoneMatch && existing) || (input.IfMatch && input.IfMatch !== existing?.etag)) throw failure(412);
    objects.set(input.Key, { body: input.Body, etag: digest(input.Body) });
    return {};
  }) };
  return { ...createStore({ bucket: 'test', client }), objects, client };
}

const candidate = (order, version = '1.2.13') => ({
  automationId, body: body(version), order, deploymentId: `build:${order}`,
  commitSha: `commit-${order}`, codeSha256: `code-${order}`, verifyDeployment: jest.fn(async () => {}),
});

test('publishes the exact file and a pointer without another version number', async () => {
  const store = memoryStore();
  const input = candidate(10);
  input.body += '\n';
  const pointer = await store.publish(input);
  expect(store.objects.get(pointer.manifestKey).body).toBe(input.body);
  expect(pointer).not.toHaveProperty('version');
  expect(await store.read(automationId)).toEqual(JSON.parse(input.body));
});

test('failed deployment verification preserves the last successfully deployed version', async () => {
  const store = memoryStore();
  await store.publish(candidate(10, '1.2.12'));
  await expect(store.publish({ ...candidate(20), verifyDeployment: async () => { throw new Error('Lambda failed'); } })).rejects.toThrow('Lambda failed');
  expect((await store.read(automationId)).version).toBe('1.2.12');
});

test('a replaced Lambda detected just before pointer publication leaves the old version visible', async () => {
  const store = memoryStore();
  await store.publish(candidate(10, '1.2.12'));
  const verifyDeployment = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('Lambda replaced'));
  await expect(store.publish({ ...candidate(20), verifyDeployment })).rejects.toThrow('Lambda replaced');
  expect((await store.read(automationId)).version).toBe('1.2.12');
});

test('late and duplicate synchronization cannot replace a newer deployment', async () => {
  const store = memoryStore();
  await store.publish(candidate(20));
  await expect(store.publish(candidate(10, '1.2.12'))).rejects.toThrow('Stale');
  const before = JSON.stringify([...store.objects]);
  await store.publish(candidate(20));
  expect(JSON.stringify([...store.objects])).toBe(before);
});

test('intentional rollback has a new deployment order and can publish a lower version', async () => {
  const store = memoryStore();
  await store.publish(candidate(10));
  await store.publish(candidate(20, '1.2.12'));
  expect((await store.read(automationId)).version).toBe('1.2.12');
});

test('conditional write prevents a late publisher winning a race, even for identical manifest contents', async () => {
  const store = memoryStore();
  await store.publish(candidate(10));
  const normalSend = store.client.send.getMockImplementation();
  let raced = false;
  store.client.send.mockImplementation(async (command) => {
    if (!raced && command.constructor.name === 'PutObjectCommand' && command.input.Key.endsWith('/current.json')) {
      raced = true;
      await store.publish(candidate(30));
    }
    return normalSend(command);
  });
  await expect(store.publish(candidate(20, '1.2.12'))).rejects.toThrow('Stale');
  expect((await store.current(automationId)).pointer.order).toBe(30);
  expect((await store.read(automationId)).version).toBe('1.2.13');
});

test('a failed pointer write can be retried without changing the deployment identity', async () => {
  const store = memoryStore();
  const normalSend = store.client.send.getMockImplementation();
  let fail = true;
  store.client.send.mockImplementation(async (command) => {
    if (fail && command.constructor.name === 'PutObjectCommand' && command.input.Key.endsWith('/current.json')) throw failure(503);
    return normalSend(command);
  });
  await expect(store.publish(candidate(10))).rejects.toThrow('S3 error');
  expect(await store.current(automationId)).toBeNull();
  fail = false;
  await store.publish(candidate(10));
  expect((await store.read(automationId)).version).toBe('1.2.13');
});

test('missing, inaccessible and corrupt manifests never silently fall back to source versions', async () => {
  const store = memoryStore();
  await expect(store.read(automationId)).rejects.toThrow('No successful deployment');
  const pointer = await store.publish(candidate(10));
  store.objects.get(pointer.manifestKey).body = body('9.9.9');
  await expect(store.read(automationId)).rejects.toThrow('checksum');
  store.client.send.mockRejectedValue(failure(403));
  await expect(store.read(automationId)).rejects.toThrow('S3 error');
});

test('local execution keeps using the source file', async () => {
  const previous = process.env.AUTOMATION_MANIFEST_BUCKET;
  delete process.env.AUTOMATION_MANIFEST_BUCKET;
  try {
    const manifest = JSON.parse(body('1.2.13'));
    expect(await displayedManifest(manifest)).toBe(manifest);
  } finally {
    if (previous !== undefined) process.env.AUTOMATION_MANIFEST_BUCKET = previous;
  }
});
