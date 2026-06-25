import { createPriorityClient, IntegrationError } from '@automation/shared';

function mapOrder(payload) {
  if (!payload.id || !Array.isArray(payload.line_items)) {
    throw new IntegrationError('Payload must include Shopify order id and line_items.', { required: ['id', 'line_items'] });
  }

  return {
    externalId: String(payload.id),
    orderNumber: payload.name || String(payload.id),
    customer: {
      email: payload.customer?.email,
      name: `${payload.customer?.first_name || ''} ${payload.customer?.last_name || ''}`.trim(),
    },
    lines: payload.line_items.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      price: line.price,
    })),
  };
}

export async function handler(job, context) {
  const { logger, config, mocks = {} } = context;
  logger.info('Shopify Priority worker started.', { jobId: job.id, mode: job.mode || 'test' });
  const priorityOrder = mapOrder(job.payload || {});
  const priority = createPriorityClient({
    credentials: config.credentials,
    mocks: {
      '/orders': mocks.priorityCreateOrder || { mocked: true, priorityOrderId: 'mock-order-001' },
    },
  });
  const result = await priority.createOrder(priorityOrder);
  logger.info('Priority order create completed.', { mocked: Boolean(result.mocked), priorityOrderId: result.priorityOrderId });
  return { success: true, priorityOrder, result };
}
