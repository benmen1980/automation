/**
 * CRUD helpers around the Execution model. Kept separate from
 * execution-runner.js so routes can list/fetch executions without pulling
 * in the whole run-a-handler machinery.
 */
const prisma = require('../db/client');

async function createExecution({ userId, integrationId, triggerType, executionMode, inputPayload, sourceExecutionId }) {
  return prisma.execution.create({
    data: {
      userId,
      integrationId,
      triggerType,
      executionMode,
      status: 'pending',
      inputPayload: inputPayload !== undefined ? JSON.stringify(inputPayload) : null,
      sourceExecutionId: sourceExecutionId || null,
    },
  });
}

async function markQueued(executionId, queueMetadata = {}) {
  return prisma.execution.update({
    where: { id: executionId },
    data: {
      status: 'queued',
      queueMessageId: queueMetadata.messageId || null,
      queueUrl: queueMetadata.queueUrl || null,
    },
  });
}

async function markRunning(executionId) {
  return prisma.execution.update({
    where: { id: executionId },
    data: { status: 'running', startedAt: new Date() },
  });
}

async function markSuccess(executionId, outputPayload) {
  return prisma.execution.update({
    where: { id: executionId },
    data: {
      status: 'success',
      outputPayload: outputPayload !== undefined ? JSON.stringify(outputPayload) : null,
      finishedAt: new Date(),
    },
  });
}

async function markFailed(executionId, errorMessage) {
  return prisma.execution.update({
    where: { id: executionId },
    data: {
      status: 'failed',
      errorMessage: String(errorMessage).slice(0, 4000),
      finishedAt: new Date(),
    },
  });
}

async function getExecutionById(executionId) {
  return prisma.execution.findUnique({ where: { id: executionId } });
}

async function getExecutionForQueue(executionId) {
  return prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      integration: {
        select: {
          id: true,
          userId: true,
          slug: true,
          name: true,
          type: true,
          codeFolder: true,
          credentials: {
            select: { key: true, valueReference: true, isSecret: true },
          },
        },
      },
      user: {
        select: { id: true, slug: true, email: true },
      },
    },
  });
}

async function listExecutionsForIntegration(integrationId, { take = 50 } = {}) {
  return prisma.execution.findMany({
    where: { integrationId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

async function claimForWorker(executionId, integrationId) {
  const claimedAt = new Date();
  const claimed = await prisma.execution.updateMany({
    where: {
      id: executionId,
      integrationId,
      status: { in: ['queued', 'retrying'] },
    },
    data: { status: 'running', startedAt: claimedAt, finishedAt: null, errorMessage: null },
  });
  if (claimed.count === 1) return { accepted: true, status: 'running', startedAt: claimedAt };

  const existing = await prisma.execution.findFirst({ where: { id: executionId, integrationId } });
  if (!existing) return null;
  return {
    accepted: false,
    status: existing.status,
    alreadyCompleted: existing.status === 'success',
    inProgress: existing.status === 'running',
  };
}

async function markRetrying(executionId, integrationId, errorMessage) {
  return prisma.execution.update({
    where: { id: executionId, integrationId },
    data: {
      status: 'retrying',
      errorMessage: String(errorMessage || 'Worker retry requested.').slice(0, 4000),
      finishedAt: null,
    },
  });
}

module.exports = {
  createExecution,
  markQueued,
  markRunning,
  markSuccess,
  markFailed,
  getExecutionById,
  getExecutionForQueue,
  listExecutionsForIntegration,
  claimForWorker,
  markRetrying,
};
