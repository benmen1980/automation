/**
 * Fixture handler for the Test Echo integration (see integration.js in
 * this folder). Behavior is driven entirely by the input payload so
 * tests can exercise success, failure, and connector-call paths without
 * any external dependencies:
 *
 *   { shouldFail: true }     -> throws, so execution-runner marks the
 *                                execution status "failed".
 *   { callConnector: true }  -> calls connectors.whatsapp.sendMessage so
 *                                tests can assert on dry_run/mock_output/
 *                                live connector wiring.
 *   anything else             -> echoes the payload back in the result.
 */
module.exports = {
  async execute({ payload, credentials, logger, connectors, executionMode }) {
    await logger.info('Echo handler started.', { executionMode });

    if (payload && payload.shouldFail) {
      throw new Error('Echo handler failed because payload.shouldFail was true.');
    }

    let connectorResult = null;
    if (payload && payload.callConnector) {
      connectorResult = await connectors.whatsapp.sendMessage({
        to: '0000000000',
        message: 'fixture test message',
      });
    }

    return {
      success: true,
      greeting: credentials.GREETING,
      hasApiToken: !!credentials.API_TOKEN,
      echoedPayload: payload,
      connectorResult,
    };
  },
};
