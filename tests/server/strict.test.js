// Sharper checks, added after the independent test review: its mutation run
// showed which changes to the server the first version of the suite let through.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult } from '../helpers/server.js';
import { DataService } from '../../server/data.js';
import { MemoryStore } from '../../server/store/memory.js';
import { checkResult } from '../../server/results.js';
import { LIMITS } from '../../server/config.js';

const login = (s, gamertag, pin) => s.api('/api/login', { gamertag, pin });
async function lobbyOfTwo(s) {
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  return { h, a, b };
}
async function start(h, slots = [0, 1], extra = {}) {
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots, ...extra });
  const { matchId } = await h.next('match_started');
  await h.next('roster', { match: (r) => r.phase === 'match' });
  return matchId;
}

// ---- lockout: five wrong PINs within ten minutes ----

test('lockout counts misses spread over nine minutes', async (t) => {
  const s = await startServer(t);
  await s.register('Slow', '1111');
  for (let i = 0; i < 4; i++) {
    assert.equal((await login(s, 'Slow', '0000')).status, 401);
    s.clock.now += 2 * 60 * 1000 + 15_000; // 2 min 15 s apart: 9 minutes in total
  }
  assert.equal((await login(s, 'Slow', '0000')).status, 429, 'the fifth miss within 10 minutes locks');
});

test('lockout forgets misses that are older than ten minutes', async (t) => {
  const s = await startServer(t);
  await s.register('Slow', '1111');
  for (let i = 0; i < 4; i++) assert.equal((await login(s, 'Slow', '0000')).status, 401);
  s.clock.now += 10 * 60 * 1000 + 1000;
  const res = await login(s, 'Slow', '0000');
  assert.equal(res.status, 401);
  assert.equal(res.data.triesLeft, 4, 'the count started again');
  s.clock.now += 5 * 60 * 1000;
  for (const left of [3, 2, 1]) assert.equal((await login(s, 'Slow', '0000')).data.triesLeft, left);
});

// ---- the result queue ----

function spyStore() {
  const store = new MemoryStore();
  const written = [];
  const real = store.recordMatch.bind(store);
  store.recordMatch = async (match, updates) => {
    const result = await real(match, updates);
    written.push(match.match_id);
    return result;
  };
  return { store, written };
}

test('queued results are written once each and in the order they were played', async () => {
  const { store, written } = spyStore();
  const data = new DataService(store, { autoRetry: false });
  store.failing = true;
  for (const id of ['first', 'second', 'third']) data.recordMatch({ match_id: id }, []);
  assert.equal(await data.flush(), false);
  assert.deepEqual(written, []);
  store.failing = false;
  assert.equal(await data.flush(), true);
  assert.equal(await data.flush(), true);
  assert.deepEqual(written, ['first', 'second', 'third']);
});

test('after an outage the server retries by itself: after 2 s, then 4 s, with a single timer', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const { store, written } = spyStore();
  const data = new DataService(store, { autoRetry: true });
  t.after(() => data.stop());
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  store.failing = true;
  data.recordMatch({ match_id: 'm1' }, []);
  data.recordMatch({ match_id: 'm2' }, []);
  await settle();
  assert.equal(data.pending, 2);
  const callsAfterFirstTry = store.calls;
  mock.timers.tick(1999);
  await settle();
  assert.equal(store.calls, callsAfterFirstTry, 'no retry before 2 s');
  mock.timers.tick(1);
  await settle();
  assert.equal(store.calls, callsAfterFirstTry + 1, 'one retry at 2 s (one timer, not one per result)');
  mock.timers.tick(3999);
  await settle();
  assert.equal(store.calls, callsAfterFirstTry + 1, 'the next pause is 4 s');
  store.failing = false;
  mock.timers.tick(1);
  await settle();
  assert.deepEqual(written, ['m1', 'm2']);
  assert.equal(data.pending, 0);
});

// ---- leaderboard ----

