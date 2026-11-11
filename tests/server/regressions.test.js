// Defects found by the independent bug and security reviews of the server.
// Each test failed before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startServer, sampleResult, sleep } from '../helpers/server.js';
import { MemoryStore } from '../../server/store/memory.js';
import { LIMITS } from '../../server/config.js';

const raw = (port, request) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1', () => socket.write(request));
  let data = '';
  socket.on('data', (chunk) => { data += chunk; });
  socket.on('close', () => resolve(data));
  socket.on('error', () => resolve(data));
  setTimeout(() => { socket.destroy(); resolve(data || 'TIMEOUT'); }, 1500);
});

test('a request line that is not a valid URL ("//") is refused cleanly, for pages and for WebSocket upgrades', async (t) => {
  const s = await startServer(t);
  const errors = [];
  const onError = (err) => errors.push(err);
  process.on('uncaughtException', onError);
  t.after(() => process.off('uncaughtException', onError));
  const page = await raw(s.port, 'GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
  assert.match(page, /^HTTP\/1\.1 400 /);
  const upgrade = await raw(s.port, 'GET // HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  assert.match(upgrade, /^HTTP\/1\.1 403 /, 'answered and closed, not left hanging');
  await sleep(50);
  assert.deepEqual(errors, []);
  assert.equal((await s.api('/healthz')).status, 200);
});

test('thirty PIN guesses sent at the same moment are still stopped after five', async (t) => {
  const s = await startServer(t);
  await s.register('Target', '7391');
  const guesses = [...Array(29)].map((_, i) => (i === 28 ? '7391' : String(1000 + i)));
  const answers = await Promise.all(guesses.map((pin) => s.api('/api/login', { gamertag: 'Target', pin })));
  const count = (code) => answers.filter((a) => a.status === code).length;
  assert.equal(count(401), 4, 'four misses are answered as misses');
  assert.equal(count(429), 25, 'everything after the fifth miss is locked out');
  assert.equal(count(200), 0, 'the right PIN in the same burst does not get in');
  assert.equal((await s.api('/api/login', { gamertag: 'Target', pin: '7391' })).status, 429, 'and the lock holds afterwards');
});

test('the host is told when its room is removed for being idle', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  s.clock.now += LIMITS.roomIdleMs + 1000;
  s.app.rooms.sweep();
  const gone = await h.next('error');
  assert.equal(gone.code, 'room_gone');
  h.send({ t: 'host_create' });
  assert.match((await h.next('room')).code, /^[A-Z]{4}$/, 'and can open a new one on the same connection');
});

test('a room that is in use is never removed as idle: every message counts as activity', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  await h.next('match_started');
  // A very long match: only inputs travel.
  for (let i = 0; i < 4; i++) {
    s.clock.now += LIMITS.roomIdleMs - 60_000;
    a.send({ t: 'input', m: 1, q: i + 1 });
    await h.next('input');
    s.app.rooms.sweep();
  }
  assert.equal(s.app.rooms.rooms.size, 1);
});

test('the result confirmation reaches a host page that reconnected while it was being saved', async (t) => {
  // A store whose writes take a moment, like the real sheet.
  class SlowStore extends MemoryStore {
    async recordMatch(match, updates) {
      await sleep(300);
      return super.recordMatch(match, updates);
    }
  }
  const s = await startServer(t, { store: new SlowStore() });
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  await sleep(50);
  await h.close(); // the laptop's Wi-Fi blinks right now
  const back = await s.open();
  back.send({ t: 'host_resume', code: h.code, hostKey: h.hostKey });
  await back.next('room');
  const saved = await back.next('result_saved', { timeout: 4000 });
  assert.equal(saved.matchId, matchId);
  assert.deepEqual(saved.players.map((p) => p.points), [130, 64]);
  // A host that reconnects even later still gets it, until the next match starts.
  await back.close();
  const later = await s.open();
  later.send({ t: 'host_resume', code: h.code, hostKey: h.hostKey });
  assert.equal((await later.next('result_saved')).matchId, matchId);
});

