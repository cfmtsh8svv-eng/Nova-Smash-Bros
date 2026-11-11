// The whole server in one place: static files, the JSON API and the WebSocket relay.
// createApp() builds it without starting to listen, so the tests can run it on a random port.
import http from 'node:http';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { LIMITS } from './config.js';
import { clientAddress, RateLimiter, securityHeaders } from './security.js';
import { createToken, hashPin, LoginGuard, newSalt, Sessions, verifyPin } from './accounts.js';
import { gamertagProblem, isPlainObject, isRoomCode, pinProblem } from './validate.js';
import { DataService } from './data.js';
import { MemoryStore, StoreError } from './store/memory.js';
import { Rooms } from './rooms.js';
import { serveStatic } from './static.js';
import { ACHIEVEMENTS } from './results.js';

const UNAVAILABLE = "Can't reach the player list right now. Players who already logged in today can still play.";

export function createApp({ config, store = new MemoryStore(), now = () => Date.now(), log = () => {}, autoRetry = true } = {}) {
  const data = new DataService(store, { now, log, autoRetry });
  const sessions = new Sessions();
  const guard = new LoginGuard();
  const limiter = new RateLimiter();
  const rooms = new Rooms({ data, sessions, config, limiter, now, log });
  const baseHeaders = securityHeaders();

  function json(res, status, body, extra = {}) {
    const text = JSON.stringify(body);
    res.writeHead(status, { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text), ...extra });
    res.end(text);
  }

  // Read a small JSON body. Anything too big or not JSON is refused.
  function readBody(req) {
    return new Promise((resolve) => {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return resolve({ error: 415 });
      let size = 0;
      const chunks = [];
      let tooBig = false;
      req.on('data', (chunk) => {
        if (tooBig) return; // keep reading (and ignoring) so the answer can still be delivered
        size += chunk.length;
        if (size > LIMITS.httpBodyBytes) {
          tooBig = true;
          chunks.length = 0;
          resolve({ error: 413 });
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (tooBig) return;
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(isPlainObject(body) ? { body } : { error: 400 });
        } catch {
          resolve({ error: 400 });
        }
      });
      req.on('error', () => resolve({ error: 400 }));
    });
  }

  const BODY_ERRORS = { 400: 'The request was not valid JSON.', 413: 'The request is too large.', 415: 'Send JSON.' };

  async function register(req, res) {
    const { body, error } = await readBody(req);
    if (error) return json(res, error, { error: BODY_ERRORS[error] }, error === 413 ? { Connection: 'close' } : {});
    const problem = gamertagProblem(body.gamertag);
    if (problem) return json(res, 400, { error: problem, field: 'gamertag' });
    if (pinProblem(body.pin)) return json(res, 400, { error: pinProblem(body.pin), field: 'pin' });
    if (body.pin !== body.pin2) return json(res, 400, { error: 'The two PINs do not match.', field: 'pin2' });
    const lower = body.gamertag.toLowerCase();
    try {
      if (await data.getPlayer(lower)) return json(res, 409, { error: 'That gamertag is taken.', field: 'gamertag' });
      const salt = newSalt();
      const row = await data.createPlayer({ gamertag: body.gamertag, gamertag_lower: lower, salt, pin_hash: await hashPin(body.pin, salt, config.pinPepper), created_at: new Date(now()).toISOString() });
      const sid = sessions.start(lower);
      rooms.signOutOthers(lower, sid);
      return json(res, 201, { gamertag: row.gamertag, token: createToken(row.gamertag, sid, config.sessionSecret, now()) });
    } catch (err) {
      if (err instanceof StoreError && err.code === 'duplicate') return json(res, 409, { error: 'That gamertag is taken.', field: 'gamertag' });
      if (err instanceof StoreError) return json(res, 503, { error: `${UNAVAILABLE} New players cannot register until it is back.` });
      throw err;
    }
  }

  async function login(req, res) {
    const { body, error } = await readBody(req);
    if (error) return json(res, error, { error: BODY_ERRORS[error] }, error === 413 ? { Connection: 'close' } : {});
    const problem = gamertagProblem(body.gamertag);
    if (problem) return json(res, 400, { error: problem, field: 'gamertag' });
    if (pinProblem(body.pin)) return json(res, 400, { error: pinProblem(body.pin), field: 'pin' });
    const lower = body.gamertag.toLowerCase();
    const locked = guard.lockedFor(lower, now());
    const lockedReply = (seconds) => json(res, 429, { error: `Too many wrong PINs. Try again in ${Math.ceil(seconds / 60)} min.`, field: 'pin', retryAfterS: seconds }, { 'Retry-After': String(seconds) });
    if (locked) return lockedReply(locked);
    let row;
    try {
      row = await data.getPlayer(lower);
    } catch (err) {
      if (err instanceof StoreError) return json(res, 503, { error: UNAVAILABLE });
      throw err;
    }
    if (!row) return json(res, 404, { error: 'No player with that gamertag. Register first.', field: 'gamertag' });
    if (!(await verifyPin(body.pin, row.salt, row.pin_hash, config.pinPepper))) {
      const left = guard.fail(lower, now());
      if (left === 0) return lockedReply(guard.lockedFor(lower, now()));
      return json(res, 401, { error: `Wrong PIN, ${left} ${left === 1 ? 'try' : 'tries'} left.`, field: 'pin', triesLeft: left });
    }
    guard.success(lower);
    const sid = sessions.start(lower);
    rooms.signOutOthers(lower, sid);
    return json(res, 200, { gamertag: row.gamertag, token: createToken(row.gamertag, sid, config.sessionSecret, now()) });
  }

  // The QR code for joining a room, as an SVG image.
  async function qr(req, res, url) {
    const room = url.searchParams.get('room');
    if (!isRoomCode(room)) return json(res, 400, { error: 'Room code must be 4 letters.' });
    const host = String(req.headers.host || '');
    if (!/^[A-Za-z0-9.:[\]-]{1,255}$/.test(host)) return json(res, 400, { error: 'Bad host.' });
    // Public hosts (Render, Tailscale Funnel) are always reached over https. Only a local
    // address (localhost, a home-network IP, a bare machine name) is plain http.
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[|[^.]+$)/.test(host.replace(/:\d+$/, ''));
    const proto = req.socket.encrypted || !local ? 'https' : 'http';
    const link = `${proto}://${host}/play?room=${room}`;
    const svg = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#16122a', light: '#ffffff' } });
    res.writeHead(200, { ...baseHeaders, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Join-Link': link });
    res.end(svg);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    const address = clientAddress(req, config.trustProxy);

    if (route === '/healthz') return json(res, 200, { ok: true, store: store.kind, rooms: rooms.rooms.size, pendingResults: data.pending });

    if (route.startsWith('/api/')) {
      if (!limiter.allow(`api:${address}`, LIMITS.apiPerMinutePerAddress, now())) return json(res, 429, { error: 'Too many requests. Wait a moment.' }, { 'Retry-After': '30' });
      if (route === '/api/register' || route === '/api/login') {
        if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' }, { Allow: 'POST' });
        if (!limiter.allow(`auth:${address}`, LIMITS.authPerMinutePerAddress, now())) return json(res, 429, { error: 'Too many attempts. Wait a minute.' }, { 'Retry-After': '60' });
        return route === '/api/register' ? register(req, res) : login(req, res);
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Use GET.' }, { Allow: 'GET' });
      if (route === '/api/leaderboard') return json(res, 200, await data.leaderboard());
      if (route === '/api/achievements') return json(res, 200, { achievements: ACHIEVEMENTS });
      if (route === '/api/qr') return qr(req, res, url);
      return json(res, 404, { error: 'Not found.' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    if (await serveStatic(req, res, route, baseHeaders)) return undefined;
    res.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      log(`request failed: ${err.stack || err.message}`);
      if (!res.headersSent) json(res, 500, { error: 'Something went wrong on the server.' });
      else res.destroy();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  // ---- WebSocket ----
  // maxPayload makes the ws library itself drop anything larger before we see it.
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.hostMessageBytes, perMessageDeflate: false });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    // A browser always sends Origin. It must be our own site, so another website
    // cannot open a socket in a visitor's name. Tools without Origin (the tests) are fine.
    const origin = req.headers.origin;
    let sameSite = true;
    if (origin) {
      try {
        sameSite = new URL(origin).host === req.headers.host;
      } catch {
        sameSite = false;
      }
    }
    if (url.pathname !== '/ws' || !sameSite) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = rooms.connect(ws, clientAddress(req, config.trustProxy));
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      ws.on('message', (message, isBinary) => rooms.receive(conn, message, isBinary));
      ws.on('close', () => rooms.disconnect(conn));
      ws.on('error', () => { /* a broken socket closes right after; nothing to do */ });
    });
  });

  // Sockets that stopped answering (a phone that lost its network) are closed,
  // which frees the slot logic to treat the player as disconnected.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch { /* closing */ }
    }
  }, LIMITS.socketPingMs);
  heartbeat.unref();

  const housekeeping = setInterval(() => {
    rooms.sweep();
    limiter.sweep(now());
    guard.sweep(now());
  }, 60_000);
  housekeeping.unref();

  function close() {
    clearInterval(heartbeat);
    clearInterval(housekeeping);
    data.stop();
    rooms.closeAll();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    return new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  function listen(port = config.port, host) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve(server.address().port));
    });
  }

  return { server, wss, rooms, data, sessions, guard, limiter, store, listen, close };
}
