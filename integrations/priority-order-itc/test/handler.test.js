import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/handler.js';
import { safeResponseSummary, sendTemplateMessage } from '../src/itcClient.js';
import { generateSalesOrderPrintUrl } from '../src/priorityWebSdkClient.js';
import { archivePriorityDocument } from '../src/serverDocumentClient.js';

function context(overrides = {}) {
  const calls = [];
  return {
    calls,
    logger: { info(message, metadata) { calls.push({ message, metadata }); }, error() {}, warn() {}, debug() {} },
    config: {
      credentials: {
        ITC_TEMPLATE_MESSAGE_URL: 'https://itc.example.test/api/v2/msg/sendMsg/tempMsg/template-test-id',
        ITC_BEARER_TOKEN: 'test-worker-token',
        ITC_CHANNEL_ID: 'whatsapp:+97246960480',
        PRIORITY_WEB_SDK_URL: 'https://priority.example.test/wcf/wcf/Service.svc',
        PRIORITY_WEB_SDK_TABULAINI: 'tabula.ini',
        PRIORITY_WEB_SDK_LANGUAGE: 3,
        PRIORITY_WEB_SDK_COMPANY: 'demo',
        PRIORITY_WEB_SDK_APPNAME: 'automation-test',
        PRIORITY_WEB_SDK_USERNAME: 'api-user',
        PRIORITY_WEB_SDK_PASSWORD: 'test-priority-password',
        PRIORITY_WEB_SDK_DEVICENAME: '',
        PRIORITY_WEB_SDK_ORDER_SORT_OPTION: 'By Order Number',
      },
    },
    mocks: {},
    ...overrides,
  };
}

const job = {
  id: 'job-1',
  mode: 'test',
  triggerType: 'manual',
  payload: { ORDERS: { ORDNAME: 'SO26000001', ZANA_CUSTDES: 'Customer', ZANA_PHONENUM: '050-757-3753' } },
};

test('test mode maps ORDERS to ITC without a network call and keeps logs safe', async () => {
  const ctx = context({ fetchImpl: () => { throw new Error('network must not run'); } });
  const result = await handler(job, ctx);
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(result.requestSummary.body.clientName.endsWith('3753'), true);
  assert.deepEqual(result.requestSummary.body.variables[1].text, {
    type: 'redacted',
    reason: 'sensitive personal data',
  });
  assert.equal(result.requestSummary.body.variables[0].text, job.payload.ORDERS.ZANA_CUSTDES);
  assert.deepEqual(result.requestSummary.body.variables[2].text, {
    type: 'redacted',
    reason: 'server-hosted Priority document URL',
    available: true,
    host: 'automation.example.test',
    protocol: 'https:',
  });
  const logs = JSON.stringify(ctx.calls);
  assert.equal(logs.includes('SO26000001'), false);
  assert.equal(logs.includes('+972507573753'), false);
  assert.equal(logs.includes('test-worker-token'), false);
  assert.equal(logs.includes('test-priority-password'), false);
});

test('an unknown execution mode fails closed without calling Priority or ITC', async () => {
  let priorityCalls = 0;
  let itcCalls = 0;
  const ctx = context({
    priorityClient: {
      generateSalesOrderPrintUrl: async () => {
        priorityCalls += 1;
        return 'https://priority.example.test/netfiles/should-not-exist.pdf';
      },
    },
    fetchImpl: async () => {
      itcCalls += 1;
      throw new Error('ITC must not run');
    },
  });

  await assert.rejects(handler({ ...job, mode: 'typo' }, ctx), /Unsupported execution mode/);
  assert.equal(priorityCalls, 0);
  assert.equal(itcCalls, 0);
});

