const fs = require('fs');
const path = require('path');
const definition = require('./integration');

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function resolveLocalOutputDir(relativeDir, userSlug) {
  const defaultDir = path.join('local-data', 'users', userSlug, 'priority-inventory-to-file');
  const requested = relativeDir || defaultDir;
  const root = path.resolve(process.cwd(), 'local-data', 'users', userSlug);
  const resolved = path.resolve(process.cwd(), requested);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const resolvedWithSep = resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;

  if (!resolvedWithSep.startsWith(rootWithSep)) {
    throw new Error(`Refusing to write outside local user folder: ${resolved}`);
  }
  return resolved;
}

function buildDocument({ executionMode, credentials, inventoryResult }) {
  return {
    generatedAt: new Date().toISOString(),
    integration: 'priority-inventory-to-file',
    executionMode,
    source: {
      system: 'Priority ERP',
      endpoint: credentials.PRIORITY_INVENTORY_URL,
      method: 'GET',
      requestBody: null,
    },
    inventory: inventoryResult.items || [],
    raw: inventoryResult.raw || inventoryResult,
  };
}

module.exports = {
  async execute({ credentials, logger, connectors, executionMode, user }) {
    await logger.info('Priority inventory to file started.', { executionMode });

    const outputDir = resolveLocalOutputDir(credentials.LOCAL_OUTPUT_DIR, user.slug);
    const timestamp = safeTimestamp();
    const fileName = `priority-inventory-${timestamp}.json`;
    const filePath = path.join(outputDir, fileName);

    if (executionMode === 'dry_run') {
      await logger.info('Dry run completed. Priority will not be called and no file will be written.', {
        plannedFilePath: filePath,
        endpoint: credentials.PRIORITY_INVENTORY_URL,
        method: 'GET',
      });
      return {
        success: true,
        dryRun: true,
        wouldCall: {
          system: 'Priority ERP',
          method: 'GET',
          url: credentials.PRIORITY_INVENTORY_URL,
          body: null,
        },
        wouldWriteFile: filePath,
      };
    }

    let inventoryResult;
    if (executionMode === 'test' || executionMode === 'dummy') {
      inventoryResult = {
        success: true,
        mocked: true,
        items: definition.sampleData.inventory,
        raw: { value: definition.sampleData.inventory },
      };
      await logger.info('Using embedded dummy Priority inventory sample data.', { itemCount: inventoryResult.items.length });
    } else {
      inventoryResult = await connectors.priority.getInventory({
        requestBody: undefined,
        endpointUrl: credentials.PRIORITY_INVENTORY_URL,
      });
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const document = buildDocument({ executionMode, credentials, inventoryResult });
    fs.writeFileSync(filePath, JSON.stringify(document, null, 2), 'utf8');

    await logger.info('Priority inventory written to local file.', {
      filePath,
      itemCount: document.inventory.length,
      mocked: inventoryResult.mocked,
    });

    return {
      success: true,
      filePath,
      itemCount: document.inventory.length,
      mocked: inventoryResult.mocked === true,
      dryRun: false,
    };
  },
};
