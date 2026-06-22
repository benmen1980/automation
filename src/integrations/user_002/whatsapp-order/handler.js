/**
 * Sends a WhatsApp message to the customer named in the incoming order
 * payload. See integration.js for the credential schema and sample
 * payloads used by the dashboard's test tools.
 */
module.exports = {
  async execute({ payload, credentials, logger, connectors, executionMode }) {
    logger.info('WhatsApp order handler started.', { executionMode });

    const orderNumber = payload?.order?.number;
    const customerName = payload?.customer?.name;
    let phone = payload?.customer?.phone;

    if (!orderNumber) {
      throw new Error('Payload is missing order.number.');
    }
    if (!customerName) {
      throw new Error('Payload is missing customer.name.');
    }
    if (!phone) {
      throw new Error('Payload is missing customer.phone.');
    }

    const countryCode = credentials.DEFAULT_COUNTRY_CODE || '972';
    if (!/^\d{6,15}$/.test(phone)) {
      throw new Error(`Invalid phone number format: ${phone}`);
    }
    if (phone.length <= 10 && !phone.startsWith(countryCode)) {
      phone = `${countryCode}${phone}`;
      logger.debug('Phone number missing country code, prefixed with default.', { phone, countryCode });
    }

    const message = `Hi ${customerName}, your order #${orderNumber} has been received and is being processed.`;

    const result = await connectors.whatsapp.sendMessage({ to: phone, message });

    logger.info('WhatsApp message dispatched.', { to: phone, mocked: result.mocked, skipped: result.skipped });

    return {
      success: true,
      message: `WhatsApp notification sent for order #${orderNumber}.`,
      connectorResult: result,
    };
  },
};
