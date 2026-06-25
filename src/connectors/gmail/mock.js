module.exports = {
  async parseQuoteRequest({ email, subject, body }) {
    return {
      success: true,
      mocked: true,
      quote: {
        email,
        subject,
        customerName: email ? email.split('@')[0] : 'mock-customer',
        requestedItems: [{ sku: 'SKU-QUOTE-1', quantity: 1, description: body || 'Quote request from Gmail webhook' }],
      },
    };
  },

  async testConnection() {
    return { success: true, message: 'Mock Gmail connection always succeeds.' };
  },
};
