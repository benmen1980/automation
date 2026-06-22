module.exports = {
  async request({ method = 'GET', path = '', body }) {
    return {
      success: true,
      mocked: true,
      status: 200,
      data: { mockedRequest: { method, path, body }, message: 'Mocked generic-rest response.' },
    };
  },

  async testConnection() {
    return { success: true, message: 'Mock connection always succeeds.' };
  },
};
