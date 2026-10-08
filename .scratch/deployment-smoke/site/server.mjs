import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const assets = new Map();
for (const [path, file, type] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
]) {
  assets.set(path, { body: await readFile(new URL(file, import.meta.url)), type });
}

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const server = createServer({ requestTimeout: 10000, headersTimeout: 10000 }, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }

  const path = (req.url ?? '/').split('?')[0];
  let asset = assets.get(path);
  if (path === '/healthz') {
    asset = {
      type: 'application/json; charset=utf-8',
      body: JSON.stringify({ service: 'readytogo-smoke', ok: true, time: new Date().toISOString() }),
    };
  } else if (path === '/robots.txt') {
    asset = { type: 'text/plain; charset=utf-8', body: 'User-agent: *\nDisallow: /\n' };
  }
  if (!asset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : 'Not found');
  }
  res.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': Buffer.byteLength(asset.body) });
  res.end(req.method === 'HEAD' ? undefined : asset.body);
});

server.setTimeout(10000, (socket) => socket.destroy());
server.listen(port, host, () => console.log(`readytogo-smoke listening on ${host}:${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
