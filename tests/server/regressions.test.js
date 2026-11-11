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

// ---- from the security reviews ----

test('a result cannot arrive faster than the match could have been played', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  const tryAfter = async (ms, durationS) => {
    h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
    const { matchId } = await h.next('match_started');
    s.clock.now += ms;
    h.send({ t: 'match_result', matchId, result: sampleResult({ durationS }) });
    let answer = null;
    for (let i = 0; i < 150 && answer === null; i++) {
      const got = h.inbox.find((m) => m.t === 'result_saved' || m.t === 'error');
      if (got) answer = got.t === 'error' ? got.msg : 'saved';
      else await sleep(20);
    }
    if (answer !== 'saved') {
      h.send({ t: 'match_abort', matchId });
      await h.next('roster', { match: (r) => r.phase === 'lobby' });
    }
    for (const name of ['Ana', 'Max']) s.app.rooms.rooms.get(h.code).slots.find((x) => x && x.gamertag === name).ready = true;
    h.drain();
    return answer;
  };
  assert.match(await tryAfter(60_000, 2), /too short for the lives/, 'three lives each need two respawns of 2 s');
  assert.match(await tryAfter(0, 4), /longer than the time since it started/, 'sent the moment the match began');
  assert.match(await tryAfter(5000, 4), /longer than the time since it started/, 'the countdown alone takes 3 s');
  assert.equal(await tryAfter(7000, 5), 'saved');
  assert.equal(s.store.matches.size, 1);
});

test('results that cannot be: KOs without a victim, more damage at the end than was taken, one player dealing it all in a second', async () => {
  const { checkResult } = await import('../../server/results.js');
  const NOW = 1_800_000_000_000;
  const match = { id: 'x', stage: 'campus', lives: 3, slots: [0, 1], guests: 0, startedAt: NOW - 600_000 };
  const reason = (mutate, over = {}) => {
    const r = sampleResult(over);
    mutate(r);
    const res = checkResult({ ...match, ...over.match }, r, NOW);
    return res.ok ? 'accepted' : res.reason;
  };
  // The loser claims three KOs although the winner only fell once.
  assert.equal(reason((r) => {
    Object.assign(r.players[0], { falls: 1, endLives: 2, kos: 1 });
    Object.assign(r.players[1], { kos: 3 });
  }), 'A player has more KOs than the others have falls.');
  assert.equal(reason((r) => { r.players[0].endPercent = 200; }), 'A player ends with more damage than they took.');
  assert.equal(reason((r) => { r.durationS = 4; r.players[0].damageDealt = 500; r.players[1].damageTaken = 500; }), 'Too much damage by one player for such a short match.');
  assert.equal(reason(() => {}), 'accepted');
});

test('a player whose matches pile up within an hour stops earning points; the limit is per hour', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  const play = async () => {
    for (const p of [a, b]) p.send({ t: 'pick', fighter: 'finance_bro', ready: true });
    await a.settle();
    await b.settle();
    h.drain();
    h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
    const { matchId } = await h.next('match_started');
    s.clock.now += 20_000;
    h.send({ t: 'match_result', matchId, result: sampleResult({ durationS: 10 }) });
    return h.next('result_saved', { timeout: 4000 });
  };
  s.clock.now = Math.ceil(s.clock.now / 3_600_000) * 3_600_000 + 1000; // the start of a full hour
  for (let i = 0; i < LIMITS.resultsPerHourPerPlayer; i++) assert.equal((await play()).stored, true);
  const extra = await play();
  assert.equal(extra.stored, false);
  assert.match(extra.note, /limit of matches per hour/);
  assert.deepEqual(extra.players.map((p) => p.points), [0, 0]);
  assert.equal(s.store.matches.size, LIMITS.resultsPerHourPerPlayer);
  s.clock.now += 3_600_000;
  assert.equal((await play()).stored, true, 'a new hour, a new allowance');
});

test('guessing room codes: no answer without a login, and a logged-in guesser is cut off after ten misses', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  // Without a valid token, a real room and a made-up one look the same.
  const stranger = await s.open();
  stranger.send({ t: 'join', room: h.code, token: 'x' });
  assert.equal((await stranger.next('error')).code, 'bad_token');
  stranger.send({ t: 'join', room: 'QQQQ', token: 'x' });
  assert.equal((await stranger.next('error')).code, 'bad_token');
  // With a login, misses are counted and the socket is closed.
  const token = await s.register('Guesser');
  const guesser = await s.open();
  for (let i = 0; i < LIMITS.failedJoinsPerSocket; i++) guesser.send({ t: 'join', room: `QQ${'ABCDEFGHJK'[i]}Q`, token });
  assert.equal(await guesser.closed, 1008);
  // And per address there is a budget for join attempts as a whole.
  let busy = 0;
  for (let round = 0; round < 8 && !busy; round++) {
    const c = await s.open();
    for (let i = 0; i < 9; i++) c.send({ t: 'join', room: 'QQQQ', token });
    await c.settle();
    busy = c.inbox.filter((m) => m.code === 'busy').length;
  }
  assert.ok(busy > 0, 'further attempts from this address are refused for the rest of the minute');
});

