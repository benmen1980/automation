export default {
  name: 'salesforce-priority',
  type: 'worker',
  triggers: ['manual', 'schedule', 'webhook'],
  credentials: [
    { key: 'SALESFORCE_INSTANCE_URL', type: 'url', helper: 'Salesforce instance URL' },
    { key: 'SALESFORCE_ACCESS_TOKEN', type: 'secret', helper: 'Salesforce API access token' },
    { key: 'PRIORITY_BASE_URL', type: 'url', helper: 'Priority API base URL' },
  ],
};
