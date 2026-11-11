// The HTTP side: security headers, static files, the health check and the QR code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { startServer } from '../helpers/server.js';
import { resolveFile } from '../../server/static.js';
import { RateLimiter, Bucket, clientAddress } from '../../server/security.js';

test('the health check answers at /healthz', async (t) => {
  const s = await startServer(t);
  const res = await s.api('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { ok: true, store: 'memory', rooms: 0, pendingResults: 0 });
});

test('every kind of answer carries the security headers', async (t) => {
  const s = await startServer(t);
  for (const route of ['/', '/play', '/healthz', '/api/leaderboard', '/game/config.js', '/does-not-exist', '/api/nope']) {
    const res = await fetch(s.base + route);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, `CSP on ${route}`);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/, 'scripts only from our own files: no inline scripts');
    assert.equal(/unsafe-inline|unsafe-eval/.test(csp), false);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(csp, "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    await res.arrayBuffer();
  }
});

test('the pages contain no inline scripts, inline styles or event attributes (they would break the CSP)', () => {
  const pages = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (file.endsWith('.html')) pages.push(file);
    }
  };
  walk('public');
  assert.ok(pages.length >= 2, 'host and phone page exist');
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    for (const tag of html.match(/<script\b[^>]*>/g) || []) assert.match(tag, /\bsrc="/, `${file}: ${tag}`);
    assert.equal(/<script\b[^>]*>[^<]*\S[^<]*<\/script>/.test(html), false, `${file}: inline script`);
    assert.equal(/<style\b/.test(html), false, `${file}: inline <style>`);
    assert.equal(/\sstyle="/.test(html), false, `${file}: style attribute`);
    assert.equal(/\son[a-z]+="/.test(html), false, `${file}: inline event handler`);
    assert.equal(/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, '')), false, `${file}: loads something from another site`);
  }
});

test('the host page is at /, the controller at /play, and the game logic at /game/', async (t) => {
  const s = await startServer(t);
  const host = await fetch(`${s.base}/`);
  assert.equal(host.status, 200);
  assert.match(host.headers.get('content-type'), /text\/html/);
  const play = await fetch(`${s.base}/play?room=ABCD`);
  assert.equal(play.status, 200);
  assert.match(await play.text(), /NOVA Brawl/);
  const logic = await fetch(`${s.base}/game/match.js`);
  assert.equal(logic.status, 200);
  assert.match(logic.headers.get('content-type'), /javascript/);
  // Unchanged files are answered with 304.
  const again = await fetch(`${s.base}/game/match.js`, { headers: { 'If-None-Match': logic.headers.get('etag') } });
  assert.equal(again.status, 304);
});

test('files outside the public folders cannot be read', async (t) => {
  const s = await startServer(t);
  const { default: http } = await import('node:http');
  const raw = (route) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: s.port, path: route }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  for (const route of [
    '/../package.json', '/game/../../package.json', '/game/../../.env', '/%2e%2e/package.json', '/game/%2e%2e/%2e%2e/server/index.js',
    '/..%2f..%2fpackage.json', '/host/..\\..\\package.json', '/game/%00.js', '/server/index.js', '/.env', '/.env.example', '/package.json',
    '/tests/helpers/server.js', '/apps-script/Code.gs', '/.git/config', '/%', '/game/', '/host/.hidden.js',
    '/game/..%2f..%2fpackage.json', '/host/..%2f..%2fserver%2findex.js', '/game/%2e%2e%2f%2e%2e%2fpackage.json', '/shared/..%2f..%2f.env.example',
  ]) {
    assert.equal(await raw(route), 404, route);
  }
  assert.equal(resolveFile('/game/../../package.json'), null);
  assert.equal(resolveFile('/game/config.js').endsWith(path.join('src', 'game', 'config.js')), true);
  assert.equal(resolveFile('/host/../../server/index.js'), null);
  assert.equal(resolveFile('/README.md'), null, 'unknown file types are never served');
  assert.equal(resolveFile('/host/.hidden.js'), null, 'files starting with a dot are never served');
  assert.equal(resolveFile('/game/..%2f..%2fpackage.json'), null);
  assert.notEqual(resolveFile('/host/main.js'), null);
});

