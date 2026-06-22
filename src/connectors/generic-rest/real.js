/**
 * Generic REST connector for integrations that just need to call an
 * arbitrary third-party HTTP API (e.g. stock-sync polling an inventory
 * API). Credentials supply the base URL + auth; the handler supplies the
 * path/method/body per call.
 */
module.exports = {
  async request({ method = 'GET', path = '', body, headers = {} }, credentials) {
    const { API_BASE_URL, API_KEY } = credentials;
    if (!API_BASE_URL) {
      throw new Error('generic-rest connector requires an API_BASE_URL credential.');
    }

    const url = new URL(path, API_BASE_URL).toString();
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      throw new Error(`generic-rest request failed (${response.status}): ${text}`);
    }

    return { success: true, mocked: false, status: response.status, data: parsed };
  },

  async testConnection(credentials) {
    const { API_BASE_URL } = credentials;
    if (!API_BASE_URL) return { success: false, message: 'Missing API_BASE_URL.' };
    try {
      const response = await fetch(API_BASE_URL, { method: 'GET' });
      return { success: response.ok, message: `Provider responded with status ${response.status}.` };
    } catch (err) {
      return { success: false, message: `Connection failed: ${err.message}` };
    }
  },
};