test('the host can remove a player, who then cannot come back into that room', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  const b = await s.player(h, 'Troll');
  a.send({ t: 'kick', slot: 1 });
  assert.equal((await a.next('error')).code, 'not_host', 'only the host can do that');
  h.send({ t: 'kick', slot: 1 });
  assert.match((await b.next('closed')).msg, /removed you/);
  assert.deepEqual((await h.next('roster', { match: (r) => r.players.length === 1 })).players.map((p) => p.gamertag), ['Ana']);
  b.send({ t: 'join', room: h.code, token: b.token });
  const refused = await b.next('error');
  assert.equal(refused.code, 'room_closed');
  assert.match(refused.msg, /removed you/);
  // Another room is still open to them.
  const other = await s.host();
  b.send({ t: 'join', room: other.code, token: b.token });
  assert.equal((await b.next('joined')).slot, 0);
  for (const slot of [7, 'x', null]) {
    h.send({ t: 'kick', slot });
    assert.equal((await h.next('error')).code, 'bad_message');
  }
});

test('a phone that stops reading is cut off instead of filling the server\'s memory', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  const conn = s.app.rooms.rooms.get(h.code).slots[0].conn;
  // Pretend the phone's connection has a large backlog.
  Object.defineProperty(conn.ws, 'bufferedAmount', { get: () => LIMITS.sendBufferBytes + 1 });
  h.send({ t: 'to', slot: 0, msg: { t: 'feedback', kind: 'hit' } });
  assert.notEqual(await a.closed, 'still open');
  assert.equal((await h.next('roster', { match: (r) => r.players[0].connected === false })).players[0].gamertag, 'Ana', 'the slot is kept: the phone can reconnect');
});

test('what the host may pass on is checked field by field: nothing a phone could choke on gets through', async (t) => {
  const { relayProblem } = await import('../../server/rooms.js');
  const good = [
    { t: 'phase', name: 'lobby', vote: true, stages: [{ id: 'campus', name: 'Nova SBE Campus' }] },
    { t: 'phase', name: 'match', stage: 'beach', stageName: 'Carcavelos Beach', paused: false, lives: 3, slots: [0, 1, 2, 3], hazards: [{ id: 'wave', name: 'Big Wave' }] },
    { t: 'phase', name: 'results', place: 1, of: 4, won: true, winner: 'Ana', stats: { dealt: 310, taken: 44, kos: 6, falls: 0 }, points: 131, total: 500, achievements: [{ name: 'First Win', text: 'Win a match.' }], note: '' },
    { t: 'status', pct: 87, lives: 2, state: 'alive', cd: 120, cdMax: 420, held: 'sardine', tipsy: false },
    { t: 'feedback', kind: 'out', text: "You're out! Grab a coffee and watch.", title: 'BURNOUT!', flash: '#e63946', vibrate: [300, 100, 300, 100, 900] },
    { t: 'feedback', kind: 'hazardCount', name: 'BIG WAVE', n: 2 },
  ];
  for (const m of good) assert.equal(relayProblem(m), false, JSON.stringify(m).slice(0, 60));
  const bad = [
    { t: 'phase', name: 'match', lives: 400000000 }, // would be drawn as that many hearts
    { t: 'phase', name: 'match', lives: 0 },
    { t: 'phase', name: 'match', slots: [0, 1, 2, 3, 0] },
    { t: 'phase', name: 'match', slots: [9] },
    { t: 'phase', name: 'match', hazards: [{ id: 'meteor', name: 'Meteor' }] },
    { t: 'phase', name: 'lobby', stages: [null] },
    { t: 'phase', name: 'lobby', vote: 'yes' },
    { t: 'phase', name: 'results', place: 5 },
    { t: 'phase', name: 'results', stats: { dealt: -1, taken: 0, kos: 0, falls: 0 } },
    { t: 'phase', name: 'results', achievements: [null] },
    { t: 'phase', name: 'results', achievements: [{ name: 'x'.repeat(41) }] },
    { t: 'phase', name: 'match', url: 'javascript:alert(1)' }, // unknown keys are refused
    { t: 'status', pct: 1, lives: 1, state: 'alive', cd: 0, cdMax: 400, extra: 1 },
    { t: 'feedback', kind: '<b>k</b>' },
    { t: 'feedback', kind: 'ko', vibrate: [1000, 1000, 1000] }, // more than two seconds in total
    { t: 'feedback', kind: 'ko', vibrate: [10, 10, 10, 10, 10, 10, 10] },
    { t: 'feedback', kind: 'ko', extra: 'x' },
    JSON.parse('{"t":"feedback","kind":"ko","__proto__":{"polluted":true}}'),
  ];
  for (const m of bad) assert.equal(relayProblem(m), true, JSON.stringify(m).slice(0, 60));
  assert.ok(t);
});

