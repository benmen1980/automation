const fs = require('fs');
const path = require('path');

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function resolveOutputDir(relativeDir, userSlug) {
  const root = path.resolve(process.cwd(), 'local-data', 'users', userSlug);
  const requested = relativeDir || path.join('local-data', 'users', userSlug, 'user-001-whatsapp');
  const resolved = path.resolve(process.cwd(), requested);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const resolvedWithSep = resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;

  if (!resolvedWithSep.startsWith(rootWithSep)) {
    throw new Error(`Refusing to write outside local user folder: ${resolved}`);
  }
  return resolved;
}

module.exports = {
  async execute({ payload, credentials, logger, executionMode, user }) {
    const outputDir = resolveOutputDir(credentials.LOCAL_OUTPUT_DIR, user.slug);
    const fileName = `whatsapp-webhook-${safeTimestamp()}.json`;
    const filePath = path.join(outputDir, fileName);

    await logger.info('User 001 WhatsApp webhook received.', {
      executionMode,
      plannedFilePath: filePath,
    });

    if (executionMode === 'dry_run') {
      return {
        success: true,
        dryRun: true,
        wouldWriteFile: filePath,
        receivedKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      };
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const document = {
      receivedAt: new Date().toISOString(),
      integration: 'user-001-whatsapp',
      executionMode,
      body: payload || {},
    };
    fs.writeFileSync(filePath, JSON.stringify(document, null, 2), 'utf8');

    await logger.info('WhatsApp webhook body written to local file.', {
      filePath,
      bytes: Buffer.byteLength(JSON.stringify(document), 'utf8'),
    });

    return {
      success: true,
      filePath,
      receivedKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    };
  },
  _diagnostics: { resolveOutputDir },
};
