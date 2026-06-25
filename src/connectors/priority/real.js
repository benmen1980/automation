function buildBasicAuth(credentials) {
  if (credentials.PRIORITY_AUTH_HEADER) return credentials.PRIORITY_AUTH_HEADER;
  const username = credentials.PRIORITY_BASIC_USERNAME;
  const password = credentials.PRIORITY_BASIC_PASSWORD;
  if (!username || !password) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function requestPriority({ url, path, method = 'GET', body }, credentials) {
  const targetUrl = url || `${credentials.PRIORITY_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const authHeader = buildBasicAuth(credentials) || (credentials.PRIORITY_API_KEY ? `Bearer ${credentials.PRIORITY_API_KEY}` : null);
  if (!targetUrl || !authHeader) {
    throw new Error('Priority connector requires a Priority URL and authentication credentials.');
  }

  const response = await fetch(targetUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }
  }

  if (!response.ok) throw new Error(`Priority API error (${response.status}): ${JSON.stringify(data)}`);
  return data || {};
}

module.exports = {
  async getInventory(input = {}, credentials) {
    if (credentials.PRIORITY_INVENTORY_URL || input.endpointUrl) {
      const data = await requestPriority({ url: input.endpointUrl || credentials.PRIORITY_INVENTORY_URL, method: 'GET', body: input.requestBody }, credentials);
      return { success: true, mocked: false, items: data.value || data.items || data, raw: data };
    }

    const data = await requestPriority({ path: 'inventory' }, credentials);
    return { success: true, mocked: false, items: data.items || data.value || data, raw: data };
  },

  async createOrder(order, credentials) {
    const data = await requestPriority({ path: 'orders', method: 'POST', body: order }, credentials);
    return { success: true, mocked: false, raw: data };
  },

  async createQuote(quote, credentials) {
    const data = await requestPriority({ path: 'quotes', method: 'POST', body: quote }, credentials);
    return { success: true, mocked: false, raw: data };
  },

  async getCustomerBalance(input, credentials) {
    const data = await requestPriority({ path: `customers/${input.customerId}/balance` }, credentials);
    return { success: true, mocked: false, ...data };
  },

  async testConnection(credentials) {
    const probeUrl = credentials.PRIORITY_TEST_URL;
    const probePath = credentials.PRIORITY_TEST_PATH;
    if (probeUrl || probePath) {
      try {
        await requestPriority({ url: probeUrl, path: probePath || '', method: 'GET' }, credentials);
        return { success: true, message: 'Priority test endpoint connection successful.' };
      } catch (err) {
        return { success: false, message: `Priority test endpoint failed: ${err.message}` };
      }
    }

    if (credentials.PRIORITY_INVENTORY_URL && buildBasicAuth(credentials)) {
      return { success: true, message: 'Priority configuration present; live probe not configured. Set PRIORITY_TEST_URL for an actual safe test request.' };
    }
    if (credentials.PRIORITY_API_URL && credentials.PRIORITY_API_KEY) {
      return { success: true, message: 'Priority configuration present; live probe not configured. Set PRIORITY_TEST_PATH or PRIORITY_TEST_URL for an actual safe test request.' };
    }
    return { success: false, message: 'Missing Priority URL or authentication credentials.' };
  },
};
