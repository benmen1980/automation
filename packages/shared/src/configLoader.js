export function loadConfig(job = {}, env = process.env) {
  return {
    credentials: {
      ...(job.credentials || {}),
      ...Object.fromEntries(
        Object.entries(env).filter(([key]) => key.startsWith('AUTOMATION_CREDENTIAL_'))
          .map(([key, value]) => [key.replace('AUTOMATION_CREDENTIAL_', ''), value])
      ),
    },
    settings: job.settings || {},
  };
}
