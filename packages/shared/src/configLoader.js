export function loadConfig(job = {}, env = process.env) {
  const liveMode = job.mode === 'live' || job.executionMode === 'live';
  if (liveMode && job.credentials && env.ALLOW_PLAINTEXT_JOB_CREDENTIALS !== 'true') {
    throw new Error('Live worker jobs must use credential references, not plaintext credentials in the queue message.');
  }

  return {
    credentials: {
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
