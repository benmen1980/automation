const fs = require('fs');
const path = require('path');
const { buildPublicUrl } = require('./public-url');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DOCUMENT_DIRECTORY = path.join(
  PROJECT_ROOT,
  'local-data',
  'priority-order-documents'
);
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const PDF_TRAILER_MARKER = '%%EOF';
const TRAILER_WINDOW_BYTES = 4096;

function assertCompletePdfDocument(document, documentPath) {
  const header = document.slice(0, 8).toString('latin1');
  if (!header.startsWith('%PDF')) {
    throw new Error(`The copied document at ${documentPath} is not a PDF file.`);
  }
  if (!document.includes('startxref')) {
    throw new Error('The copied Priority PDF document is missing the xref table marker.');
  }
  const trailerIndex = document.lastIndexOf(PDF_TRAILER_MARKER);
  if (trailerIndex < 0) {
    throw new Error('The copied Priority PDF document is incomplete or corrupted.');
  }
  const trailerWindow = document.slice(Math.max(0, trailerIndex - TRAILER_WINDOW_BYTES), trailerIndex + PDF_TRAILER_MARKER.length);
  const trailerText = trailerWindow.toString('latin1');
  if (!/%%EOF/.test(trailerText)) {
    throw new Error('The copied Priority PDF document trailer is incomplete or truncated.');
  }
}

function documentFileName(executionId) {
  const value = String(executionId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new Error('A valid execution ID is required to store the Priority document.');
  }
  return `${value}.pdf`;
}

function priorityDocumentPath(executionId) {
  return `/documents/priority-orders/${encodeURIComponent(documentFileName(executionId))}`;
}

function priorityDocumentUrl(executionId) {
  return buildPublicUrl(priorityDocumentPath(executionId));
}

async function storePriorityDocument(executionId, content) {
  const document = Buffer.isBuffer(content) ? content : Buffer.from(content || '');
  if (!document.length) throw new Error('The Priority document is empty.');
  if (document.length > MAX_DOCUMENT_BYTES) {
    throw new Error('The Priority document is larger than the 5 MB server limit.');
  }

  await fs.promises.mkdir(DOCUMENT_DIRECTORY, { recursive: true });
  const filePath = path.join(DOCUMENT_DIRECTORY, documentFileName(executionId));
  assertCompletePdfDocument(document, filePath);
  await fs.promises.writeFile(filePath, document);
  return {
    filePath,
    publicPath: priorityDocumentPath(executionId),
    documentUrl: priorityDocumentUrl(executionId),
  };
}

async function copyPriorityDocumentFromUrl(
  executionId,
  sourceUrl,
  { fetchImpl = globalThis.fetch } = {}
) {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error('Priority returned an invalid sales order confirmation URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Priority sales order confirmation URL must use HTTPS.');
  }

  const response = await fetchImpl(parsed.toString());
  if (!response.ok) {
    throw new Error(`Priority document download failed with HTTP ${response.status}.`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > 0 && content.length !== declaredLength) {
    throw new Error('Priority document download returned a partial payload.');
  }
  return storePriorityDocument(executionId, content);
}

module.exports = {
  DOCUMENT_DIRECTORY,
  MAX_DOCUMENT_BYTES,
  copyPriorityDocumentFromUrl,
  documentFileName,
  priorityDocumentPath,
  priorityDocumentUrl,
  storePriorityDocument,
};
