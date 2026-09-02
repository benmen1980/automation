/**
 * Secrets abstraction. Two backends, selected by SECRETS_MODE:
 *
 *   local (default for dev) -> AES-256-GCM encrypted JSON file at
 *                               local-data/secrets.local.json, keyed by
 *                               LOCAL_SECRET_KEY.
 *   aws                     -> AWS Secrets Manager (production). Requires
 *                               `npm install @aws-sdk/client-secrets-manager`
 *                               on the deployment target; loaded lazily so
 *                               local dev never needs that package.
 *
 * Per docs/product/product-architecture-spec.md 5.6 / 10.2: secret values are never returned to the
 * frontend once saved, and a user can overwrite a secret but cannot read
 * its existing value back.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRETS_MODE = process.env.SECRETS_MODE || 'local';
const LOCAL_SECRETS_PATH =
  process.env.LOCAL_SECRETS_PATH || path.join(process.cwd(), 'local-data', 'secrets.local.json');
const ALGO = 'aes-256-gcm';

function deriveKey() {
  const raw = process.env.LOCAL_SECRET_KEY;
  if (!raw) {
    throw new Error('LOCAL_SECRET_KEY is not set. Set it in .env before using SECRETS_MODE=local.');
  }
  // Stretch whatever string the user provided into a 32-byte key.
  return crypto.createHash('sha256').update(raw).digest();
}

function readStore() {
  if (!fs.existsSync(LOCAL_SECRETS_PATH)) return {};
  const raw = fs.readFileSync(LOCAL_SECRETS_PATH, 'utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(LOCAL_SECRETS_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_SECRETS_PATH, JSON.stringify(store, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function encrypt(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

function decrypt(payload) {
  const key = deriveKey();
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed secret payload.');
  }
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function legacyRefName(integrationId, key) {
  return `${integrationId}::${key}`;
}

function automationRefName(automationId, key) {
  return `automation/${automationId}/${key}`;
}

function isReferenceForScope(reference, integrationOrId, key) {
  const value = String(reference || '');
  const integrationId = typeof integrationOrId === 'string' ? integrationOrId : integrationOrId?.id;
  const automationId = typeof integrationOrId === 'object' ? integrationOrId?.automationId : null;
  const names = [
    integrationId ? legacyRefName(integrationId, key) : null,
    integrationId ? `automation/${integrationId}/${key}` : null,
    automationId ? automationRefName(automationId, key) : null,
  ].filter(Boolean);
  if (names.includes(value)) return true;
  return names.some((name) => new RegExp(
    `^arn:[a-z0-9-]+:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[A-Za-z0-9]{6}$`
  ).test(value));
}

function getSecretReferences(integrationOrId, key, preferredReference) {
  const integrationId = typeof integrationOrId === 'string' ? integrationOrId : integrationOrId?.id;
  const automationId = typeof integrationOrId === 'object' ? integrationOrId?.automationId : null;
  return [...new Set([
    isReferenceForScope(preferredReference, integrationOrId, key) ? preferredReference : null,
    automationId ? automationRefName(automationId, key) : null,
    integrationId ? legacyRefName(integrationId, key) : null,
  ].filter(Boolean))];
}

function isValidAwsSecretIdentifier(name) {
  const value = String(name || '');
  return value.startsWith('arn:') || /^[A-Za-z0-9/_+=.@!-]+$/.test(value);
}

const localBackend = {
  async setSecret(integrationId, key, plaintextValue) {
    const store = readStore();
    const names = getSecretReferences(integrationId, key);
    const encrypted = encrypt(plaintextValue);
    names.forEach((name) => { store[name] = encrypted; });
    writeStore(store);
    return names[0];
  },

  async getSecret(integrationId, key, preferredReference) {
    const store = readStore();
    for (const name of getSecretReferences(integrationId, key, preferredReference)) {
      if (name in store) return decrypt(store[name]);
    }
    return null;
  },

  async hasSecret(integrationId, key) {
    const store = readStore();
    return getSecretReferences(integrationId, key).some((name) => name in store);
  },

  async deleteSecret(integrationId, key) {
    const store = readStore();
    getSecretReferences(integrationId, key).forEach((name) => delete store[name]);
    writeStore(store);
  },

  async aliasSecret(integrationOrId, key, preferredReference) {
    const store = readStore();
    const names = getSecretReferences(integrationOrId, key, preferredReference);
    const source = names.find((name) => name in store);
    if (!source) return false;
    const payload = store[source];
    names.forEach((name) => { store[name] = payload; });
    writeStore(store);
    return true;
  },
};

let awsBackend = null;
function getAwsBackend() {
  if (awsBackend) return awsBackend;
  // Lazy require so local dev (SECRETS_MODE=local) never needs this
  // package installed. Run `npm install @aws-sdk/client-secrets-manager`
  // before switching SECRETS_MODE=aws in production.
  let SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand, DeleteSecretCommand;
  try {
    ({
      SecretsManagerClient,
      GetSecretValueCommand,
      PutSecretValueCommand,
      CreateSecretCommand,
      DeleteSecretCommand,
    } = require('@aws-sdk/client-secrets-manager'));
  } catch (err) {
    throw new Error(
      'SECRETS_MODE=aws requires @aws-sdk/client-secrets-manager. Install it with ' +
        '`npm install @aws-sdk/client-secrets-manager` before using this mode.'
    );
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

  awsBackend = {
    async setSecret(integrationId, key, plaintextValue) {
      const names = getSecretReferences(integrationId, key).filter(isValidAwsSecretIdentifier);
      for (const name of names) {
        try {
          await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: plaintextValue }));
        } catch (err) {
          if (err.name === 'ResourceNotFoundException') {
            await client.send(new CreateSecretCommand({ Name: name, SecretString: plaintextValue }));
          } else {
            throw err;
          }
        }
      }
      return names[0];
    },
    async getSecret(integrationId, key, preferredReference) {
      for (const name of getSecretReferences(integrationId, key, preferredReference).filter(isValidAwsSecretIdentifier)) {
        try {
          const res = await client.send(new GetSecretValueCommand({ SecretId: name }));
          return res.SecretString ?? null;
        } catch (err) {
          if (err.name !== 'ResourceNotFoundException') throw err;
        }
      }
      return null;
    },
    async hasSecret(integrationId, key) {
      const value = await this.getSecret(integrationId, key);
      return value !== null;
    },
    async deleteSecret(integrationId, key) {
      for (const name of getSecretReferences(integrationId, key).filter(isValidAwsSecretIdentifier)) {
        try {
          await client.send(new DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true }));
        } catch (err) {
          if (err.name !== 'ResourceNotFoundException') throw err;
        }
      }
    },
    async aliasSecret(integrationOrId, key, preferredReference) {
      const value = await this.getSecret(integrationOrId, key, preferredReference);
      if (value === null) return false;
      await this.setSecret(integrationOrId, key, value);
      return true;
    },
  };

  return awsBackend;
}

function getBackend() {
  if (SECRETS_MODE === 'aws') return getAwsBackend();
  return localBackend;
}

module.exports = {
  async setSecret(integrationId, key, value) {
    return getBackend().setSecret(integrationId, key, value);
  },
  async getSecret(integrationId, key, preferredReference) {
    return getBackend().getSecret(integrationId, key, preferredReference);
  },
  async hasSecret(integrationId, key) {
    return getBackend().hasSecret(integrationId, key);
  },
  async deleteSecret(integrationId, key) {
    return getBackend().deleteSecret(integrationId, key);
  },
  async aliasSecret(integrationId, key, preferredReference) {
    return getBackend().aliasSecret(integrationId, key, preferredReference);
  },
  legacyRefName,
  automationRefName,
  getSecretReferences,
  isReferenceForScope,
};
