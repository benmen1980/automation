#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const ngrok = require('@ngrok/ngrok');
const { sanitizeString } = require('../src/utils/sanitize-logs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const publicUrlFile = path.resolve(PROJECT_ROOT, process.env.NGROK_PUBLIC_URL_FILE || 'local-data/ngrok-public-url.txt');
const target = process.env.NGROK_TARGET_ADDR || `localhost:${process.env.NGROK_TARGET_PORT || process.env.PORT || 3000}`;
const targetDisplay = /^https?:\/\//i.test(target) ? target : `http://${target}`;
let listener;
let keepAliveTimer;

function writePublicUrl(url) {
  fs.mkdirSync(path.dirname(publicUrlFile), { recursive: true });
  fs.writeFileSync(publicUrlFile, `${url}\n`);
}

function removePublicUrl() {
  try {
    fs.rmSync(publicUrlFile, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function printUsageAndExit() {
  console.error('NGROK_AUTHTOKEN is required to start the local tunnel.');
  console.error('Add it to your local .env file or user environment, then run: npm run dev:tunnel');
  process.exit(1);
}

async function shutdown() {
  removePublicUrl();
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  if (listener) {
    await listener.close().catch(() => {});
  }
  process.exit(0);
}

async function main() {
  if (!process.env.NGROK_AUTHTOKEN) printUsageAndExit();

  const options = {
    addr: target,
    authtoken_from_env: true,
    schemes: ['HTTPS'],
  };
  if (process.env.NGROK_DOMAIN) options.domain = process.env.NGROK_DOMAIN;

  listener = await ngrok.forward(options);
  const publicUrl = listener.url();
  writePublicUrl(publicUrl);

  console.log('ngrok tunnel started.');
  console.log(`Target: ${targetDisplay}`);
  console.log(`Public API base: ${publicUrl}`);
  console.log(`Webhook base: ${publicUrl}/webhooks`);
  console.log(`Public URL file: ${publicUrlFile}`);
  console.log('For manual API checks, add header: ngrok-skip-browser-warning: true');
  console.log('Keep this process running while testing external webhooks.');

  keepAliveTimer = setInterval(() => {}, 60 * 60 * 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  removePublicUrl();
  console.error(`Failed to start ngrok tunnel: ${sanitizeString(err.message || String(err))}`);
  process.exit(1);
});
