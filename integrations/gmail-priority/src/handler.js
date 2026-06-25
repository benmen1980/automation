import { createPriorityClient, IntegrationError } from '@automation/shared';

function parseQuoteRequest(payload) {
  if (!payload.email || !payload.body) {
    throw new IntegrationError('Payload must include email and body.', { required: ['email', 'body'] });
  }

  const skuMatch = payload.body.match(/\bSKU[-_A-Z0-9]+\b/i);
  return {
    customerEmail: payload.email,
    subject: payload.subject || 'Quote request',
    sku: skuMatch ? skuMatch[0].toUpperCase() : 'UNKNOWN',
    notes: payload.body,
  };
}

export async function handler(job, context) {
  const { logger, config, mocks = {} } = context;
  const payload = job.payload || {};
  logger.info('Gmail Priority worker started.', { jobId: job.id, mode: job.mode || 'test' });

  const quote = parseQuoteRequest(payload);
  const priority = createPriorityClient({
    credentials: config.credentials,
    mocks: {
      '/quotes': mocks.priorityCreateQuote || { mocked: true, priorityQuoteId: 'mock-quote-001' },
    },
  });
  const result = await priority.createQuote(quote);

  logger.info('Priority quote create completed.', { mocked: Boolean(result.mocked), priorityQuoteId: result.priorityQuoteId });
  return { success: true, quote, result };
}
