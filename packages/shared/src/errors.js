export class IntegrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.details = details;
  }
}

export class ProviderError extends Error {
  constructor(provider, message, details = {}) {
    super(`${provider} error: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.details = details;
  }
}

export function normalizeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown integration error',
    details: error?.details || undefined,
    stack: error?.stack || undefined,
  };
}
