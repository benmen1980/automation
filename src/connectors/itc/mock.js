module.exports = {
  async sendTemplateMessage() {
    return {
      success: true,
      mocked: true,
      status: 200,
      providerMessageId: 'mock-itc-message-123',
      data: {
        id: 'mock-itc-message-123',
        status: 'accepted',
        mocked: true,
      },
    };
  },

  async testConnection() {
    return {
      success: true,
      mocked: true,
      configurationOnly: true,
      message: 'Mock ITC configuration check passed. No message was sent.',
    };
  },
};
