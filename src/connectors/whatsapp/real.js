/**
 * Real WhatsApp connector. Uses the integration's own credentials
 * (WHATSAPP_TOKEN, WHATSAPP_API_URL) — never environment variables
 * directly (docs/product/product-architecture-spec.md 5.5). Uses Node's built-in fetch (Node 18+), no
 * extra HTTP client dependency needed.
 */
module.exports = {
  async sendMessage({ to, message }, credentials) {
    const { WHATSAPP_TOKEN, WHATSAPP_API_URL } = credentials;
    if (!WHATSAPP_TOKEN || !WHATSAPP_API_URL) {
      throw new Error('WhatsApp connector requires WHATSAPP_TOKEN and WHATSAPP_API_URL credentials.');
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({ to, message }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`WhatsApp API error (${response.status}): ${JSON.stringify(body)}`);
    }

    return { success: true, mocked: false, providerMessageId: body.id || null, raw: body };
  },

  async testConnection(credentials) {
    const { WHATSAPP_TOKEN, WHATSAPP_API_URL } = credentials;
    if (!WHATSAPP_TOKEN || !WHATSAPP_API_URL) {
      return { success: false, message: 'Missing WHATSAPP_TOKEN or WHATSAPP_API_URL.' };
    }
    try {
      const response = await fetch(WHATSAPP_API_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      });
      return response.ok
        ? { success: true, message: 'Connection successful.' }
        : { success: false, message: `Provider responded with status ${response.status}.` };
    } catch (err) {
      return { success: false, message: `Connection failed: ${err.message}` };
    }
  },
};
