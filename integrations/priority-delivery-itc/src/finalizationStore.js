import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const DEFAULT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

function tableName(env = process.env) {
  const value = String(env.AUTOMATION_FINALIZATION_TABLE_NAME || env.ITC_FINALIZATION_TABLE_NAME || '').trim();
  if (!value) throw new Error('AUTOMATION_FINALIZATION_TABLE_NAME is required for live worker finalization safety.');
  return value;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createFinalizationStore({
  env = process.env,
  client = new DynamoDBClient({ region: env.AWS_REGION || env.AWS_DEFAULT_REGION || 'eu-west-1' }),
} = {}) {
  const TableName = tableName(env);
  return {
    async load(executionId) {
      const response = await client.send(new GetItemCommand({
        TableName,
        Key: { executionId: { S: String(executionId) } },
        ConsistentRead: true,
      }));
      if (!response.Item) return null;
      return {
        state: response.Item.state?.S,
        result: parseJson(response.Item.resultJson?.S, undefined),
        errorMessage: response.Item.errorMessage?.S,
        startedAt: response.Item.startedAt?.S,
        finishedAt: response.Item.finishedAt?.S,
      };
    },

    async saveInFlight(executionId, startedAt) {
      await client.send(new PutItemCommand({
        TableName,
        Item: {
          executionId: { S: String(executionId) },
          state: { S: 'IN_FLIGHT' },
          startedAt: { S: startedAt },
          expiresAt: { N: String(Math.floor(Date.now() / 1000) + DEFAULT_RETENTION_SECONDS) },
        },
        ConditionExpression: 'attribute_not_exists(executionId)',
      }));
    },

    async saveSuccess(executionId, result, finishedAt) {
      await client.send(new PutItemCommand({
        TableName,
        Item: {
          executionId: { S: String(executionId) },
          state: { S: 'SUCCESS' },
          resultJson: { S: JSON.stringify(result) },
          finishedAt: { S: finishedAt },
          expiresAt: { N: String(Math.floor(Date.now() / 1000) + DEFAULT_RETENTION_SECONDS) },
        },
        ConditionExpression: '#state = :inFlight',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':inFlight': { S: 'IN_FLIGHT' } },
      }));
    },

    async saveFailure(executionId, errorMessage, finishedAt) {
      await client.send(new PutItemCommand({
        TableName,
        Item: {
          executionId: { S: String(executionId) },
          state: { S: 'FAILED' },
          errorMessage: { S: String(errorMessage || 'Independent integration worker failed.').slice(0, 2000) },
          finishedAt: { S: finishedAt },
          expiresAt: { N: String(Math.floor(Date.now() / 1000) + DEFAULT_RETENTION_SECONDS) },
        },
        ConditionExpression: 'attribute_not_exists(#state) OR #state = :inFlight',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':inFlight': { S: 'IN_FLIGHT' } },
      }));
    },
  };
}
