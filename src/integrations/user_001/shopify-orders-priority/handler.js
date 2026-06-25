module.exports = {
  async execute({ payload, logger, connectors, executionMode }) {
    await logger.info('Shopify order webhook received.', { executionMode, shopifyOrderId: payload.id });
    if (!payload.id || !payload.line_items) throw new Error('Payload must include Shopify order id and line_items.');

    const priorityOrder = {
      externalId: String(payload.id),
      orderNumber: payload.name || String(payload.id),
      customer: {
        email: payload.customer?.email,
        name: `${payload.customer?.first_name || ''} ${payload.customer?.last_name || ''}`.trim(),
      },
      lines: payload.line_items.map((line) => ({ sku: line.sku, quantity: line.quantity, price: line.price })),
    };

    const result = await connectors.priority.createOrder(priorityOrder);
    await logger.info('Priority order create prepared.', { mocked: result.mocked, priorityOrderId: result.priorityOrderId });
    return { success: true, priorityOrder, result };
  },
};
