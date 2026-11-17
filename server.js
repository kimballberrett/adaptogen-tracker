// Local development server. The app itself has no backend: all data lives on the phone
// (public/local.js), and production is plain static hosting (GitHub Pages). This just
// serves public/ so you can try it at http://localhost:3000.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = join(import.meta.dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url.replace(/^\/+/, '/'), 'http://localhost');
    let file = normalize(join(PUBLIC_DIR, decodeURIComponent(pathname)));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) throw Object.assign(new Error(), { status: 403 });
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(PUBLIC_DIR, 'index.html');
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-cache', vary: 'accept-encoding' };
    let body = await readFile(file);
    // Gzip text files: over a slow link (Tailscale Funnel) bytes are what cost time.
    if (/text|javascript|svg|json/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (err) {
    res.writeHead(err.status ?? 500);
    res.end();
  }
}).listen(PORT, () => console.log(`Sips dev server on http://localhost:${PORT}`));
