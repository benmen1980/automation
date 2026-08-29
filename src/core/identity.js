const crypto = require('crypto');

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function normalizeIdentityPart(value) {
  return String(value || '').trim().toLowerCase();
}

function deriveUserUid(slug) {
  const normalizedSlug = normalizeIdentityPart(slug);
  if (!normalizedSlug) throw new Error('Cannot derive user_uid without a user slug.');
  return `usr_${stableHash(normalizedSlug)}`;
}

function deriveAutomationId({ integrationKey, userUid, slug, codeFolder }) {
  const stableSource = [
    normalizeIdentityPart(integrationKey),
    normalizeIdentityPart(userUid),
    normalizeIdentityPart(slug),
    normalizeIdentityPart(codeFolder),
  ].join('|');
  if (!stableSource.replace(/\|/g, '')) {
    throw new Error('Cannot derive automation_id without a stable integration identity.');
  }
  return `aut_${stableHash(stableSource)}`;
}

function getIntegrationKeyFromDefinition(definition) {
  return typeof definition?.integrationKey === 'string' && definition.integrationKey.trim()
    ? definition.integrationKey.trim()
    : null;
}

function getAutomationId(integration) {
  return integration?.automationId || null;
}

function getUserUid(user) {
  return user?.userUid || null;
}

module.exports = {
  deriveUserUid,
  deriveAutomationId,
  getIntegrationKeyFromDefinition,
  getAutomationId,
  getUserUid,
};
