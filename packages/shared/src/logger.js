function safeMeta(metadata = {}) {
  return JSON.parse(JSON.stringify(metadata, (_key, value) => {
    if (typeof value === 'string' && value.length > 160) return `${value.slice(0, 157)}...`;
    return value;
  }));
}

export function createLogger({ service = 'integration', jobId = 'local' } = {}) {
  const write = (level, message, metadata) => {
    const entry = {
      time: new Date().toISOString(),
      level,
      service,
      jobId,
      message,
      metadata: safeMeta(metadata),
    };
    console.log(JSON.stringify(entry));
  };

  return {
    debug: (message, metadata) => write('debug', message, metadata),
    info: (message, metadata) => write('info', message, metadata),
    warn: (message, metadata) => write('warn', message, metadata),
    error: (message, metadata) => write('error', message, metadata),
  };
}
