import { createPriorityClient, IntegrationError } from '@automation/shared';

function mapOpportunity(payload) {
  if (!payload.opportunityId || !payload.accountName) {
    throw new IntegrationError('Payload must include opportunityId and accountName.', { required: ['opportunityId', 'accountName'] });
  }

  return {
    externalId: payload.opportunityId,
    customerName: payload.accountName,
    amount: Number(payload.amount || 0),
    stage: payload.stage || 'unknown',
  };
}

export async function handler(job, context) {
  const { logger, config, mocks = {} } = context;
  logger.info('Salesforce Priority worker started.', { jobId: job.id, mode: job.mode || 'test' });
  const quote = mapOpportunity(job.payload || {});
  const priority = createPriorityClient({
    credentials: config.credentials,
    mocks: {
      '/quotes': mocks.priorityCreateQuote || { mocked: true, priorityQuoteId: 'mock-salesforce-quote-001' },
    },
  });
  const result = await priority.createQuote(quote);
  logger.info('Priority quote create completed.', { mocked: Boolean(result.mocked), priorityQuoteId: result.priorityQuoteId });
  return { success: true, quote, result };
}
