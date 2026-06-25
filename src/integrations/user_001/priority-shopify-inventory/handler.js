module.exports = {
  async execute({ payload, logger, connectors, executionMode }) {
    await logger.info('Priority to Shopify inventory sync started.', { executionMode });
    const inventory = await connectors.priority.getInventory({ items: payload.items });
    const items = inventory.items || [];
    await logger.info(`Loaded ${items.length} inventory item(s) from Priority dummy/real source.`);

    const shopifyItems = items.map((item) => ({ sku: item.sku, available: Number(item.quantity || 0), warehouse: item.warehouse || 'MAIN' }));
    const shopifyResult = await connectors.shopify.updateInventory({ items: shopifyItems });
    await logger.info('Shopify inventory update prepared.', { captured: shopifyResult.captured, mocked: shopifyResult.mocked, skipped: shopifyResult.skipped });

    return { success: true, itemsRead: items.length, shopifyItems, shopifyResult };
  },
};
