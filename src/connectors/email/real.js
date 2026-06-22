/**
 * Real email connector. Implemented as a generic REST send (works with
 * any provider that exposes an HTTP send-email endpoint, e.g. SES/SendGrid
 * REST APIs) rather than bundling a specific SMTP/provider SDK, so the
 * MVP has zero extra runtime dependencies. Swap the request shape below
 * for your provider's actual API if it differs.
 */
module.exports = {
  async send({ to, subject, body }, credentials) {
    const { EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM } = credentials;
    if (!EMAIL_API_URL || !EMAIL_API_KEY) {
      throw new Error('email connector requires EMAIL_API_URL and EMAIL_API_KEY credentials.');
    }

    const response = await fetch(EMAIL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EMAIL_API_KEY}`,
      },
      body: JSON.stringify({ to, subject, body, from: EMAIL_FROM }),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Email API error (${response.status}): ${JSON.stringify(responseBody)}`);
    }

    return { success: true, mocked: false, providerMessageId: responseBody.id || null };
  },

  async testConnection(credentials) {
    const { EMAIL_API_URL, EMAIL_API_KEY } = credentials;
    if (!EMAIL_API_URL || !EMAIL_API_KEY) {
      return { success: false, message: 'Missing EMAIL_API_URL or EMAIL_API_KEY.' };
    }
    return { success: true, message: 'Credentials present (no-op connectivity check).' };
  },
};
