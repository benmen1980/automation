export default {
  name: 'salesforce-priority',
  type: 'worker',
  runtime: 'lambda',
  direction: 'INBOUND',
  triggers: ['manual', 'schedule', 'webhook'],
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: '/automation/integrations/salesforce-priority',
    steps: ['Received from Salesforce', 'Mapped opportunity', 'Sent to Priority', 'Received from Priority'],
  },
  testing: {
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'live'],
    modeDescriptions: {
      test: 'Runs the worker with local Salesforce opportunity fixture data and mocked provider clients.',
      dry_run: 'Validates mapping and reports the Priority quote request without creating a live quote.',
      live: 'Uses saved live credentials and may call Salesforce and Priority.',
    },
  },
  deployment: {
    pipelineName: 'integration-salesforce-priority',
    queueName: 'salesforce-priority-queue',
    dlqName: 'salesforce-priority-dlq',
    cloudWatchLogGroup: '/automation/integrations/salesforce-priority',
  },
  credentials: [
    { key: 'SALESFORCE_INSTANCE_URL', label: 'Salesforce Instance URL', type: 'url', helper: 'Salesforce instance URL for the source org.' },
    { key: 'SALESFORCE_ACCESS_TOKEN', label: 'Salesforce Access Token', type: 'secret', helper: 'Salesforce API access token with least-privilege scopes.' },
    { key: 'PRIORITY_BASE_URL', label: 'Priority API Base URL', type: 'url', helper: 'Base URL for the target Priority API environment.' },
  ],
  sampleJob: 'fixtures/sample-job.json',
};
