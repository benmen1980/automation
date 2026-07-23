export function loadConfig(job = {}, env = process.env) {
  const liveMode = job.mode === 'live' || job.executionMode === 'live';
  if (liveMode && job.credentials && env.ALLOW_PLAINTEXT_JOB_CREDENTIALS !== 'true') {
    throw new Error('Live worker jobs must use credential references, not plaintext credentials in the queue message.');
  }

  return {
    credentials: {
      ...(job.settings?.credentials || {}),
      ...(job.credentials || {}),
      ...Object.fromEntries(
        Object.entries(env).filter(([key]) => key.startsWith('AUTOMATION_CREDENTIAL_'))
          .map(([key, value]) => [key.replace('AUTOMATION_CREDENTIAL_', ''), value])
      ),
    },
    credentialReferences: job.credentialReferences || {},
    settings: job.settings || {},
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validSecretReference(reference, integrationId, credentialKey) {
  const value = String(reference || '');
  const scopeComponent = /^[A-Za-z0-9_+=.@-]+$/;
  if (!scopeComponent.test(String(integrationId || '')) || !scopeComponent.test(String(credentialKey || ''))) {
    return false;
  }
  const expectedName = `automation/${integrationId}/${credentialKey}`;
  if (value === expectedName) return true;
  const arnPattern = new RegExp(
    `^arn:[a-z0-9-]+:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:${escapeRegExp(expectedName)}-[A-Za-z0-9]{6}$`
  );
  return arnPattern.test(value);
}

export async function readSecretByReference(reference, env = process.env) {
  const { GetSecretValueCommand, SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: env.AWS_REGION || env.AWS_DEFAULT_REGION || 'eu-west-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: reference }));
  if (response.SecretString !== undefined) return response.SecretString;
  if (response.SecretBinary !== undefined) return Buffer.from(response.SecretBinary).toString('utf8');
  throw new Error('Secrets Manager returned an empty worker credential.');
}

export async function resolveConfig(job = {}, { env = process.env, readSecret = readSecretByReference } = {}) {
  const config = loadConfig(job, env);
  const references = Object.entries(config.credentialReferences || {});

  for (const [key, reference] of references) {
    if (!validSecretReference(reference, job.integrationId, key)) {
      throw new Error(`Worker credential reference for ${key} is not scoped to this integration.`);
    }
    config.credentials[key] = await readSecret(reference, env);
  }

  return config;
}

export const _diagnostics = { validSecretReference };
