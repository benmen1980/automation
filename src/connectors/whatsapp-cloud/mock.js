module.exports = {
  async testConnection() {
    return {
      success: true,
      message: 'Mock WhatsApp Cloud API credential test passed.',
      mocked: true,
    };
  },
};
