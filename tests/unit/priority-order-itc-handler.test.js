const handler = require('../../src/integrations/tuf1/priority-quote-whatsapp/handler');
const integrationDefinition = require('../../src/integrations/tuf1/priority-quote-whatsapp/integration');
const { validateIntegrationContract } = require('../../src/core/integration-loader');

describe('tuf1 Priority order to ITC integration boundary', () => {
  test('definition declares the independent Priority Web SDK and ITC contract', () => {
    expect(() =>
      validateIntegrationContract(integrationDefinition, { strict: true })
    ).not.toThrow();
    expect(integrationDefinition.connectors).toEqual(['priorityWebSdk', 'itc']);
    expect(integrationDefinition.credentialTests).toEqual(['priorityWebSdk', 'itc']);
    expect(integrationDefinition.runtime).toBe('lambda');
    expect(integrationDefinition.deployment).toMatchObject({
      independentPipelineRequired: true,
      apiMustNotRestart: true,
      queueRequired: true,
      dlqRequired: true,
    });
    expect(integrationDefinition.credentials.map((field) => field.key)).toEqual([
      'ITC_TEMPLATE_MESSAGE_URL',
      'ITC_BEARER_TOKEN',
      'ITC_CHANNEL_ID',
      'PRIORITY_WEB_SDK_URL',
      'PRIORITY_WEB_SDK_TABULAINI',
      'PRIORITY_WEB_SDK_LANGUAGE',
      'PRIORITY_WEB_SDK_COMPANY',
      'PRIORITY_WEB_SDK_APPNAME',
      'PRIORITY_WEB_SDK_USERNAME',
      'PRIORITY_WEB_SDK_PASSWORD',
      'PRIORITY_WEB_SDK_DEVICENAME',
      'PRIORITY_WEB_SDK_ORDER_SORT_OPTION',
    ]);
    expect(
      integrationDefinition.credentials.find(
        (field) => field.key === 'ITC_BEARER_TOKEN'
      )
    ).not.toHaveProperty('defaultValue');
  });

  test('legacy handler fails closed instead of executing integration business logic', async () => {
    await expect(handler.execute()).rejects.toThrow(
      'must run through its independent priority-order-itc worker'
    );
  });
});
