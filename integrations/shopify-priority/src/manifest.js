export default {
  name: 'shopify-priority',
  type: 'worker',
  triggers: ['manual', 'webhook'],
  credentials: [
    { key: 'SHOPIFY_SHOP_DOMAIN', type: 'text', helper: 'Shopify shop domain' },
    { key: 'SHOPIFY_ADMIN_ACCESS_TOKEN', type: 'secret', helper: 'Shopify Admin API access token' },
    { key: 'PRIORITY_BASE_URL', type: 'url', helper: 'Priority API base URL' },
  ],
};
