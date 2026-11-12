module.exports = {
  name: 'platform-admin',
  displayName: 'Admin',
  version: '1.6.7.35',
  releaseLog: [
    {
      version: '1.6.7.35',
      date: '2026-11-12',
      summary: 'Add inactive shared SES recipient management, verification, test emails and deduplicated failure notifications. Future automation wiring places recipient management and email controls inside its log component.',
      // Resolve in the release checkout; a commit cannot embed its own SHA.
      commit: 'HEAD',
    },
  ],
};
