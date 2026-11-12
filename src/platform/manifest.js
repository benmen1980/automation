module.exports = {
  name: 'platform-admin',
  displayName: 'Admin',
  version: '1.6.7.36',
  releaseLog: [
    {
      version: '1.6.7.36',
      date: '2026-11-12',
      summary: 'Connect mailing-list management and test emails to the common log component for all automations, and route existing failure reporting through the shared SES service.',
      commit: 'HEAD',
    },
    {
      version: '1.6.7.35',
      date: '2026-11-12',
      summary: 'Add inactive shared SES recipient management, verification, test emails and deduplicated failure notifications. Future automation wiring places recipient management and email controls inside its log component.',
      // Resolve in the release checkout; a commit cannot embed its own SHA.
      commit: 'HEAD',
    },
  ],
};
