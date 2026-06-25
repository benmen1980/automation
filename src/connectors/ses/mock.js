module.exports = {
  async sendEmail(data) {
    return {
      success: true,
      mocked: true,
      provider: 'aws-ses',
      providerMessageId: 'mock-ses-message-123',
      request: data,
    };
  },

  async testConnection() {
    return { success: true, provider: 'aws-ses', message: 'Mock SES connection always succeeds.' };
  },
};
