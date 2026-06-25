function capture(action, request) {
  return { success: true, mocked: true, captured: true, action, request };
}

module.exports = {
  async updateInventory({ items }) {
    return capture('shopify.updateInventory', {
      method: 'POST',
      url: 'mock://shopify/admin/api/inventory_levels/set.json',
      body: { items },
    });
  },

  async testConnection() {
    return { success: true, message: 'Mock Shopify connection always succeeds.' };
  },
};