async function playOne(s, h, a, b, stage = 'campus') {
  for (const p of [a, b]) {
    p.send({ t: 'pick', fighter: 'finance_bro', ready: true });
    await p.settle();
  }
  await h.settle();
  h.drain();
  h.send({ t: 'match_start', stage, lives: 3, slots: [a.slot, b.slot] });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult({ stage }) });
  return h.next('result_saved', { timeout: 4000 });
}

test('the leaderboard is fresh right after a match, even inside the 60 s cache', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await lobbyOfTwo(s);
  assert.deepEqual((await s.api('/api/leaderboard')).data.players, [], 'read once: now it is cached');
  await playOne(s, h, a, b);
  const board = await s.api('/api/leaderboard');
  assert.deepEqual(board.data.players.map((p) => [p.gamertag, p.points]), [['Ana', 130], ['Max', 64]]);
});

test('results still in the queue are added on top of the last leaderboard from the store', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await lobbyOfTwo(s);
  await playOne(s, h, a, b);
  assert.equal((await s.api('/api/leaderboard')).data.players[0].points, 130, 'loaded from the store');
  s.store.failing = true;
  const saved = await playOne(s, h, a, b, 'beach');
  assert.deepEqual(saved.leaderboard.map((p) => [p.gamertag, p.points, p.matches]), [['Ana', 260, 2], ['Max', 128, 2]]);
  assert.equal(s.store.matches.size, 1, 'the second match is only in the queue');
});

test('leaderboard ties: more wins first, then by name', async (t) => {
  const s = await startServer(t);
  for (const [name, wins] of [['Zed', 1], ['Bea', 1], ['Amy', 0], ['Cal', 2]]) {
    await s.register(name);
    Object.assign(s.store.players.get(name.toLowerCase()), { matches: 3, points: 200, wins });
  }
  const board = await s.api('/api/leaderboard');
  assert.deepEqual(board.data.players.map((p) => p.gamertag), ['Cal', 'Bea', 'Zed', 'Amy']);
  assert.deepEqual(board.data.players.map((p) => p.rank), [1, 2, 3, 4]);
});

// ---- joining ----

test('joining during an outage: a player the server has not seen gets a clear error over the WebSocket', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const { createToken } = await import('../../server/accounts.js');
  await s.store.createPlayer({ gamertag: 'Old', gamertag_lower: 'old', salt: 'ab', pin_hash: 'cd', created_at: 'x' });
  s.store.failing = true;
  const p = await s.open();
  p.send({ t: 'join', room: h.code, token: createToken('Old', 'sid', 'test-session-secret-0123456789', s.clock.now) });
  const err = await p.next('error');
  assert.equal(err.code, 'unavailable');
  assert.match(err.msg, /Can't reach the player list/);
  s.store.failing = false;
  p.send({ t: 'join', room: h.code, token: createToken('Old', 'sid', 'test-session-secret-0123456789', s.clock.now) });
  assert.equal((await p.next('joined')).gamertag, 'Old', 'and can join once the store is back');
});

test('what a phone is told when it joins: its stats, its achievements without hidden markers, and whether the host is there', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const token = await s.register('Ana');
  Object.assign(s.app.data.players.get('ana'), { matches: 7, wins: 3, points: 420, achievements: ['first_win', 'won_campus', 'hat_trick', 'won_beach'] });
  const p = await s.open();
  p.send({ t: 'join', room: h.code, token });
  const joined = await p.next('joined');
  assert.deepEqual(joined.stats, { matches: 7, wins: 3, points: 420 });
  assert.deepEqual(joined.achievements, ['first_win', 'hat_trick']);
  assert.equal(joined.hostConnected, true);
  assert.equal(JSON.stringify(joined).includes('pin_hash') || JSON.stringify(joined).includes('salt'), false);
  await p.close();
  await h.close();
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token });
  assert.equal((await again.next('joined')).hostConnected, false);
});

