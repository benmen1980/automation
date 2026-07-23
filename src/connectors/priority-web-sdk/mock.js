module.exports = {
  async testConnection() {
    return {
      success: true,
      mocked: true,
      message: 'Mock Priority Web SDK login succeeded. No external request was made.',
    };
  },
};
