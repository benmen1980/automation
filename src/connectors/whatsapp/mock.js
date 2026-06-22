/**
 * Mock WhatsApp connector — used whenever executionMode === 'mock_output'.
 * Never makes a real network call.
 */
module.exports = {
  async sendMessage(data) {
    return {
      success: true,
      mocked: true,
      providerMessageId: 'mock-message-123',
      request: data,
    };
  },

  async testConnection() {
    return { success: true, message: 'Mock connection always succeeds.' };
  },
};
