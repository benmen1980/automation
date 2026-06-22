/**
 * Queue abstraction. QUEUE_MODE=local runs the job in-process immediately
 * (good enough for local dev and for the webhook test path, which must
 * stay synchronous so the dashboard can show the result right away).
 * QUEUE_MODE=sqs would push to AWS SQS and let a worker process pick it
 * up — see CLAUDE.md 12.3. The SQS path is structured but not wired to a
 * real worker in this MVP; flipping QUEUE_MODE=sqs without deploying a
 * worker will just throw, by design (fail loud, not silently drop jobs).
 */
const QUEUE_MODE = process.env.QUEUE_MODE || 'local';

/**
 * Enqueues an execution job. `runFn` is the function that actually runs
 * the integration (execution-runner.runExecution). In local mode we just
 * await it directly; in sqs mode we'd publish a message instead and a
 * worker would call runFn later.
 */
async function enqueueExecution(runFn) {
  if (QUEUE_MODE === 'local') {
    return runFn();
  }

  if (QUEUE_MODE === 'sqs') {
    throw new Error(
      'QUEUE_MODE=sqs is not wired to a real SQS worker in this MVP. ' +
        'Implement publish-to-SQS here and a worker that calls execution-runner.runExecution ' +
        'with the message body, per CLAUDE.md section 12.3.'
    );
  }

  throw new Error(`Unknown QUEUE_MODE: ${QUEUE_MODE}`);
}

module.exports = { enqueueExecution };