test('live mode posts the exact requested body', async () => {
  let request;
  let inFlightMarked = false;
  const ctx = context({
    priorityClient: {
      generateSalesOrderPrintUrl: async () => 'https://priority.example.test/netfiles/SO26000001.pdf',
    },
    archiveDocument: async (sourceUrl) => {
      assert.equal(sourceUrl, 'https://priority.example.test/netfiles/SO26000001.pdf');
      return 'https://automation.example.test/documents/priority-orders/exec-1.pdf';
    },
    beforeProviderDelivery: async () => {
      inFlightMarked = true;
    },
    fetchImpl: async (url, options) => {
      assert.equal(inFlightMarked, true);
      request = { url, options };
      return { ok: true, status: 202, text: async () => JSON.stringify({ messageId: 'itc-1', status: 'queued' }) };
    },
  });
  const result = await handler({ ...job, mode: 'live' }, ctx);
  assert.equal(inFlightMarked, true);
  assert.equal(result.providerMessageId, 'itc-1');
  assert.equal(request.url, 'https://itc.example.test/api/v2/msg/sendMsg/tempMsg/template-test-id');
  assert.equal(request.options.headers.Authorization, 'Bearer test-worker-token');
    const requestBody = JSON.parse(request.options.body);
  assert.equal(requestBody.clientName, '+972507573753');
  assert.equal(requestBody.msgType, 'whatsapp');
  assert.equal(requestBody.channelId, 'whatsapp:+97246960480');
  assert.equal(requestBody.variables[0].text, job.payload.ORDERS.ZANA_CUSTDES);
  assert.equal(requestBody.variables[1].text, job.payload.ORDERS.ORDNAME);
  assert.equal(requestBody.variables[2].text, 'https://automation.example.test/documents/priority-orders/exec-1.pdf');
});

