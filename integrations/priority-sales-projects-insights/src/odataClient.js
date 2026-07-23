import { IntegrationError, ProviderError } from '@automation/shared';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TOP = 500;

function encodeBasicAuth(username = '', password = '') {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

function normalizePayload(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.d?.results)) return payload.d.results;
  if (Array.isArray(payload)) return payload;
  return [];
}

function toRequestUrl(baseUrl, entity, odataQuery = {}) {
  const url = new URL(entity, `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}`);
  if (odataQuery.top) url.searchParams.set('$top', String(odataQuery.top));
  if (odataQuery.select) url.searchParams.set('$select', odataQuery.select);
  if (odataQuery.filter) url.searchParams.set('$filter', odataQuery.filter);
  if (odataQuery.orderby) url.searchParams.set('$orderby', odataQuery.orderby);
  return url.toString();
}

export function buildPriorityOdataHeaders(credentials = {}) {
  if (!credentials) return {};
  const explicit = credentials.PRIORITY_ODATA_AUTH_HEADER || credentials.PRIORITY_AUTH_HEADER;
  const username = credentials.PRIORITY_BASIC_USERNAME;
  const password = credentials.PRIORITY_BASIC_PASSWORD;
  const auth = explicit || (username && password ? encodeBasicAuth(username, password) : null);

  if (!auth) {
    throw new IntegrationError('Missing OData auth credentials', {
      required: ['PRIORITY_ODATA_AUTH_HEADER', 'PRIORITY_BASIC_USERNAME', 'PRIORITY_BASIC_PASSWORD'],
    });
  }

  return {
    Authorization: auth,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export function extractRows(payload) {
  return normalizePayload(payload);
}

export async function fetchEntity({
  baseUrl,
  entity,
  credentials,
  fetchImpl = globalThis.fetch,
  query = {},
  mocks = null,
}) {
  if (mocks?.[entity]) return normalizePayload(mocks[entity]);
  if (!baseUrl) throw new IntegrationError('Missing PRIORITY_ODATA_BASE_URL.');
  const headers = buildPriorityOdataHeaders(credentials);
  const url = toRequestUrl(baseUrl, entity, {
    top: query.top || DEFAULT_TOP,
    select: query.select,
    filter: query.filter,
    orderby: query.orderby,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const bodyText = await response.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    if (!response.ok) {
      throw new ProviderError('Priority OData', `HTTP ${response.status}`, {
        status: response.status,
        url,
        response: body,
      });
    }
    return extractRows(body);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new IntegrationError('Priority OData fetch timeout', { entity, timeoutMs: DEFAULT_TIMEOUT_MS });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const DEFAULT_ENTITY_QUERIES = {
  TRANSORDER_q: {
    top: 5000,
    select: [
      'TRANSORDER_Q', 'SALESORDERNUM', 'ORDERDATE', 'CUSTOMER', 'PROJECT',
      'AMOUNT', 'TOTALAMOUNT', 'NETAMOUNT', 'ORDDAT', 'CUSTNAME',
    ].filter(Boolean).join(','),
  },
  BASEINVOICEREP: {
    top: 5000,
    select: [
      'BASEINVOICEREP', 'INVNUMBER', 'INVDATE', 'CUSTOMER', 'PROJECT', 'TOTAL',
      'TOTALAMOUNT', 'NETAMOUNT', 'DOCSTATUS',
    ].filter(Boolean).join(','),
  },
  BASEINVOICEREPSON: {
    top: 5000,
    select: [
      'BASEINVOICEREPSON', 'BASEINVOICEREP', 'ITEM', 'PROJECT', 'QTY', 'PRICE', 'LINEAMOUNT',
      'PROJECT_ID', 'PROJNO',
    ].filter(Boolean).join(','),
  },
};
