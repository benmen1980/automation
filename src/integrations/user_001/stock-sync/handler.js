/**
 * Polls the inventory API for current stock levels and emails an alert
 * for any SKU at or below LOW_STOCK_THRESHOLD. Runs on the schedule
 * defined in ScheduleSettings, or on demand via "Run Now" / dry-run.
 */
module.exports = {
  async execute({ credentials, logger, connectors, executionMode }) {
    logger.info('Stock sync started.', { executionMode });

    const threshold = Number(credentials.LOW_STOCK_THRESHOLD ?? 5);

    const inventoryResponse = await connectors.genericRest.request({ method: 'GET', path: 'inventory' });

    const items = Array.isArray(inventoryResponse?.data?.items)
      ? inventoryResponse.data.items
      : inventoryResponse?.skipped
        ? [] // dry_run: connector call was skipped, nothing to evaluate
        : [];

    const lowStockItems = items.filter((item) => Number(item.quantity) <= threshold);

    logger.info(`Checked ${items.length} SKUs, found ${lowStockItems.length} at or below threshold ${threshold}.`);

    if (lowStockItems.length === 0) {
      return { success: true, message: 'No low-stock items found.', checked: items.length, lowStock: [] };
    }

    const lines = lowStockItems.map((item) => `- ${item.sku}: ${item.quantity} remaining`).join('\n');
    const emailResult = await connectors.email.send({
      to: credentials.ALERT_RECIPIENT,
      subject: `Low stock alert: ${lowStockItems.length} SKU(s) below threshold`,
      body: `The following items are at or below the low-stock threshold (${threshold}):\n\n${lines}`,
    });

    logger.info('Low-stock alert email dispatched.', { mocked: emailResult.mocked, skipped: emailResult.skipped });

    return {
      success: true,
      message: `Sent low-stock alert for ${lowStockItems.length} item(s).`,
      checked: items.length,
      lowStock: lowStockItems,
      emailResult,
    };
  },
};
