const requestedEntities = ['TRANSORDER_q', 'BASEINVOICEREP', 'BASEINVOICEREPSON'];

export default {
  name: 'priority-sales-projects-insights',
  type: 'worker',
  runtime: 'lambda',
  direction: 'INBOUND',
  triggers: ['manual', 'schedule'],
  logging: {
    direction: 'INBOUND',
    reviewRequired: true,
    cloudWatchLogGroup: '/automation/integrations/priority-sales-projects-insights',
    steps: [
      'Received from Priority OData',
      'Pulled TRANSORDER_q',
      'Pulled BASEINVOICEREP',
      'Pulled BASEINVOICEREPSON',
      'Aggregated sales and project insights',
    ],
  },
  testing: {
    defaultMode: 'test',
    modes: ['test', 'dry_run', 'live'],
    modeDescriptions: {
      test: 'Runs the worker with local sample fixture data only.',
      dry_run: 'Validates request shape and mapping without any live Priority network calls.',
      live: 'Calls Priority OData endpoints directly using saved credentials.',
    },
  },
  deployment: {
    pipelineName: 'integration-priority-sales-projects-insights',
    queueName: 'priority-sales-projects-insights-queue',
    dlqName: 'priority-sales-projects-insights-dlq',
    cloudWatchLogGroup: '/automation/integrations/priority-sales-projects-insights',
  },
  credentials: [
    {
      key: 'PRIORITY_ODATA_BASE_URL',
      label: 'Priority OData base URL',
      type: 'url',
      required: true,
      helper:
        'Base OData root URL, for example https://priority.simplyct.co.il/odata/Priority/tabula.ini/roihd.',
    },
    {
      key: 'PRIORITY_BASIC_USERNAME',
      label: 'Priority OData username',
      type: 'text',
      required: true,
      helper: 'Basic auth username used for OData endpoints.',
    },
    {
      key: 'PRIORITY_BASIC_PASSWORD',
      label: 'Priority OData password',
      type: 'secret',
      required: true,
      helper: 'Basic auth password used for OData endpoints.',
    },
    {
      key: 'PRIORITY_ODATA_AUTH_HEADER',
      label: 'Optional Authorization header',
      type: 'secret',
      required: false,
      helper: 'Optional prebuilt header value, for example "Basic ABC...". If set, it overrides username/password.',
    },
    {
      key: 'PRIORITY_SALES_PROJECTS_TOP_N',
      label: 'Top project count',
      type: 'number',
      required: false,
      helper: 'Maximum number of top project rows to include in the insight summary.',
    },
  ],
  sampleJob: 'fixtures/sample-job.json',
  sourceSystem: 'Priority OData',
  targetSystem: 'Insights output',
  entities: requestedEntities,
};
