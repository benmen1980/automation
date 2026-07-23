import { readSecretByReference } from '@automation/shared/configLoader';

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;

function documentUploadUrl(statusCallbackUrl) {
  const parsed = new URL(statusCallbackUrl);
  if (!/\/status$/.test(parsed.pathname)) {
    throw new Error('Worker status callback URL cannot be used for document storage.');
  }
  parsed.pathname = parsed.pathname.replace(/\/status$/, '/document');
  return parsed.toString();
}

async function callbackToken(env) {
  let token = String(env.AUTOMATION_WORKER_CALLBACK_TOKEN || '').trim();
  if (!token && env.AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID) {
    token = String(
      await readSecretByReference(
        env.AUTOMATION_WORKER_CALLBACK_TOKEN_SECRET_ID,
        env
      )
    ).trim();
  }
  if (!token) {
    throw new Error(
      'AUTOMATION_WORKER_CALLBACK_TOKEN is required to save the document on the automation server.'
    );
  }
  return token;
}

function serverDocumentFailure(message, retryable = false) {
  const error = new Error(message);
  error.retryable = retryable;
  error.providerError = {
    api: 'automation document storage',
    action: 'copy Priority confirmation to automation server',
  };
  return error;
}

export function buildMockServerDocumentUrl() {
  return 'https://automation.example.test/documents/priority-orders/mock-sales-order-confirmation.pdf';
}

export async function archivePriorityDocument(
  job,
  sourceUrl,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}
) {
  if (!job.statusCallbackUrl) {
    throw serverDocumentFailure(
      'Automation server document upload URL is missing from the worker job.'
    );
  }

  let source;
  let uploadUrl;
  try {
    source = new URL(sourceUrl);
    uploadUrl = documentUploadUrl(job.statusCallbackUrl);
  } catch {
    throw serverDocumentFailure(
      'Priority or automation server returned an invalid document URL.'
    );
  }
  if (source.protocol !== 'https:' || new URL(uploadUrl).protocol !== 'https:') {
    throw serverDocumentFailure(
      'Priority and automation server document URLs must use HTTPS.'
    );
  }

  const token = await callbackToken(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const sourceResponse = await fetchImpl(source.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    if (!sourceResponse.ok) {
      throw serverDocumentFailure(
        `Priority document download failed with HTTP ${sourceResponse.status}.`,
        sourceResponse.status >= 500
      );
    }

    const declaredLength = Number(sourceResponse.headers?.get?.('content-length') || 0);
    if (declaredLength > MAX_DOCUMENT_BYTES) {
      throw serverDocumentFailure(
        'Priority document is larger than the 5 MB server limit.'
      );
    }
    const document = Buffer.from(await sourceResponse.arrayBuffer());
    if (!document.length) {
      throw serverDocumentFailure('Priority returned an empty document.');
    }
    if (document.length > MAX_DOCUMENT_BYTES) {
      throw serverDocumentFailure(
        'Priority document is larger than the 5 MB server limit.'
      );
    }

    const uploadResponse = await fetchImpl(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${token}`,
        'X-Integration-Id': String(job.integrationId || ''),
      },
      body: document,
      signal: controller.signal,
    });
    const responseText = await uploadResponse.text();
    let responseBody = {};
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = {};
    }
    if (!uploadResponse.ok) {
      throw serverDocumentFailure(
        `Automation server document upload failed with HTTP ${uploadResponse.status}.`,
        uploadResponse.status >= 500
      );
    }

    const documentUrl = String(responseBody.documentUrl || '').trim();
    let parsedDocumentUrl;
    try {
      parsedDocumentUrl = new URL(documentUrl);
    } catch {
      throw serverDocumentFailure(
        'Automation server did not return a valid document URL.'
      );
    }
    if (parsedDocumentUrl.protocol !== 'https:') {
      throw serverDocumentFailure(
        'Automation server document URL must use HTTPS.'
      );
    }
    return parsedDocumentUrl.toString();
  } catch (error) {
    if (error.providerError) throw error;
    throw serverDocumentFailure(
      error.name === 'AbortError'
        ? `Priority document copy timed out after ${timeoutMs}ms.`
        : 'Priority document could not be copied to the automation server.',
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}
