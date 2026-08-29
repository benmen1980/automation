#!/usr/bin/env node
const http = require('http');

const port = Number(process.env.NAT_ECHO_PORT || 8787);

function firstForwardedIp(value) {
  return String(value || '').split(',')[0].trim();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'POST JSON here to inspect the source IP.' }));
    return;
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const result = {
      ok: true,
      method: req.method,
      sourceIp: firstForwardedIp(req.headers['x-forwarded-for']) || req.socket.remoteAddress,
      forwardedFor: req.headers['x-forwarded-for'] || null,
      realIp: req.headers['x-real-ip'] || null,
      body: body.slice(0, 32000),
      receivedAt: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`NAT echo server listening on http://127.0.0.1:${port}`);
  console.log('Start ngrok with: ngrok http 8787');
});
