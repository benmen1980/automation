module.exports = {
  async updateInventory({ items }, credentials) {
    const { SHOPIFY_API_URL, SHOPIFY_ACCESS_TOKEN } = credentials;
    if (!SHOPIFY_API_URL || !SHOPIFY_ACCESS_TOKEN) throw new Error('Shopify connector requires SHOPIFY_API_URL and SHOPIFY_ACCESS_TOKEN.');
    const response = await fetch(`${SHOPIFY_API_URL.replace(/\/$/, '')}/inventory_levels/set.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
      body: JSON.stringify({ items }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Shopify API error (${response.status}): ${JSON.stringify(data)}`);
    return { success: true, mocked: false, raw: data };
  },

  async testConnection(credentials) {
    const { SHOPIFY_API_URL, SHOPIFY_ACCESS_TOKEN } = credentials;
    if (!SHOPIFY_API_URL || !SHOPIFY_ACCESS_TOKEN) return { success: false, message: 'Missing SHOPIFY_API_URL or SHOPIFY_ACCESS_TOKEN.' };

    try {
      const response = await fetch(`${SHOPIFY_API_URL.replace(/\/$/, '')}/shop.json`, {
        method: 'GET',
        headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
      });
      return response.ok
        ? { success: true, message: 'Shopify Admin API connection successful.' }
        : { success: false, message: `Shopify Admin API responded with status ${response.status}.` };
    } catch (err) {
      return { success: false, message: `Shopify connection failed: ${err.message}` };
    }
  },
};
