module.exports = {
  async execute({ payload, logger, connectors, executionMode }) {
    await logger.info('Priority to WhatsApp webhook started.', { executionMode });
    if (!payload.customerId || !payload.phone) throw new Error('Payload must include customerId and phone.');

    const balance = await connectors.priority.getCustomerBalance({ customerId: payload.customerId });
    const message = `Hello ${payload.customerName || payload.customerId}, your current Priority balance is ${balance.balance} ${balance.currency || 'ILS'}.`;
    const whatsappResult = await connectors.whatsapp.sendMessage({ to: payload.phone, message });

    await logger.info('WhatsApp balance message prepared.', { mocked: whatsappResult.mocked, skipped: whatsappResult.skipped });
    return { success: true, balance, message, whatsappResult };
  },
};