test('Priority client runs WWWSHOWORDER with ORDNAME and the configured sort option', async () => {
  const calls = [];
  const cancel = async () => calls.push(['cancel']);
  const documentOptions = async (...args) => {
    calls.push(['documentOptions', ...args]);
    return {
      type: 'displayUrl',
      Urls: [{ url: '/netfiles/SO26000001.pdf' }],
      proc: { cancel },
    };
  };
  const inputFields = async (...args) => {
    calls.push(['inputFields', ...args]);
    return {
      type: 'documentOptions',
      formats: [{ format: -109, title: 'W/Extended Part Desc.', selected: 1 }],
      proc: { documentOptions, cancel },
    };
  };
  const choose = async (...args) => {
    calls.push(['choose', ...args]);
    return {
      type: 'Choose',
      Search: {
        ChooseLine: {
          0: {
            string1: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ',
            string2: '',
            retval: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ',
          },
        },
      },
      proc: { inputFields, cancel },
    };
  };
  const sdk = {
    async login(config) { calls.push(['login', config]); },
    async procStart(...args) {
      calls.push(['procStart', ...args]);
      return {
        type: 'inputFields',
        input: {
          EditFields: [
            { field: 1, operator: 0, value: '' },
            { field: 2, operator: 0, value: 'By Order Number', readonly: 1 },
          ],
        },
        proc: { choose, inputFields, cancel },
      };
    },
  };

  const url = await generateSalesOrderPrintUrl('SO26000001', context().config.credentials, { sdk });
  assert.equal(url, 'https://priority.example.test/netfiles/SO26000001.pdf');
  assert.deepEqual(calls.find(([name]) => name === 'procStart'), ['procStart', 'WWWSHOWORDER', 'P', null]);
  assert.deepEqual(calls.find(([name]) => name === 'choose'), [
    'choose',
    2,
    '',
    {
      ChooseFields: [
        { field: 1, value: 'SO26000001' },
        { field: 2, value: '' },
      ],
    },
  ]);
  assert.deepEqual(calls.find(([name]) => name === 'inputFields'), [
    'inputFields',
    1,
    {
      EditFields: [
        { field: 1, op: 0, value: 'SO26000001', op2: 0, value2: '' },
        { field: 2, op: 0, value: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ', op2: 0, value2: '' },
      ],
    },
  ]);
  assert.deepEqual(calls.find(([name]) => name === 'documentOptions'), [
    'documentOptions',
    1,
    -109,
    1,
  ]);
  assert.equal(calls.some(([name]) => name === 'cancel'), true);
});

test('Priority client reports login as the failed stage without exposing credentials or order data', async () => {
  const sdk = {
    async login() {
      throw new Error(
        'login rejected password=test-priority-password for api-user SO26000001?access_token=secret-access&code=secret-code Authorization: Basic c2VjcmV0'
      );
    },
  };

  let failure;
  try {
    await generateSalesOrderPrintUrl('SO26000001', context().config.credentials, { sdk });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.providerError?.stage, 'login');
  assert.equal(failure?.message.includes('during login'), true);
  assert.equal(failure?.message.includes('Next step:'), true);
  assert.equal(JSON.stringify(failure).includes('test-priority-password'), false);
  assert.equal(JSON.stringify(failure).includes('api-user'), false);
  assert.equal(JSON.stringify(failure).includes('SO26000001'), false);
  assert.equal(JSON.stringify(failure).includes('secret-access'), false);
  assert.equal(JSON.stringify(failure).includes('secret-code'), false);
  assert.equal(JSON.stringify(failure).includes('c2VjcmV0'), false);
});

test('Priority authentication status and error code survive safely and are terminal', async () => {
  const sdk = {
    async login() {
      const error = new Error('Unauthorized token=secret-value');
      error.statusCode = 401;
      error.code = 'AUTH_DENIED';
      error.retryable = true;
      throw error;
    },
  };

  let failure;
  try {
    await generateSalesOrderPrintUrl('SO26000001', context().config.credentials, { sdk });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.retryable, false);
  assert.equal(failure?.providerError?.httpStatus, 401);
  assert.equal(failure?.providerError?.errorCode, 'AUTH_DENIED');
  assert.equal(failure?.message.includes('HTTP 401'), true);
  assert.equal(JSON.stringify(failure).includes('secret-value'), false);
});

test('a transient Sort chooser timeout remains retryable before ITC delivery', async () => {
  const timeout = new Error('Priority network timeout');
  timeout.name = 'TimeoutError';
  const cancel = async () => {};
  const sdk = {
    async login() {},
    async procStart() {
      return {
        type: 'inputFields',
        input: {
          EditFields: [
            { field: 1, operator: 0, value: '' },
            { field: 2, operator: 0, value: 'By Order Number', readonly: 1 },
          ],
        },
        proc: {
          async choose() { throw timeout; },
          async inputFields() {},
          cancel,
        },
      };
    },
  };

  let failure;
  try {
    await generateSalesOrderPrintUrl('SO26000001', context().config.credentials, { sdk });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.providerError?.stage, 'sort-selection');
  assert.equal(failure?.retryable, true);
});

test('Priority client supports an introductory option and a non-default SearchLine sort choice', async () => {
  const calls = [];
  const cancel = async () => calls.push(['cancel']);
  const inputFields = async (_ok, data) => {
    calls.push(['inputFields', data]);
    return {
      type: 'displayUrl',
      Urls: [{ url: '/netfiles/customer-sort.pdf' }],
      proc: { cancel },
    };
  };
  const choose = async () => ({
    type: 'Choose',
    Search: {
      SearchLine: [
        { string1: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ', retval: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ' },
        { string1: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ¢׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ', retval: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ¢׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ' },
      ],
    },
    proc: { inputFields, cancel },
  });
  const inputOptions = async (...args) => {
    calls.push(['inputOptions', ...args]);
    return {
      type: 'inputFields',
      input: {
        EditFields: [
          { field: 1, operator: 0, value: '' },
          { field: 2, operator: 0, value: '', readonly: 1 },
        ],
      },
      proc: { choose, inputFields, cancel },
    };
  };
  const sdk = {
    async login() {},
    async procStart() {
      return {
        type: 'inputOptions',
        input: { Options: [{ field: 7, selected: 1, title: 'Print' }] },
        proc: { inputOptions, cancel },
      };
    },
  };
  const config = context().config.credentials;
  config.PRIORITY_WEB_SDK_ORDER_SORT_OPTION = '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ¢׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ';

  const url = await generateSalesOrderPrintUrl('SO26000001', config, { sdk });

  assert.equal(url, 'https://priority.example.test/netfiles/customer-sort.pdf');
  assert.deepEqual(calls.find(([name]) => name === 'inputOptions'), ['inputOptions', 1, 7]);
  const submitted = calls.find(([name]) => name === 'inputFields')[1];
  assert.equal(submitted.EditFields[1].value, '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ§׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ¢׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ');
});

test('malformed and non-HTTPS Priority document URLs fail at document-url stage', async () => {
  for (const reportUrl of ['http://[', 'http://priority.example.test/netfiles/order.pdf']) {
    const cancel = async () => {};
    const inputFields = async () => ({
      type: 'displayUrl',
      Urls: [{ url: reportUrl }],
      proc: { cancel },
    });
    const choose = async () => ({
      type: 'Choose',
      Search: {
        ChooseLine: {
          0: { string1: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ', retval: '׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ²ֲ¢ ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¡׳³ֲ³ײ²ֲ³׳³ג€™׳’ג‚¬ֲײ³ג€”׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ¨ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬׳’ג‚¬ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ׳³ֲ³ײ²ֲ³׳²ֲ²ײ²ֲ ׳³ֲ³ײ²ֲ³׳³ג€™׳’ג€ֲ¬ײ²ֲ' },
        },
      },
      proc: { inputFields, cancel },
    });
    const sdk = {
      async login() {},
      async procStart() {
        return {
          type: 'inputFields',
          input: {
            EditFields: [
              { field: 1, operator: 0, value: '' },
              { field: 2, operator: 0, value: 'By Order Number', readonly: 1 },
            ],
          },
          proc: { choose, inputFields, cancel },
        };
      },
    };

    let failure;
    try {
      await generateSalesOrderPrintUrl('SO26000001', context().config.credentials, { sdk });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.providerError?.stage, 'document-url');
    assert.equal(failure?.retryable, false);
  }
});

test('a Priority failure prevents any ITC request', async () => {
  let itcCalls = 0;
  const priorityError = new Error('Priority Web SDK failed during login.');
  priorityError.retryable = false;
  priorityError.providerError = { api: 'Priority Web SDK', stage: 'login' };
  const ctx = context({
    priorityClient: {
      async generateSalesOrderPrintUrl() {
        throw priorityError;
      },
    },
    fetchImpl: async () => {
      itcCalls += 1;
      throw new Error('ITC must not run');
    },
  });

  await assert.rejects(handler({ ...job, mode: 'live' }, ctx), /during login/);
  assert.equal(itcCalls, 0);
});

test('unknown string and numeric response fields are redacted', () => {
  const summary = safeResponseSummary({ id: 'itc-1', status: 'queued', recipient: 972507573753, orderNumber: 1597873, display: 'SO26000001' });
  assert.equal(summary.id, 'itc-1');
  assert.equal(summary.status, 'queued');
  assert.equal(summary.recipient.type, 'redacted');
  assert.equal(summary.orderNumber.type, 'redacted');
  assert.equal(summary.display.type, 'redacted');
});

test('allowlisted provider strings still redact token-shaped content', () => {
  const summary = safeResponseSummary({ status: 'Bearer secret-token-123', messageId: 'token=secret-value-456' });
  assert.equal(summary.status.includes('secret-token-123'), false);
  assert.equal(summary.messageId.includes('secret-value-456'), false);
  assert.equal(summary.status.includes('***REDACTED***'), true);
  assert.equal(summary.messageId.includes('***REDACTED***'), true);
});

test('provider message ID is sanitized before returning from the client', async () => {
  const result = await sendTemplateMessage(
    { clientName: '+972507573753', msgType: 'whatsapp', channelId: 'whatsapp:+97246960480', variables: [] },
    context().config.credentials,
    {
      fetchImpl: async () => ({
        ok: true,
        status: 202,
        text: async () => JSON.stringify({ messageId: 'token=secret-value-456', status: 'accepted' }),
      }),
    }
  );
  assert.equal(result.providerMessageId.includes('secret-value-456'), false);
  assert.equal(result.providerMessageId.includes('***REDACTED***'), true);
});

test('mock provider message ID is sanitized before returning from the handler', async () => {
  const ctx = context({ mocks: { itcResponse: { id: 'token=secret-value-456', status: 'Bearer secret-token-123' } } });
  const result = await handler({ ...job, mode: 'mock_output' }, ctx);
  assert.equal(result.providerMessageId.includes('secret-value-456'), false);
  assert.equal(result.providerMessageId.includes('***REDACTED***'), true);
  assert.equal(JSON.stringify(result.responseSummary).includes('secret-token-123'), false);
});
