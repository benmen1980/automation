import { IntegrationError, createLogger } from '@automation/shared';
import { DEFAULT_ENTITY_QUERIES, fetchEntity } from './odataClient.js';

function coerceNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function safeRowValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function extractProjectKey(row = {}) {
  return (
    safeRowValue(row, ['PROJECT', 'ProjCode', 'PROJECTCODE', 'PROJECT_ID', 'PROJ', 'PROJECTNO', 'PROJNO'])
    || safeRowValue(row, ['ProjectCode', 'ProjectId', 'PROJECT_NUMBER', 'PROJECTNO_', 'ItemProject'])
    || safeRowValue(row, ['project', 'Project'])
    || 'UNKNOWN_PROJECT'
  );
}

function extractAmount(row = {}, keys = ['TOTAL', 'TOTALAMOUNT', 'AMOUNT', 'NETAMOUNT', 'PRICE', 'LINEAMOUNT']) {
  const raw = safeRowValue(row, [...keys, 'amount', 'Amount', 'totalAmount', 'sumAmount']);
  if (raw === null) return 0;
  return coerceNumber(raw, 0);
}

function summarizeProjects(rows = []) {
  const byProject = new Map();
  for (const row of rows) {
    const project = extractProjectKey(row);
    const current = byProject.get(project) || { project, totalAmount: 0, rowCount: 0 };
    current.totalAmount += extractAmount(row);
    current.rowCount += 1;
    byProject.set(project, current);
  }
  return Array.from(byProject.values()).map((item) => ({
    project: item.project,
    totalAmount: Number(item.totalAmount.toFixed(2)),
    rowCount: item.rowCount,
  }));
}

function enrichSalesRows(rows = []) {
  return rows.map((row) => ({
    orderId: safeRowValue(row, ['DOCID', 'ORDERID', 'TRANSORDER_Q', 'ORDERNUMBER', 'SALESORDERNUM']),
    orderDate: safeRowValue(row, ['ORDERDATE', 'ORDDAT', 'DATE']),
    customer: safeRowValue(row, ['CUSTOMER', 'CUSTOMERNAME', 'CUSTNAME']),
    project: extractProjectKey(row),
    amount: extractAmount(row),
    raw: row,
  }));
}

function enrichInvoiceRows(rows = []) {
  return rows.map((row) => ({
    invoiceId: safeRowValue(row, ['BASEINVOICEREP', 'INVNUMBER', 'DOCNUM']),
    invoiceDate: safeRowValue(row, ['INVDATE', 'DATE']),
    customer: safeRowValue(row, ['CUSTOMER', 'CUSTOMERNAME', 'CUSTNAME']),
    project: extractProjectKey(row),
    amount: extractAmount(row),
    raw: row,
  }));
}

function aggregate(rows) {
  const salesRows = Array.isArray(rows.sales) ? rows.sales : [];
  const invoiceRows = Array.isArray(rows.invoices) ? rows.invoices : [];
  const byProject = summarizeProjects([...salesRows, ...invoiceRows]);
  const sorted = byProject.sort((a, b) => b.totalAmount - a.totalAmount);
  const topProjectKeys = sorted.length > 0 ? new Set(sorted.slice(0, 10).map((item) => item.project)) : new Set();

  const totals = {
    totalSalesOrders: salesRows.length,
    totalInvoiceCount: invoiceRows.length,
    totalInvoiceAmount: invoiceRows.reduce((sum, row) => sum + extractAmount(row.raw || row), 0),
    distinctProjects: sorted.length,
    topProjects: sorted.map((item) => ({
      project: item.project,
      totalAmount: item.totalAmount,
      recordCount: item.rowCount,
      includedInTop: topProjectKeys.has(item.project),
    })),
  };

  return {
    totals,
    byProject: sorted,
  };
}

