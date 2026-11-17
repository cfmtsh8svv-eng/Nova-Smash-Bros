// In-process protocol harness: real room handlers, tokens, sessions, cache and store.
// It avoids HTTP/browser setup when testing room-only behavior.
import assert from 'node:assert/strict';
import { Rooms } from '../../server/rooms.js';
import { DataService } from '../../server/data.js';
import { MemoryStore } from '../../server/store/memory.js';
import { Sessions, createToken } from '../../server/accounts.js';
import { RateLimiter } from '../../server/security.js';

export async function roomServer(t) {
  const store = new MemoryStore();
  const data = new DataService(store, { autoRetry: false });
  const sessions = new Sessions();
  const config = { sessionSecret: 'tutorial-test-session-secret' };
  const rooms = new Rooms({ data, sessions, config, limiter: new RateLimiter() });
  t.after(() => { rooms.closeAll(); data.stop(); });
  const open = async () => {
    const inbox = [];
    const ws = { readyState: 1, bufferedAmount: 0, send: (raw) => inbox.push(JSON.parse(raw)), close: () => { ws.readyState = 3; } };
    const conn = rooms.connect(ws, '127.0.0.1');
    return {
      conn, inbox,
      send: (msg) => rooms.receive(conn, Buffer.from(JSON.stringify(msg)), false),
      async next(type) {
        // Async joins yield through the cache before sending the acknowledgement.
        for (let i = 0; i < 20; i++) {
          const at = inbox.findIndex((m) => m.t === type);
          if (at >= 0) return inbox.splice(at, 1)[0];
          await Promise.resolve();
        }
        assert.fail(`Missing ${type}; received ${inbox.map((m) => m.t).join(', ')}`);
      },
    };
  };
  const host = async () => {
    const h = await open(); h.send({ t: 'host_create' });
    const room = await h.next('room'); await h.next('roster');
    return Object.assign(h, { code: room.code, hostKey: room.hostKey });
  };
  const player = async (h, tag, { fighter }) => {
    const lower = tag.toLowerCase();
    await data.createPlayer({ gamertag: tag, gamertag_lower: lower });
    const token = createToken(tag, sessions.start(lower), config.sessionSecret);
    const p = await open(); p.send({ t: 'join', room: h.code, token });
    await p.next('joined'); await h.next('roster');
    p.send({ t: 'pick', fighter, ready: true }); await h.next('roster');
    return p;
  };
  return { store, app: { data, rooms }, open, host, player };
}
