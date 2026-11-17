// Local development server. The app itself has no backend: all data lives on the phone
// (public/local.js), and production is plain static hosting (GitHub Pages). This just
// serves public/ so you can try it at http://localhost:3000.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';

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
    const { pathname } = new URL(req.url, 'http://localhost');
    let file = normalize(join(PUBLIC_DIR, decodeURIComponent(pathname)));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) throw Object.assign(new Error(), { status: 403 });
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(err.status ?? 500);
    res.end();
  }
}).listen(PORT, () => console.log(`Sips dev server on http://localhost:${PORT}`));
