const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PUBLIC_URL_FILE = 'local-data/ngrok-public-url.txt';

function normalizeBaseUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function resolvePublicUrlFile() {
  const configuredPath = process.env.NGROK_PUBLIC_URL_FILE || DEFAULT_PUBLIC_URL_FILE;
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(PROJECT_ROOT, configuredPath);
}

function readPublicBaseUrlFile() {
  try {
    return fs.readFileSync(resolvePublicUrlFile(), 'utf8');
  } catch {
    return '';
  }
}

function getPublicBaseUrl() {
  const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
  if (envBaseUrl) return envBaseUrl;
  if (process.env.NODE_ENV === 'test') return '';
  return normalizeBaseUrl(readPublicBaseUrlFile());
}

function buildPublicUrl(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return relativePath;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  const baseUrl = getPublicBaseUrl();
  const pathPart = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return baseUrl ? `${baseUrl}${pathPart}` : pathPart;
}

module.exports = {
  buildPublicUrl,
  getPublicBaseUrl,
  normalizeBaseUrl,
  resolvePublicUrlFile,
};