export async function handler(job = {}, context = {}) {
  const { logger = createLogger({ service: 'priority-sales-projects-insights', jobId: job.id || 'local' }), config = {}, mocks = {} } = context;
  const mode = job.mode || 'test';
  const credentials = config.credentials || {};
  const topN = Number(job.topN || credentials.PRIORITY_SALES_PROJECTS_TOP_N || 10) || 10;

  logger.info('Priority sales-projects worker started.', {
    jobId: job.id,
    mode,
    requestedTopN: topN,
    baseUrlProvided: Boolean(credentials.PRIORITY_ODATA_BASE_URL || job.baseUrl),
  });

  if (mode === 'dry_run') {
    logger.info('Dry run: skipping live calls.');
    const sales = job.payload?.transorder || [];
    const invoices = job.payload?.baseinvoicerep || [];
    const invoiceLines = job.payload?.baseinvoicerepson || [];
    return {
      success: true,
      mode,
      transorderCount: sales.length,
      baseinvoicerepCount: invoices.length,
      baseinvoicerepSONCount: invoiceLines.length,
      insights: aggregate({
        sales: sales.map((row) => ({ raw: row })),
        invoices: invoices.map((row) => ({ raw: row })),
      }),
      note: 'Dry run mode: no live Priority request performed.',
    };
  }

  const baseUrl = credentials.PRIORITY_ODATA_BASE_URL || job.baseUrl;
  if (!baseUrl) {
    throw new IntegrationError('Missing PRIORITY_ODATA_BASE_URL');
  }

  const transorderRaw = await fetchEntity({
    baseUrl,
    entity: 'TRANSORDER_q',
    credentials,
    query: {
      ...DEFAULT_ENTITY_QUERIES.TRANSORDER_q,
      top: job.top || DEFAULT_ENTITY_QUERIES.TRANSORDER_q.top,
      ...(job.transorderQuery || {}),
    },
    mocks: mocks,
  });
  const invoicesRaw = await fetchEntity({
    baseUrl,
    entity: 'BASEINVOICEREP',
    credentials,
    query: {
      ...DEFAULT_ENTITY_QUERIES.BASEINVOICEREP,
      top: job.top || DEFAULT_ENTITY_QUERIES.BASEINVOICEREP.top,
      ...(job.invoiceQuery || {}),
    },
    mocks: mocks,
  });
  const invoiceLinesRaw = await fetchEntity({
    baseUrl,
    entity: 'BASEINVOICEREPSON',
    credentials,
    query: {
      ...DEFAULT_ENTITY_QUERIES.BASEINVOICEREPSON,
      top: job.top || DEFAULT_ENTITY_QUERIES.BASEINVOICEREPSON.top,
      ...(job.invoiceLineQuery || {}),
    },
    mocks: mocks,
  });

  const transorder = enrichSalesRows(transorderRaw);
  const invoices = enrichInvoiceRows(invoicesRaw);
  const invoiceLines = invoiceLinesRaw.map((row) => ({
    invoiceId: safeRowValue(row, ['BASEINVOICEREP', 'INVNUMBER']),
    project: extractProjectKey(row),
    amount: extractAmount(row),
    quantity: coerceNumber(safeRowValue(row, ['QTY', 'QUANTITY', 'QTYORDER'])),
    raw: row,
  }));

  const allForRanking = [...transorder, ...invoices];
  const summary = aggregate({ sales: transorder, invoices });
  const projectTop = summary.byProject
    .slice(0, topN)
    .map((item) => ({ project: item.project, totalAmount: item.totalAmount, invoiceLineRows: item.rowCount }));

  logger.info('Priority sales-projects insights aggregated.', {
    transorderCount: transorder.length,
    invoiceCount: invoices.length,
    invoiceLineCount: invoiceLines.length,
    distinctProjects: summary.totals.distinctProjects,
    topProjectCount: projectTop.length,
  });

  return {
    success: true,
    mode,
    transorderCount: transorder.length,
    baseinvoicerepCount: invoices.length,
    baseinvoicerepsonCount: invoiceLines.length,
    summary: {
      totals: {
        ...summary.totals,
        topN: topN,
        totalInvoiceAmount: Number(summary.totals.totalInvoiceAmount.toFixed(2)),
      },
      topProjects: projectTop,
      allProjects: summary.byProject,
    },
    sampleSales: transorder.slice(0, 3),
    sampleInvoices: invoices.slice(0, 3),
    sampleInvoiceLines: invoiceLines.slice(0, 5),
    data: { transorder, invoices, invoiceLines },
  };
}

const safeEntityOrder = [
  { label: 'TRANSORDER_q', rowsKey: 'transorderCount' },
  { label: 'BASEINVOICEREP', rowsKey: 'baseinvoicerepCount' },
  { label: 'BASEINVOICEREPSON', rowsKey: 'baseinvoicerepsonCount' },
];

export const metadata = {
  entities: safeEntityOrder.map((entry) => entry.label),
  fieldsUsed: ['project', 'amount', 'orderId', 'invoiceId', 'customer', 'orderDate', 'invoiceDate'],
};
