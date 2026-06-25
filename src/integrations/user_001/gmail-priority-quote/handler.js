module.exports = {
  async execute({ payload, logger, connectors, executionMode }) {
    await logger.info('Gmail quote webhook started.', { executionMode, subject: payload.subject });
    if (!payload.email || !payload.body) throw new Error('Payload must include email and body.');

    const parsed = await connectors.gmail.parseQuoteRequest(payload);
    const result = await connectors.priority.createQuote(parsed.quote);
    await logger.info('Priority quote create prepared.', { mocked: result.mocked, priorityQuoteId: result.priorityQuoteId });

    return { success: true, quote: parsed.quote, result };
  },
};
