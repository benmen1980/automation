import { ProviderError } from './errors.js';

export function createPriorityClient({ credentials = {}, mocks = {}, fetchImpl = globalThis.fetch } = {}) {
  const baseUrl = credentials.PRIORITY_BASE_URL || credentials.PRIORITY_API_URL;
  const apiKey = credentials.PRIORITY_API_KEY;

  async function request(path, { method = 'GET', body } = {}) {
    if (mocks[path]) return mocks[path];
    if (!baseUrl) throw new ProviderError('Priority', 'Missing PRIORITY_BASE_URL');
    if (!fetchImpl) throw new ProviderError('Priority', 'No fetch implementation available');

    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new ProviderError('Priority', `HTTP ${response.status}`, { status: response.status, data });
    }
    return data;
  }

  return {
    createQuote: (quote) => request('/quotes', { method: 'POST', body: quote }),
    createOrder: (order) => request('/orders', { method: 'POST', body: order }),
    getInventory: (query) => request('/inventory', { method: 'POST', body: query }),
  };
}