test('the results screen never waits for a slow sheet, and the leaderboard is right even when a read overlaps a write', async (t) => {
  class SlowStore extends MemoryStore {
    async recordMatch(match, updates) {
      await sleep(250);
      return super.recordMatch(match, updates);
    }
    async listPlayers() {
      const rows = await super.listPlayers(); // read now ...
      await sleep(400); // ... but answer late, after the write has finished
      return rows;
    }
  }
  const s = await startServer(t, { store: new SlowStore() });
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  const slowRead = s.api('/api/leaderboard'); // starts before the write, returns after it
  const sent = Date.now();
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  const saved = await h.next('result_saved', { timeout: 4000 });
  assert.ok(Date.now() - sent < 1200, 'answered without waiting for the leaderboard read');
  assert.deepEqual(saved.leaderboard.map((p) => [p.gamertag, p.points]), [['Ana', 130], ['Max', 64]]);
  await slowRead;
  // The overtaken read must not be kept as "fresh": the next look shows the match.
  for (let i = 0; i < 3; i++) {
    const board = await s.api('/api/leaderboard');
    assert.deepEqual(board.data.players.map((p) => [p.gamertag, p.points, p.matches]), [['Ana', 130, 1], ['Max', 64, 1]]);
  }
});

test('several leaderboard requests at once share one read of the store, and a failed read is not repeated at once', async (t) => {
  const s = await startServer(t);
  await s.register('Ana');
  const calls = s.store.calls;
  await Promise.all([...Array(8)].map(() => s.api('/api/leaderboard')));
  assert.equal(s.store.calls, calls + 1);
  s.clock.now += LIMITS.leaderboardCacheMs + 1;
  s.store.failing = true;
  const failed = s.store.calls;
  for (let i = 0; i < 5; i++) assert.equal((await s.api('/api/leaderboard')).data.stale, true);
  assert.equal(s.store.calls, failed + 1, 'one failed read, then a pause');
  s.store.failing = false;
  s.clock.now += 6000;
  assert.equal((await s.api('/api/leaderboard')).data.stale, false);
});

test('after a server restart the phone that logged in last keeps its session, whichever reconnects first', async (t) => {
  const store = new MemoryStore();
  const first = await startServer(t, { store });
  const older = await first.register('Ana'); // phone A
  first.clock.now += 60_000;
  const newer = (await first.api('/api/login', { gamertag: 'Ana', pin: '1234' })).data.token; // phone B, later
  // The server restarts: a new process with the same store and secrets, and no memory of sessions.
  const s = await startServer(t, { store });
  s.clock.now = first.clock.now + 1000;
  const h = await s.host();
  const a = await s.open();
  a.send({ t: 'join', room: h.code, token: older });
  assert.equal((await a.next('joined')).slot, 0, 'the old phone reconnects first and is let in for now');
  const b = await s.open();
  b.send({ t: 'join', room: h.code, token: newer });
  assert.equal((await b.next('joined')).slot, 0, 'the phone that logged in last takes over');
  assert.equal((await a.next('signed_out')).code, 'signed_out');
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: older });
  assert.equal((await again.next('error')).code, 'signed_out');
});

test('a phone that reconnects in the lobby is not shown the screen or the numbers of the finished match', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  const { matchId } = await h.next('match_started');
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'match' } });
  h.send({ t: 'to', slot: 0, msg: { t: 'status', pct: 187, lives: 0, state: 'out', cd: 0, cdMax: 420 } });
  await a.next('status');
  h.send({ t: 'match_abort', matchId });
  await h.next('roster', { match: (r) => r.phase === 'lobby' });
  await a.close();
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  assert.equal((await again.next('joined')).phase, 'lobby');
  await again.settle();
  assert.deepEqual(again.inbox.filter((m) => m.t === 'phase' || m.t === 'status'), []);
});

test('a kicked connection that joins again right away is not closed by the delayed kick', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  const second = await s.open();
  second.send({ t: 'join', room: h.code, token: a.token });
  await second.next('joined');
  await a.next('signed_out');
  a.send({ t: 'join', room: h.code, token: a.token }); // the first tab takes the player back at once
  await a.next('joined');
  await sleep(150); // longer than the kick delay
  assert.equal(a.ws.readyState, 1, 'still open');
  assert.equal(s.app.rooms.rooms.get(h.code).slots[0].connected, true);
});