test('a new player may join while a match is running and waits for the next one', async (t) => {
  const s = await startServer(t);
  const { h } = await lobbyOfTwo(s);
  await start(h);
  const late = await s.open();
  late.send({ t: 'join', room: h.code, token: await s.register('Late') });
  const joined = await late.next('joined');
  assert.deepEqual([joined.slot, joined.phase], [2, 'match']);
  late.send({ t: 'join', room: h.code, token: 'x' });
  assert.match((await late.next('error')).msg, /already in a room/);
});

// ---- starting ----

test('a player who picked a fighter but did not tap Ready blocks the start', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max');
  b.send({ t: 'pick', fighter: 'house_dj', ready: false });
  await h.next('roster', { match: (r) => r.players[1].fighter === 'house_dj' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [a.slot, b.slot] });
  assert.match((await h.next('error')).msg, /Max has not picked a fighter yet/);
});

test('never more than four fighters: four phones plus anything extra is refused', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  for (const name of ['One', 'Two', 'Three', 'Four']) await s.player(h, name, { fighter: 'finance_bro' });
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1, 2, 3], guests: 1 });
  assert.equal((await h.next('error')).code, 'bad_message');
  h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1, 2, 3] });
  assert.ok((await h.next('match_started')).matchId);
});

test('a match of three stores a result for exactly those three, not for a fourth who joined during it', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  for (const name of ['One', 'Two', 'Three']) await s.player(h, name, { fighter: 'finance_bro' });
  const matchId = await start(h, [0, 1, 2]);
  await s.player(h, 'Four'); // joins during the match
  s.clock.now += 90_000;
  // A result that names the fourth player instead of the third is refused.
  h.send({ t: 'match_result', matchId, result: sampleResult({ slots: [0, 1, 3] }) });
  assert.match((await h.next('error')).msg, /missing from the result/);
  h.send({ t: 'match_result', matchId, result: sampleResult({ slots: [0, 1, 2] }) });
  const saved = await h.next('result_saved');
  assert.deepEqual(saved.players.map((p) => p.gamertag), ['One', 'Two', 'Three']);
  assert.equal(s.store.players.get('four').matches, 0);
  assert.equal(s.store.players.get('three').matches, 1);
});

// ---- who is the host ----

test('another host cannot submit or abort a match with the real match id of somebody else', async (t) => {
  const s = await startServer(t);
  const { h } = await lobbyOfTwo(s);
  const matchId = await start(h);
  s.clock.now += 90_000;
  const other = await s.host();
  other.send({ t: 'match_result', matchId, result: sampleResult() });
  assert.equal((await other.next('error')).code, 'no_match');
  other.send({ t: 'match_abort', matchId });
  assert.equal((await other.next('error')).code, 'no_match');
  const stranger = await s.open();
  stranger.send({ t: 'match_result', matchId, result: sampleResult() });
  assert.equal((await stranger.next('error')).code, 'not_joined');
  assert.equal(s.store.matches.size, 0);
  // The match of the first room is untouched and its own host can still finish it.
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  assert.equal((await h.next('result_saved')).stored, true);
});

test('when the host page reconnects while its old connection is still open, the old one loses the room', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  const matchId = await start(h);
  const fresh = await s.open();
  fresh.send({ t: 'host_resume', code: h.code, hostKey: h.hostKey });
  assert.equal((await fresh.next('room')).resumed, true);
  assert.equal(await h.closed, 4002, 'the old connection is closed');
  a.send({ t: 'input', m: 1, q: 1 });
  assert.equal((await fresh.next('input')).slot, 0, 'inputs go to the new connection');
  s.clock.now += 90_000;
  fresh.send({ t: 'match_result', matchId, result: sampleResult() });
  assert.equal((await fresh.next('result_saved')).stored, true);
  // A key from another room does not work.
  const other = await s.host();
  const thief = await s.open();
  thief.send({ t: 'host_resume', code: h.code, hostKey: other.hostKey });
  assert.equal((await thief.next('error')).code, 'room_gone');
});

