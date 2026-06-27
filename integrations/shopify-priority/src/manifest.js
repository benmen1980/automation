export default {
  name: 'shopify-priority',
  type: 'worker',
  runtime: 'lambda',
  direction: 'INBOUND',
  triggers: ['manual', 'webhook'],
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: '/automation/integrations/shopify-priority',
    steps: ['Received from Shopify', 'Mapped Shopify order', 'Sent to Priority', 'Received from Priority'],
  },
  testing: {
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'live'],
    modeDescriptions: {
      test: 'Runs the worker with local Shopify order fixture data and mocked provider clients.',
      dry_run: 'Validates mapping and reports the Priority order request without creating a live order.',
      live: 'Uses saved live credentials and may call Shopify and Priority.',
    },
  },
  deployment: {
    pipelineName: 'integration-shopify-priority',
    queueName: 'shopify-priority-queue',
    dlqName: 'shopify-priority-dlq',
    cloudWatchLogGroup: '/automation/integrations/shopify-priority',
  },
  credentials: [
    { key: 'SHOPIFY_SHOP_DOMAIN', label: 'Shopify Shop Domain', type: 'text', helper: 'Shop domain such as example.myshopify.com.' },
    { key: 'SHOPIFY_ADMIN_ACCESS_TOKEN', label: 'Shopify Admin Access Token', type: 'secret', helper: 'Admin API access token with the exact scopes required by this worker.' },
    { key: 'PRIORITY_BASE_URL', label: 'Priority API Base URL', type: 'url', helper: 'Base URL for the target Priority API environment.' },
  ],
  sampleJob: 'fixtures/sample-job.json',
};
