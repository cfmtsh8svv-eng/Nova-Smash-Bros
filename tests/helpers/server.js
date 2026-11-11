// Shared helpers for the server tests: start the real server on a random port
// with the in-memory store, and talk to it over real HTTP and WebSockets.
import WebSocket from 'ws';
import { createApp } from '../../server/app.js';
import { MemoryStore } from '../../server/store/memory.js';

export const TEST_CONFIG = { port: 0, trustProxy: false, useSheets: false, pinPepper: 'test-pepper-0123456789', sessionSecret: 'test-session-secret-0123456789', warnings: [] };

// Starts a server. `clock.now` can be moved forward by the test (lockouts, token expiry).
export async function startServer(t, { store = new MemoryStore(), config = {} } = {}) {
  const clock = { now: Date.now() };
  const app = createApp({ config: { ...TEST_CONFIG, ...config }, store, now: () => clock.now, autoRetry: false });
  const port = await app.listen(0, '127.0.0.1');
  const sockets = [];
  t.after(async () => {
    for (const s of sockets) s.terminate();
    await app.close();
  });
  const base = `http://127.0.0.1:${port}`;

  const api = async (path, body, options = {}) => {
    const res = await fetch(base + path, body === undefined ? options : {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch { /* not JSON */ }
    return { status: res.status, data, headers: res.headers };
  };

  // Open a WebSocket. Every message that arrives is kept, so tests can wait for one.
  const open = (headers = {}) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    sockets.push(ws);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      for (const w of [...waiters]) w();
    });
    const client = {
      ws, inbox,
      send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
      // Wait for the next message of this type (after `from` messages already seen).
      next(type, { timeout = 2000, match = () => true } = {}) {
        return new Promise((res, rej) => {
          const look = () => {
            const i = inbox.findIndex((m) => m.t === type && match(m));
            if (i < 0) return false;
            const [msg] = inbox.splice(i, 1);
            clearTimeout(timer);
            waiters.splice(waiters.indexOf(look), 1);
            res(msg);
            return true;
          };
          const timer = setTimeout(() => {
            waiters.splice(waiters.indexOf(look), 1);
            rej(new Error(`no "${type}" message within ${timeout} ms; got: ${inbox.map((m) => m.t).join(', ') || 'nothing'}`));
          }, timeout);
          waiters.push(look);
          look();
        });
      },
      // Send something and wait for the server to have handled it (ping is answered in order).
      async settle() {
        const n = Math.floor(Math.random() * 1e9);
        client.send({ t: 'ping', n });
        await client.next('pong', { match: (m) => m.n === n });
      },
      close: () => new Promise((res) => {
        if (ws.readyState === WebSocket.CLOSED) return res();
        ws.once('close', () => res());
        ws.close();
      }),
      closed: new Promise((res) => ws.once('close', (code) => res(code))),
    };
    ws.once('open', () => resolve(client));
    ws.once('error', reject);
    ws.once('unexpected-response', (req, res) => reject(new Error(`upgrade refused: ${res.statusCode}`)));
  });

  const register = async (gamertag, pin = '1234') => {
    const res = await api('/api/register', { gamertag, pin, pin2: pin });
    if (res.status !== 201) throw new Error(`register ${gamertag} failed: ${res.status} ${JSON.stringify(res.data)}`);
    return res.data.token;
  };

  // A host with a fresh room.
  const host = async () => {
    const h = await open();
    h.send({ t: 'host_create' });
    const room = await h.next('room');
    await h.next('roster');
    return Object.assign(h, { code: room.code, hostKey: room.hostKey });
  };

  // A registered player whose phone has joined the room.
  const player = async (h, gamertag, { fighter = null } = {}) => {
    const token = await register(gamertag);
    const p = await open();
    p.send({ t: 'join', room: h.code, token });
    const joined = await p.next('joined');
    await h.next('roster');
    if (fighter) {
      p.send({ t: 'pick', fighter, ready: true });
      await h.next('roster');
    }
    return Object.assign(p, { token, slot: joined.slot, gamertag });
  };

  return { app, port, base, api, open, register, host, player, clock, store };
}

// A plausible result for a match with the given slots: the first slot wins.
export function sampleResult({ stage = 'campus', lives = 3, slots = [0, 1], durationS = 60 } = {}) {
  return {
    stage, lives, durationS, winner: slots[0], byTimeCap: false,
    players: slots.map((slot, i) => ({
      slot, name: `P${slot}`, fighterId: 'finance_bro', place: i + 1,
      damageDealt: i === 0 ? 300 : 40, damageTaken: i === 0 ? 40 * (slots.length - 1) : Math.floor(300 / (slots.length - 1)),
      kos: i === 0 ? lives * (slots.length - 1) : 0, falls: i === 0 ? 0 : lives, specialKos: 0,
      endLives: i === 0 ? lives : 0, endPercent: i === 0 ? 40 : 100,
    })),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
