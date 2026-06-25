/**
 * Bridges integration.js's declared `credentials` field schema with the
 * Credential DB rows and the secrets store.
 *
 * Rules enforced here (docs/product/product-architecture-spec.md 5.4, 5.6, 10.2):
 *   - secret-type values are never stored in the DB and never returned to
 *     the frontend after saving — only a "saved: true/false" flag is.
 *   - non-secret values are stored directly in the DB (JSON-encoded so any
 *     type — string/number/boolean — round-trips cleanly).
 *   - a missing *required* credential blocks execution before the handler
 *     is ever invoked.
 */
const prisma = require('../db/client');
const secrets = require('./secrets');
const integrationLoader = require('./integration-loader');

function isSecretField(field) {
  return field.isSecret === true || field.type === 'secret' || field.type === 'password';
}

function getDefinitionFields(integration) {
  const definition = integrationLoader.loadDefinition(integration);
  return Array.isArray(definition.credentials) ? definition.credentials : [];
}

function validateField(field, value) {
  if (field.required && (value === undefined || value === null || value === '')) {
    throw new CredentialValidationError(`Missing required credential: ${field.key}`);
  }
  if (value !== undefined && value !== null && field.validation) {
    const { minLength, maxLength, pattern } = field.validation;
    const str = String(value);
    if (minLength !== undefined && str.length < minLength) {
      throw new CredentialValidationError(`${field.key} must be at least ${minLength} characters.`);
    }
    if (maxLength !== undefined && str.length > maxLength) {
      throw new CredentialValidationError(`${field.key} must be at most ${maxLength} characters.`);
    }
    if (pattern && !new RegExp(pattern).test(str)) {
      throw new CredentialValidationError(`${field.key} does not match the required format.`);
    }
  }
  return value;
}

class CredentialValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CredentialValidationError';
    this.statusCode = 400;
  }
}

/**
 * Saves a map of { key: value } against an integration's declared
 * credential fields. Values for keys not declared in integration.js are
 * ignored. Returns the list of keys actually saved.
 */
async function saveCredentials(integration, values) {
  const fields = getDefinitionFields(integration);
  const saved = [];

  for (const field of fields) {
    if (!(field.key in values)) continue; // not being updated this call
    const value = values[field.key];
    validateField(field, value);

    if (isSecretField(field)) {
      const refName = await secrets.setSecret(integration.id, field.key, String(value));
      await prisma.credential.upsert({
        where: { integrationId_key: { integrationId: integration.id, key: field.key } },
        update: { valueReference: refName, type: field.type, isSecret: true },
        create: {
          userId: integration.userId,
          integrationId: integration.id,
          key: field.key,
          valueReference: refName,
          type: field.type,
          isSecret: true,
        },
      });
    } else {
      await prisma.credential.upsert({
        where: { integrationId_key: { integrationId: integration.id, key: field.key } },
        update: { valueReference: JSON.stringify(value), type: field.type, isSecret: false },
        create: {
          userId: integration.userId,
          integrationId: integration.id,
          key: field.key,
          valueReference: JSON.stringify(value),
          type: field.type,
          isSecret: false,
        },
      });
    }
    saved.push(field.key);
  }

  return saved;
}

/**
 * Loads the flat { KEY: value } object passed to handler.execute() as
 * `credentials`. Throws CredentialValidationError if a required field has
 * no saved value and no defaultValue.
 */
async function loadCredentialsForExecution(integration) {
  const fields = getDefinitionFields(integration);
  const rows = await prisma.credential.findMany({ where: { integrationId: integration.id } });
  const rowsByKey = new Map(rows.map((r) => [r.key, r]));

  const result = {};
  for (const field of fields) {
    const row = rowsByKey.get(field.key);
    let value;

    if (row) {
      if (row.isSecret) {
        value = await secrets.getSecret(integration.id, field.key);
      } else {
        value = JSON.parse(row.valueReference);
      }
    } else if (field.defaultValue !== undefined) {
      value = field.defaultValue;
    }

    validateField(field, value);
    if (value !== undefined) result[field.key] = value;
  }

  return result;
}

/**
 * Dashboard-safe view of an integration's credentials: declared fields
 * merged with save-state, secret values always masked.
 */
async function listCredentialsForDisplay(integration) {
  const fields = getDefinitionFields(integration);
  const rows = await prisma.credential.findMany({ where: { integrationId: integration.id } });
  const rowsByKey = new Map(rows.map((r) => [r.key, r]));

  return fields.map((field) => {
    const row = rowsByKey.get(field.key);
    const base = {
      key: field.key,
      label: field.label,
      type: field.type,
      required: !!field.required,
      helper: field.helper,
      helperUrl: field.helperUrl,
      helperUrlLabel: field.helperUrlLabel,
      placeholder: field.placeholder,
      options: field.options,
      isSecret: isSecretField(field),
    };

    // Secret fields must never expose a value over the API — not the saved
    // value, and not a defaultValue either (integration.js shouldn't put
    // real secrets in defaultValue per docs/product/product-architecture-spec.md 5.3, but we don't trust
    // that and mask defensively regardless of save-state).
    if (isSecretField(field)) {
      return { ...base, saved: !!row, value: null };
    }
    if (!row) {
      return { ...base, saved: false, value: field.defaultValue !== undefined ? field.defaultValue : null };
    }
    return { ...base, saved: true, value: JSON.parse(row.valueReference) };
  });
}

module.exports = {
  CredentialValidationError,
  getDefinitionFields,
  saveCredentials,
  loadCredentialsForExecution,
  listCredentialsForDisplay,
};