test('wrong PINs are also capped per day: after twenty in 24 hours the gamertag is locked until they age out', async (t) => {
  const s = await startServer(t);
  await s.register('Target', '7391');
  const wrong = () => s.api('/api/login', { gamertag: 'Target', pin: '0000' });
  let misses = 0;
  let last = null;
  // Four misses, then wait out the ten-minute window, again and again: never trips the short lock.
  for (let round = 0; round < 6 && misses < 20; round++) {
    for (let i = 0; i < 4 && misses < 20; i++) {
      last = await wrong();
      if (last.status === 401) misses += 1;
    }
    s.clock.now += LIMITS.loginWindowMs + 1000;
  }
  assert.equal(misses, 19, 'the twentieth miss is answered with the lock');
  assert.equal(last.status, 429);
  assert.match(last.data.error, /Try again in \d+ h\./);
  s.clock.now += 3 * 3_600_000;
  assert.equal((await s.api('/api/login', { gamertag: 'Target', pin: '7391' })).status, 429, 'still locked hours later, even with the right PIN');
  s.clock.now += 22 * 3_600_000;
  assert.equal((await s.api('/api/login', { gamertag: 'Target', pin: '7391' })).status, 200, 'a day after the first miss it opens again');
});

test('"Log out" on the phone makes every copy of the login useless', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  a.send({ t: 'logout' });
  await a.next('left');
  assert.equal((await h.next('roster', { match: (r) => r.players.length === 0 })).players.length, 0);
  a.send({ t: 'join', room: h.code, token: a.token });
  assert.equal((await a.next('error')).code, 'signed_out');
  const fresh = await s.api('/api/login', { gamertag: 'Ana', pin: '1234' });
  a.send({ t: 'join', room: h.code, token: fresh.data.token });
  assert.equal((await a.next('joined')).slot, 0, 'logging in again with the PIN works');
});

test('too many connections from one address are refused, and a connection that never does anything is closed', async (t) => {
  const s = await startServer(t);
  const open = [];
  for (let i = 0; i < LIMITS.socketsPerAddress; i++) open.push(await s.open());
  await assert.rejects(s.open(), /503/);
  // Idle connections are cleared by the regular housekeeping.
  s.clock.now += LIMITS.idleSocketMs + 1000;
  s.app.rooms.sweep();
  assert.equal(await open[0].closed, 1008);
  await sleep(100);
  assert.equal((await s.open()).ws.readyState, 1, 'there is room again');
});

// ---- from the client bug review ----

test('when a match ends or is cancelled, each phone is told that it is no longer "ready"', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1], guests: 0 });
  const { matchId } = await h.next('match_started');
  h.send({ t: 'match_abort', matchId });
  assert.deepEqual(await a.next('slot'), { t: 'slot', fighter: 'finance_bro', ready: false });
});

test('a phone that joins during a match is not given the slot of a keyboard player', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  // Ana on slot 0, keyboard players on slots 1 and 2.
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0], guests: 2, guestSlots: [1, 2] });
  const { matchId } = await h.next('match_started');
  const late = await s.open();
  late.send({ t: 'join', room: h.code, token: await s.register('Late') });
  assert.equal((await late.next('joined')).slot, 3, 'the only slot nobody is playing in');
  const later = await s.open();
  later.send({ t: 'join', room: h.code, token: await s.register('Later') });
  assert.equal((await later.next('error')).code, 'room_full');
  // After the match the keyboard slots are free again.
  h.send({ t: 'match_abort', matchId });
  await h.next('roster', { match: (r) => r.phase === 'lobby' });
  later.send({ t: 'join', room: h.code, token: await s.register('Third') });
  assert.equal((await later.next('joined')).slot, 1);
});

test('the list of keyboard slots is checked: no duplicates, no taken slots, not more than there are keyboard players', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: 'finance_bro' });
  for (const guestSlots of [[0], [1, 1], [1, 2, 3], [9], 'x', [1.5]]) {
    h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0], guests: 2, guestSlots });
    assert.equal((await h.next('error')).code, 'bad_message', JSON.stringify(guestSlots));
  }
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'lobby');
});
