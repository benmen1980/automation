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

function getRequestBaseUrl(req) {
  if (!req) return '';
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || (typeof req.get === 'function' ? req.get('host') : req.headers?.host);
  return normalizeBaseUrl(proto && host ? `${proto}://${host}` : '');
}

function buildPublicUrl(relativePath, req) {
  if (!relativePath || typeof relativePath !== 'string') return relativePath;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  const baseUrl = getRequestBaseUrl(req) || getPublicBaseUrl();
  const pathPart = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return baseUrl ? `${baseUrl}${pathPart}` : pathPart;
}

module.exports = {
  buildPublicUrl,
  getPublicBaseUrl,
  getRequestBaseUrl,
  normalizeBaseUrl,
  resolvePublicUrlFile,
};
