module.exports = {
  async send(data) {
    return { success: true, mocked: true, providerMessageId: 'mock-email-456', request: data };
  },

  async testConnection() {
    return { success: true, message: 'Mock connection always succeeds.' };
  },
};