test('room codes never contain I or O, which look like 1 and 0', async (t) => {
  const s = await startServer(t);
  const codes = new Set();
  for (let i = 0; i < 400; i++) codes.add(s.app.rooms.newCode());
  for (const code of codes) assert.match(code, /^[A-HJ-NP-Z]{4}$/);
  assert.ok(codes.size > 390, 'and they are random');
});

// ---- leaving, being signed out ----

test('a player who leaves during a match keeps the slot until it ends; then it is free', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  const matchId = await start(h);
  a.send({ t: 'leave' });
  await a.next('left');
  const during = await h.next('roster');
  assert.deepEqual(during.players.map((p) => [p.gamertag, p.connected]), [['Ana', false], ['Max', true]], 'still in the match, standing idle');
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId, result: sampleResult() });
  const saved = await h.next('result_saved');
  assert.equal(saved.players[0].gamertag, 'Ana', 'the result still counts for the player who left');
  h.send({ t: 'room_set', closed: false });
  const after = await h.next('roster', { match: (r) => r.phase === 'lobby' && r.players.length === 1 });
  assert.deepEqual(after.players.map((p) => p.gamertag), ['Max']);
});

test('the slot of a phone that was signed out is given up after 30 s in the lobby', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  assert.equal((await login(s, 'Ana', '1234')).status, 200); // a second phone logs in and never joins
  await a.next('signed_out');
  await h.next('roster', { match: (r) => r.players[0] && !r.players[0].connected });
  mock.timers.tick(LIMITS.slotHoldMs - 1000);
  assert.ok(s.app.rooms.rooms.get(h.code).slots[0]);
  mock.timers.tick(1001);
  assert.equal((await h.next('roster', { match: (r) => r.players.length === 0 })).players.length, 0);
});

test('one phone per account in the middle of a match: the new phone steers, the old one does not', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  await start(h);
  const second = await login(s, 'Ana', '1234');
  await a.next('signed_out');
  const phone = await s.open();
  phone.send({ t: 'join', room: h.code, token: second.data.token });
  const joined = await phone.next('joined');
  assert.deepEqual([joined.slot, joined.phase], [0, 'match']);
  h.drain();
  phone.send({ t: 'input', m: 2, q: 1 });
  assert.deepEqual(await h.next('input'), { t: 'input', slot: 0, m: 2, q: 1 });
  assert.equal(await a.closed, 4001);
});

// ---- relay and limits ----

test('a stage vote is not passed on during a match, a hazard vote is', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  await start(h);
  h.drain();
  a.send({ t: 'vote', kind: 'stage', value: 'beach' });
  assert.equal((await a.next('error')).code, 'bad_message');
  a.send({ t: 'vote', kind: 'hazard', value: 'train' });
  assert.deepEqual(await h.next('vote'), { t: 'vote', slot: 0, kind: 'hazard', value: 'train' });
  assert.equal(h.inbox.filter((m) => m.t === 'vote').length, 0);
});

test('status goes to one phone or to all, and is kept for a phone that is away', async (t) => {
  const s = await startServer(t);
  const { h, a, b } = await lobbyOfTwo(s);
  const status = (pct) => ({ t: 'status', pct, lives: 3, state: 'alive', cd: 0, cdMax: 420 });
  h.send({ t: 'to', slot: 1, msg: status(11) });
  assert.equal((await b.next('status')).pct, 11);
  h.send({ t: 'to', slot: 'all', msg: status(22) });
  assert.equal((await a.next('status')).pct, 22);
  assert.equal((await b.next('status')).pct, 22);
  await a.close();
  await h.next('roster');
  h.send({ t: 'to', slot: 0, msg: status(33) }); // Ana is away: no crash, kept for later
  h.send({ t: 'to', slot: 3, msg: status(44) }); // nobody is in slot 3: ignored
  await h.settle();
  const again = await s.open();
  again.send({ t: 'join', room: h.code, token: a.token });
  await again.next('joined');
  assert.equal((await again.next('status')).pct, 33);
});

