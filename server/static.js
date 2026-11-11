// Serves the client files. Only three folders are public, and a request can
// never leave them (no "../" tricks).
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const GAME = path.join(ROOT, 'src', 'game');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Turn a URL path into a file path inside one of the public folders, or null.
export function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded === '/') decoded = '/host/index.html';
  else if (decoded === '/play' || decoded === '/play/') decoded = '/play/index.html';
  else if (decoded === '/host' || decoded === '/host/') decoded = '/host/index.html';
  const [base, rest] = decoded.startsWith('/game/') ? [GAME, decoded.slice('/game/'.length)] : [PUBLIC, decoded.slice(1)];
  const file = path.resolve(base, rest);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  if (!TYPES[path.extname(file)]) return null;
  if (path.basename(file).startsWith('.')) return null;
  return file;
}

export async function serveStatic(req, res, urlPath, headers) {
  const file = resolveFile(urlPath);
  let info = null;
  if (file) info = await stat(file).catch(() => null);
  if (!file || !info || !info.isFile()) return false;
  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const head = { ...headers, 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, head);
    res.end();
    return true;
  }
  res.writeHead(200, { ...head, 'Content-Length': info.size });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return true;
}
