import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/handler.js';

const logger = { info() {}, warn() {}, error() {}, debug() {} };

const baseConfig = {
  credentials: {
    PRIORITY_ODATA_BASE_URL: 'https://priority.example.test/odata/Priority/tabula.ini/roihd',
    PRIORITY_BASIC_USERNAME: 'apiweb',
    PRIORITY_BASIC_PASSWORD: 'secret',
  },
};

const fixtures = {
  TRANSORDER_q: {
    value: [
      { TRANSORDER_Q: 'SO-10', PROJECT: 'P1', AMOUNT: 500 },
      { TRANSORDER_Q: 'SO-11', PROJECT: 'P2', AMOUNT: 200 },
    ],
  },
  BASEINVOICEREP: {
    value: [
      { BASEINVOICEREP: 'IV-1', PROJECT: 'P1', TOTALAMOUNT: 750 },
      { BASEINVOICEREP: 'IV-2', PROJECT: 'P1', TOTALAMOUNT: 250 },
      { BASEINVOICEREP: 'IV-3', PROJECT: 'P2', TOTALAMOUNT: 100 },
    ],
  },
  BASEINVOICEREPSON: {
    value: [
      { BASEINVOICEREP: 'IV-1', PROJECT: 'P1', QTY: 1, LINEAMOUNT: 750 },
      { BASEINVOICEREP: 'IV-2', PROJECT: 'P2', QTY: 2, LINEAMOUNT: 250 },
    ],
  },
};

test('aggregates sales and project insights in test mode', async () => {
  const result = await handler({
    id: 'local-insights-test',
    mode: 'test',
    topN: 2,
    payload: {
      transorder: [
        { TRANSORDER_Q: 'SO-10', PROJECT: 'P1', AMOUNT: 500 },
        { TRANSORDER_Q: 'SO-11', PROJECT: 'P2', AMOUNT: 200 },
      ],
      baseinvoicerep: [
        { BASEINVOICEREP: 'IV-1', PROJECT: 'P1', TOTALAMOUNT: 750 },
        { BASEINVOICEREP: 'IV-2', PROJECT: 'P2', TOTALAMOUNT: 250 },
      ],
    },
  }, {
    logger,
    config: baseConfig,
    mocks: fixtures,
  });

  assert.equal(result.success, true);
  assert.equal(result.summary.totals.totalSalesOrders, 2);
  assert.equal(result.summary.totals.totalInvoiceCount, 2);
  assert.equal(result.summary.topProjects.length, 2);
  assert.equal(result.summary.topProjects[0].project, 'P1');
});

test('dry_run skips live calls and uses payload as-is', async () => {
  const result = await handler({
    id: 'local-insights-dry-run',
    mode: 'dry_run',
    payload: {
      transorder: [{ TRANSORDER_Q: 'SO-1' }],
      baseinvoicerep: [{ BASEINVOICEREP: 'IV-1' }],
      baseinvoicerepson: [{ BASEINVOICEREP: 'IV-1' }],
    },
  }, {
    logger,
    config: baseConfig,
    mocks: {},
  });

  assert.equal(result.success, true);
  assert.equal(result.transorderCount, 1);
  assert.equal(result.baseinvoicerepCount, 1);
  assert.equal(result.baseinvoicerepsonCount, 1);
  assert.equal(result.note.includes('Dry run mode'), true);
});
