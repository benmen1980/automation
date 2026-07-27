const prisma = require('../db/client');
const secrets = require('./secrets');

const SYSTEM_SECRET_ID = 'system';
const API_KEY = 'SENDGRID_API_KEY';
const CONFIG_KEYS = ['SENDGRID_DOMAIN', 'SENDGRID_FROM_EMAIL', 'SENDGRID_ERROR_RECIPIENTS'];

function parseRecipients(value) {
  return [...new Set(String(value || '').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))];
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateConfig({ domain, fromEmail, recipients }) {
  const normalizedDomain = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedDomain)) throw new Error('A valid SendGrid sender domain is required.');
  if (!validEmail(fromEmail)) throw new Error('A valid SendGrid from email is required.');
  if (fromEmail.trim().toLowerCase().split('@')[1] !== normalizedDomain) throw new Error('The From email domain must match the SendGrid domain.');
  if (!recipients.length) throw new Error('At least one error recipient email is required.');
  if (recipients.some((email) => !validEmail(email))) throw new Error('All error recipients must be valid email addresses.');
}

async function getConfig() {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: CONFIG_KEYS } } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    domain: values.SENDGRID_DOMAIN || '',
    fromEmail: values.SENDGRID_FROM_EMAIL || '',
    recipients: values.SENDGRID_ERROR_RECIPIENTS || '',
    configured: await secrets.hasSecret(SYSTEM_SECRET_ID, API_KEY),
  };
}

async function saveConfig({ apiKey, domain, fromEmail, recipients }) {
  const parsedRecipients = parseRecipients(recipients);
  const normalizedDomain = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  validateConfig({ domain: normalizedDomain, fromEmail, recipients: parsedRecipients });
  if (apiKey) await secrets.setSecret(SYSTEM_SECRET_ID, API_KEY, apiKey);
  await prisma.systemSetting.upsert({ where: { key: 'SENDGRID_DOMAIN' }, update: { value: normalizedDomain }, create: { key: 'SENDGRID_DOMAIN', value: normalizedDomain } });
  await prisma.systemSetting.upsert({ where: { key: 'SENDGRID_FROM_EMAIL' }, update: { value: fromEmail.trim() }, create: { key: 'SENDGRID_FROM_EMAIL', value: fromEmail.trim() } });
  await prisma.systemSetting.upsert({ where: { key: 'SENDGRID_ERROR_RECIPIENTS' }, update: { value: parsedRecipients.join('\n') }, create: { key: 'SENDGRID_ERROR_RECIPIENTS', value: parsedRecipients.join('\n') } });
  return getConfig();
}

async function send({ subject, text, to }) {
  const config = await getConfig();
  const apiKey = await secrets.getSecret(SYSTEM_SECRET_ID, API_KEY);
  const recipients = to || parseRecipients(config.recipients);
  validateConfig({ domain: config.domain, fromEmail: config.fromEmail, recipients });
  if (!apiKey) throw new Error('SendGrid API key is not configured.');

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ personalizations: [{ to: recipients.map((email) => ({ email })) }], from: { email: config.fromEmail }, subject, content: [{ type: 'text/plain', value: text }] }),
  });
  if (!response.ok) throw new Error(`SendGrid request failed (${response.status}).`);
  return { success: true, recipients };
}

module.exports = { getConfig, saveConfig, send, parseRecipients };
