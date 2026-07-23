const client = require('./client');

module.exports = {
  async testConnection(credentials = {}) {
    try {
      await client.login(credentials);
      return {
        success: true,
        provider: 'Priority Web SDK',
        message: 'Priority Web SDK login succeeded. No document was generated.',
        nextStep: 'Run Mock Output to verify the order-to-ITC mapping, then use Live with a test sales order.',
      };
    } catch (cause) {
      const detail = client.safePriorityErrorText(cause, credentials);
      return {
        success: false,
        provider: 'Priority Web SDK',
        message: `Priority Web SDK login failed${
          detail ? `: ${detail}` : '.'
        } Check the URL, tabula.ini, language, company, app name, username, password, and network access.`,
        nextStep: 'Correct and save the Priority settings, then test the login again.',
      };
    }
  },

  _diagnostics: client,
};
