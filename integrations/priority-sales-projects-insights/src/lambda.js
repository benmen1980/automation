import { createLogger, loadConfig, normalizeError } from '@automation/shared';
import { handler as runIntegration } from './handler.js';

export async function handler(event) {
  const records = event.Records || [{ body: JSON.stringify(event) }];
  const results = [];

  for (const record of records) {
    const job = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
    const context = {
      logger: createLogger({ service: 'priority-sales-projects-insights', jobId: job.id || record.messageId }),
      config: loadConfig(job),
      mocks: job.mocks || {},
      status: 'running',
    };

    try {
      results.push(await runIntegration(job, context));
    } catch (error) {
      context.logger.error('Priority sales-projects worker failed.', normalizeError(error));
      throw error;
    }
  }

  return { success: true, results };
}