test('the size limit for a phone message is exactly 512 bytes', async (t) => {
  const s = await startServer(t);
  const { h, a } = await lobbyOfTwo(s);
  await start(h);
  h.drain();
  const sized = (bytes) => {
    const base = JSON.stringify({ t: 'input', m: 1, q: 1, pad: '' });
    return JSON.stringify({ t: 'input', m: 1, q: 1, pad: 'x'.repeat(bytes - base.length) });
  };
  assert.equal(sized(512).length, 512);
  a.send(sized(512));
  assert.equal((await h.next('input')).slot, 0, '512 bytes pass');
  a.send(sized(513));
  assert.equal((await a.next('error')).code, 'bad_message', '513 bytes are dropped');
  await h.settle();
  assert.equal(h.inbox.filter((m) => m.t === 'input').length, 0);
});

test('room_set needs true or false', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  for (const closed of ['yes', 1, null, undefined]) {
    h.send({ t: 'room_set', closed });
    assert.equal((await h.next('error')).code, 'bad_message');
  }
  assert.equal(s.app.rooms.rooms.get(h.code).closed, false);
  h.send({ t: 'room_set', closed: true });
  assert.equal((await h.next('roster')).closed, true);
  h.send({ t: 'room_set', closed: false });
  assert.equal((await h.next('roster')).closed, false);
  const p = await s.open();
  p.send({ t: 'join', room: h.code, token: await s.register('Ana') });
  assert.equal((await p.next('joined')).slot, 0, 'an opened room lets players in again');
});

test('the API allows 600 requests a minute per address, then answers 429', async (t) => {
  const s = await startServer(t);
  const statuses = [];
  for (let i = 0; i < LIMITS.apiPerMinutePerAddress + 3; i++) statuses.push((await fetch(`${s.base}/api/achievements`)).status);
  assert.equal(statuses.filter((c) => c === 200).length, 600);
  assert.deepEqual(statuses.slice(600), [429, 429, 429]);
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200, 'the health check is never limited');
  s.clock.now += 61_000;
  assert.equal((await fetch(`${s.base}/api/achievements`)).status, 200);
});

test('GET-only API routes refuse POST, and the other way round', async (t) => {
  const s = await startServer(t);
  for (const route of ['/api/leaderboard', '/api/achievements', '/api/qr?room=ABCD']) {
    const res = await fetch(s.base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 405, route);
    assert.equal(res.headers.get('allow'), 'GET');
  }
  assert.equal((await fetch(`${s.base}/api/login`)).status, 405);
});

test('rooms are limited: 12 open at once per address, 200 on the whole server', async (t) => {
  const s = await startServer(t, { config: { trustProxy: true } });
  const hostFrom = async (address) => {
    const h = await s.open({ 'CF-Connecting-IP': address });
    h.send({ t: 'host_create' });
    return h;
  };
  // One address: ten in the first minute, two more in the next, then no more.
  for (let i = 0; i < 10; i++) await (await hostFrom('99.0.0.1')).next('room');
  s.clock.now += 61_000;
  for (let i = 0; i < 2; i++) await (await hostFrom('99.0.0.1')).next('room');
  const thirteenth = await hostFrom('99.0.0.1');
  assert.match((await thirteenth.next('error')).msg, /Too many rooms are open from this network/);
  // Many addresses: the server as a whole stops at 200.
  let n = 12;
  for (let a = 2; n < 200; a++) {
    const batch = Math.min(10, 200 - n);
    await Promise.all([...Array(batch)].map(async () => (await hostFrom(`99.0.0.${a}`)).next('room')));
    n += batch;
  }
  assert.equal(s.app.rooms.rooms.size, 200);
  const extra = await hostFrom('99.0.1.1');
  const err = await extra.next('error');
  assert.equal(err.code, 'busy');
  assert.match(err.msg, /server is full/);
});

