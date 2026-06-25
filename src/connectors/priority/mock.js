module.exports = {
  async getInventory({ items } = {}) {
    return {
      success: true,
      mocked: true,
      items: items || [
        { sku: 'SKU-100', quantity: 14, warehouse: 'MAIN' },
        { sku: 'SKU-200', quantity: 0, warehouse: 'MAIN' },
        { sku: 'SKU-300', quantity: 7, warehouse: 'NORTH' },
      ],
    };
  },

  async createOrder(order) {
    return { success: true, mocked: true, priorityOrderId: `mock-priority-order-${order?.orderNumber || 'unknown'}`, request: order };
  },

  async createQuote(quote) {
    return { success: true, mocked: true, priorityQuoteId: `mock-priority-quote-${quote?.email || 'unknown'}`, request: quote };
  },

  async getCustomerBalance({ customerId }) {
    return { success: true, mocked: true, customerId, balance: 0, currency: 'ILS' };
  },

  async testConnection() {
    return { success: true, message: 'Mock Priority connection always succeeds.' };
  },
};
