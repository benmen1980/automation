export default {
  name: 'gmail-priority',
  type: 'worker',
  triggers: ['manual', 'schedule', 'webhook'],
  credentials: [
    { key: 'GOOGLE_CLIENT_ID', type: 'secret', helper: 'Google OAuth Client ID' },
    { key: 'GOOGLE_CLIENT_SECRET', type: 'secret', helper: 'Google OAuth Client Secret' },
    { key: 'GOOGLE_REFRESH_TOKEN', type: 'secret', helper: 'Google OAuth refresh token' },
    { key: 'PRIORITY_BASE_URL', type: 'url', helper: 'Priority API base URL' },
  ],
};