// ---- result checks, one reason each ----

const NOW = 1_800_000_000_000;
const match = (over = {}) => ({ id: 'x', stage: 'campus', lives: 3, slots: [0, 1], startedAt: NOW - 600_000, ...over });
const reasonOf = (mutate, m = match()) => {
  const r = sampleResult();
  mutate(r);
  const res = checkResult(m, r, NOW);
  return res.ok ? 'accepted' : res.reason;
};

test('damage checks: each one has its own reason', () => {
  assert.equal(reasonOf((r) => { r.players[0].damageDealt = 400; r.players[1].damageDealt = 0; }), 'More damage dealt than taken.');
  assert.equal(reasonOf((r) => { r.players[0].damageDealt = 320; r.players[0].damageTaken = 30; r.players[1].damageDealt = 0; r.players[1].damageTaken = 300; }), 'A player dealt more damage than the others took.');
  assert.equal(reasonOf((r) => { r.players[1].damageTaken = -1; }), 'Damage is out of range.');
  assert.equal(reasonOf((r) => { r.players[1].damageTaken = 0.5; }), 'Damage is out of range.');
});

test('honest results that look unusual are accepted: hazards and self-destructs', () => {
  // Hazards and falling off deal damage that no player dealt, and cause falls without KOs.
  assert.equal(reasonOf((r) => {
    Object.assign(r.players[0], { damageDealt: 20, damageTaken: 300, kos: 0, falls: 2, endLives: 1, endPercent: 80 });
    Object.assign(r.players[1], { damageDealt: 10, damageTaken: 250, kos: 0, falls: 3, endLives: 0 });
  }), 'accepted');
  // Nobody hit anybody: the loser walked off the stage three times.
  assert.equal(reasonOf((r) => {
    Object.assign(r.players[0], { damageDealt: 0, damageTaken: 0, kos: 0, falls: 0, endPercent: 0 });
    Object.assign(r.players[1], { damageDealt: 0, damageTaken: 0, kos: 0, falls: 3, endPercent: 0 });
  }), 'accepted');
  // A special KO and a comeback win on the last life.
  assert.equal(reasonOf((r) => {
    Object.assign(r.players[0], { falls: 2, endLives: 1, endPercent: 180, damageTaken: 500, specialKos: 2 });
    Object.assign(r.players[1], { damageDealt: 480, kos: 2 });
  }), 'accepted');
});

test('real matches of every size, stage and number of lives pass the result check', async () => {
  const { createMatch, step, buildResult } = await import('../../src/game/match.js');
  const { scriptedInputs } = await import('../helpers/scripted-player.js');
  const { FIGHTER_IDS } = await import('../../src/game/fighters.js');
  let checked = 0;
  for (const [stage, n, lives, seed] of [['campus', 2, 1, 3], ['beach', 3, 2, 5], ['bairro', 4, 3, 8], ['campus', 4, 1, 13], ['beach', 2, 3, 21], ['bairro', 3, 2, 1]]) {
    const players = [...Array(n)].map((_, i) => ({ slot: i, name: `P${i}`, fighterId: FIGHTER_IDS[(seed + i * 3) % 8] }));
    const state = createMatch({ stageId: stage, players, settings: { lives, hazardMinS: 5, hazardMaxS: 8 }, seed });
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 60 * 60 * 10) step(state, scriptedInputs(state));
    if (state.phase !== 'ended') continue; // the scripted players got stuck: not a result
    const result = buildResult(state);
    const m = match({ stage, lives, slots: players.map((p) => p.slot), startedAt: NOW - (result.durationS + 10) * 1000 });
    const res = checkResult(m, result, NOW);
    assert.equal(res.ok, true, `${stage}, ${n} players, ${lives} lives: ${res.reason}`);
    checked += 1;
  }
  assert.ok(checked >= 5, `${checked} real matches were checked`);
});