test('pages only accept GET and HEAD', async (t) => {
  const s = await startServer(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await fetch(`${s.base}/`, { method });
    assert.equal(res.status, 405, method);
  }
  const head = await fetch(`${s.base}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.text()).length, 0);
});

test('the QR code encodes the join link for the room', async (t) => {
  const s = await startServer(t);
  const res = await fetch(`${s.base}/api/qr?room=ABCD`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  assert.equal(res.headers.get('x-join-link'), `http://127.0.0.1:${s.port}/play?room=ABCD`);
  const svg = await res.text();
  assert.match(svg, /^<svg /);
  assert.equal(/<script/i.test(svg), false);
});

test('the QR code is refused for anything that is not a room code', async (t) => {
  const s = await startServer(t);
  for (const room of ['', 'abc', 'ABCDE', 'AB1D', '<svg>', '../x', 'ABCD&x=1']) {
    const res = await fetch(`${s.base}/api/qr?room=${encodeURIComponent(room)}`);
    assert.equal(res.status, 400, room);
  }
  assert.equal((await fetch(`${s.base}/api/qr`)).status, 400);
});

test('the QR link is https for a public host name and http only for local addresses', async (t) => {
  const s = await startServer(t);
  const { default: http } = await import('node:http');
  const linkFor = (host) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: s.port, path: '/api/qr?room=ABCD', headers: { Host: host } }, (res) => {
      res.resume();
      resolve(res.headers['x-join-link'] || res.statusCode);
    }).on('error', reject);
  });
  assert.equal(await linkFor('nova-brawl.onrender.com'), 'https://nova-brawl.onrender.com/play?room=ABCD');
  assert.equal(await linkFor('mac-mini.tail1234.ts.net'), 'https://mac-mini.tail1234.ts.net/play?room=ABCD');
  assert.equal(await linkFor('localhost:3000'), 'http://localhost:3000/play?room=ABCD');
  assert.equal(await linkFor('192.168.1.20:3000'), 'http://192.168.1.20:3000/play?room=ABCD');
  assert.equal(await linkFor('172.20.10.4:3000'), 'http://172.20.10.4:3000/play?room=ABCD', 'a phone hotspot address is local too');
  assert.equal(await linkFor('172.99.1.1'), 'https://172.99.1.1/play?room=ABCD', 'outside 172.16 to 172.31 it is public');
  assert.equal(await linkFor('10.0.0.5:3000'), 'http://10.0.0.5:3000/play?room=ABCD');
  assert.equal(await linkFor('evil.example/x?y=<script>'), 400, 'a host header with odd characters is refused');
});

test('behind a proxy the forwarded address is used for limits', async () => {
  const req = (xff) => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: '10.0.0.1' } });
  assert.equal(clientAddress(req('1.1.1.1, 2.2.2.2'), true), '2.2.2.2', 'the entry the proxy itself added');
  assert.equal(clientAddress(req('1.1.1.1, 2.2.2.2'), false), '10.0.0.1', 'without a proxy the header is ignored');
  assert.equal(clientAddress(req(undefined), true), '10.0.0.1');
});

test('unknown API routes answer 404 as JSON and the achievements list is public', async (t) => {
  const s = await startServer(t);
  const nope = await s.api('/api/nope');
  assert.equal(nope.status, 404);
  assert.equal(nope.data.error, 'Not found.');
  const list = await s.api('/api/achievements');
  assert.equal(list.data.achievements.length, 8);
  assert.deepEqual(list.data.achievements[0], { id: 'first_win', name: 'First Win', text: 'Win a match.' });
});

test('the rate limiter counts per key and per minute; the bucket refills over time', () => {
  const limiter = new RateLimiter();
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.allow('a', 3, 1000)), [true, true, true, false]);
  assert.equal(limiter.allow('b', 3, 1000), true, 'another address has its own count');
  assert.equal(limiter.allow('a', 3, 61_001), true, 'a new minute');
  limiter.sweep(200_000);
  assert.equal(limiter.hits.size, 0);

  const bucket = new Bucket(10, 0);
  let passed = 0;
  for (let i = 0; i < 100; i++) if (bucket.take(0)) passed += 1;
  assert.equal(passed, 20, 'a burst of twice the rate');
  assert.equal(bucket.take(0), false);
  assert.equal(bucket.take(100), true, '100 ms later one more token is there');
  assert.equal(bucket.take(100), false);
});
