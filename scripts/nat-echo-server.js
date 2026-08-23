const http = require('http');

const port = Number(process.env.NAT_ECHO_PORT || 8787);

function getSourceIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(forwarded || req.socket.remoteAddress || '').split(',')[0].trim();
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8').slice(0, 32000);
    const result = {
      sourceIp: getSourceIp(req),
      forwardedFor: req.headers['x-forwarded-for'] || '',
      realIp: req.headers['x-real-ip'] || '',
      method: req.method,
      path: req.url,
      body,
      receivedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(result));
    res.writeHead(req.method === 'POST' ? 200 : 405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.method === 'POST' ? result : { error: 'POST required', endpoint: '/'}));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`NAT echo listener running at http://127.0.0.1:${port}`);
});
