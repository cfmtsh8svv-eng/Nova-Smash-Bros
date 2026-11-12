// What happens when the Google Sheet (the store) cannot be reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult } from '../helpers/server.js';
import { DataService } from '../../server/data.js';
import { MemoryStore, StoreError } from '../../server/store/memory.js';
import { SheetsStore } from '../../server/store/sheets.js';
import { readConfig, LIMITS } from '../../server/config.js';

test('with the store down the server stays up: health check, pages and leaderboard still answer', async (t) => {
  const s = await startServer(t);
  await s.register('Ana');
  s.store.failing = true;
  const health = await s.api('/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);
  const board = await s.api('/api/leaderboard');
  assert.equal(board.status, 200);
  assert.equal(board.data.stale, true);
  assert.deepEqual(board.data.players, []);
});

test('with the store down a new registration gets a clear error', async (t) => {
  const s = await startServer(t);
  s.store.failing = true;
  const res = await s.api('/api/register', { gamertag: 'Newbie', pin: '1234', pin2: '1234' });
  assert.equal(res.status, 503);
  assert.match(res.data.error, /Can't reach the player list right now/);
  assert.match(res.data.error, /cannot register until it is back/);
  s.store.failing = false;
  assert.equal((await s.api('/api/register', { gamertag: 'Newbie', pin: '1234', pin2: '1234' })).status, 201, 'works again afterwards');
});

test('with the store down players already seen this session can still log in and join; unknown ones get a clear error', async (t) => {
  const s = await startServer(t);
  const token = await s.register('Ana');
  // A player who registered before this server started: in the store, but never read by it.
  await s.store.createPlayer({ gamertag: 'Old', gamertag_lower: 'old', salt: 'ab', pin_hash: 'cd', created_at: 'x' });
  const h = await s.host();
  s.store.failing = true;

  const login = await s.api('/api/login', { gamertag: 'Ana', pin: '1234' });
  assert.equal(login.status, 200, 'served from the cache');
  const wrong = await s.api('/api/login', { gamertag: 'Ana', pin: '9999' });
  assert.equal(wrong.status, 401, 'the PIN is still checked');

  const p = await s.open();
  p.send({ t: 'join', room: h.code, token: login.data.token });
  assert.equal((await p.next('joined')).gamertag, 'Ana');
  assert.ok(token);

  const unknown = await s.api('/api/login', { gamertag: 'Old', pin: '1234' });
  assert.equal(unknown.status, 503);
  assert.match(unknown.data.error, /Can't reach the player list/);
});

test('with the store down a result is queued, the players see their points, and it is written later exactly once', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  h.send({ t: 'match_start', stage: 'beach', lives: 3, slots: [a.slot, b.slot] });
  const { matchId } = await h.next('match_started');
  s.clock.now += 90_000;
  s.store.failing = true;

  h.send({ t: 'match_result', matchId, result: sampleResult({ stage: 'beach' }) });
  const saved = await h.next('result_saved', { timeout: 4000 });
  assert.equal(saved.stored, true);
  assert.match(saved.note, /still being written to the Google Sheet/);
  assert.deepEqual(saved.players.map((p) => p.points), [130, 64], 'the points are shown right away');
  assert.deepEqual(saved.leaderboard.map((p) => [p.gamertag, p.points]), [['Ana', 130], ['Max', 64]]);
  assert.equal(s.store.matches.size, 0, 'nothing reached the store yet');
  assert.equal(s.app.data.pending, 1);
  assert.equal((await s.api('/healthz')).data.pendingResults, 1);

  // The game goes on: a second match can be played while the store is still down.
  for (const p of [a, b]) {
    p.send({ t: 'pick', fighter: 'finance_bro', ready: true });
    await h.next('roster', { match: (r) => r.players[p.slot].ready });
  }
  h.send({ t: 'match_start', stage: 'bairro', lives: 1, slots: [0, 1] });
  const second = await h.next('match_started');
  s.clock.now += 90_000;
  h.send({ t: 'match_result', matchId: second.matchId, result: sampleResult({ stage: 'bairro', lives: 1 }) });
  await h.next('result_saved', { timeout: 4000 });
  assert.equal(s.app.data.pending, 2);
  assert.equal(await s.app.data.flush(), false, 'still failing');
  const during = await s.api('/api/leaderboard');
  assert.deepEqual(during.data.players.map((p) => [p.gamertag, p.points]), [['Ana', 260], ['Max', 128]], 'the leaderboard keeps up during the outage');
  assert.equal(during.data.stale, true);

  // The store comes back: both results are written, in order, once.
  s.store.failing = false;
  assert.equal(await s.app.data.flush(), true);
  assert.equal(await s.app.data.flush(), true);
  assert.equal(s.app.data.pending, 0);
  assert.equal(s.store.matches.size, 2);
  const ana = s.store.players.get('ana');
  assert.deepEqual([ana.matches, ana.wins, ana.points], [2, 2, 260]);
  assert.ok(ana.achievements.includes('won_beach') && ana.achievements.includes('won_bairro'));
  s.clock.now += LIMITS.leaderboardCacheMs + 1;
  const board = await s.api('/api/leaderboard');
  assert.deepEqual(board.data.players.map((p) => [p.gamertag, p.points, p.matches]), [['Ana', 260, 2], ['Max', 128, 2]]);
  assert.equal(board.data.stale, false);
});

test('the store itself ignores a match id it already has (a retry after a lost answer)', async () => {
  const store = new MemoryStore();
  await store.createPlayer({ gamertag: 'Ana', gamertag_lower: 'ana', salt: 'ab', pin_hash: 'cd', created_at: 'x' });
  const update = [{ gamertag_lower: 'ana', deltas: { matches: 1, wins: 1, points: 100 }, achievements: ['first_win'] }];
  assert.deepEqual(await store.recordMatch({ match_id: 'm1' }, update), { duplicate: false });
  assert.deepEqual(await store.recordMatch({ match_id: 'm1' }, update), { duplicate: true });
  const row = await store.getPlayer('ana');
  assert.deepEqual([row.matches, row.points, row.achievements], [1, 100, ['first_win']]);
});

test('a result the store refuses as invalid is dropped instead of blocking the queue', async () => {
  const store = new MemoryStore();
  const real = store.recordMatch.bind(store);
  store.recordMatch = async (match, updates) => {
    if (match.match_id === 'bad') throw new StoreError('bad_request', 'Invalid match data.');
    return real(match, updates);
  };
  const logs = [];
  const data = new DataService(store, { autoRetry: false, log: (l) => logs.push(l) });
  data.recordMatch({ match_id: 'bad' }, []);
  data.recordMatch({ match_id: 'good' }, []);
  assert.equal(await data.flush(), true);
  assert.equal(data.pending, 0);
  assert.deepEqual([...store.matches.keys()], ['good']);
  assert.match(logs[0], /dropped/);
});

test('the leaderboard is cached for 60 s and shows at most 10 players, best first', async (t) => {
  const s = await startServer(t);
  for (let i = 0; i < 12; i++) {
    await s.register(`Player${i}`);
    Object.assign(s.store.players.get(`player${i}`), { matches: 1, points: i * 10, wins: i % 2 });
  }
  await s.register('NeverPlayed');
  const first = await s.api('/api/leaderboard');
  assert.equal(first.data.players.length, 10);
  assert.deepEqual(first.data.players.slice(0, 2).map((p) => [p.rank, p.gamertag, p.points]), [[1, 'Player11', 110], [2, 'Player10', 100]]);
  assert.equal(first.data.players.some((p) => p.gamertag === 'NeverPlayed'), false);
  const calls = s.store.calls;
  await s.api('/api/leaderboard');
  await s.api('/api/leaderboard');
  assert.equal(s.store.calls, calls, 'no new read within 60 s');
  s.clock.now += LIMITS.leaderboardCacheMs + 1;
  await s.api('/api/leaderboard');
  assert.equal(s.store.calls, calls + 1);
  assert.equal(JSON.stringify(first.data).includes('pin_hash'), false);
});

// ---- the Google Sheet client, with a fake network ----

function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return answer(calls.length);
  };
  return Object.assign(fn, { calls });
}
const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

test('the sheet client sends the shared secret and the action, and reads the answer', async () => {
  const net = fakeFetch(() => okJson({ ok: true, data: { gamertag: 'Ana', gamertag_lower: 'ana', salt: 'ab', pin_hash: 'cd', matches: '3', wins: 1, points: '250', achievements: 'first_win,won_beach,<script>' } }));
  const store = new SheetsStore({ url: 'https://script.example/exec', secret: 's3cret', fetchImpl: net });
  const row = await store.getPlayer('ana');
  assert.equal(net.calls[0].url, 'https://script.example/exec');
  assert.deepEqual(net.calls[0].body, { secret: 's3cret', action: 'getPlayer', payload: { gamertag_lower: 'ana' } });
  assert.equal(net.calls[0].options.method, 'POST');
  assert.equal(row.matches, 3, 'numbers that arrive as text are converted');
  assert.equal(row.points, 250);
  assert.deepEqual(row.achievements, ['first_win', 'won_beach'], 'anything that is not an achievement id is dropped');
});

test('the sheet client turns every kind of failure into a clear store error', async () => {
  const cases = [
    [() => { throw new TypeError('fetch failed'); }, 'unavailable'],
    [() => ({ ok: false, status: 500, json: async () => ({}) }), 'unavailable'],
    [() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html login page'); } }), 'unavailable'],
    [() => okJson({ ok: false, error: 'forbidden', message: 'Wrong or missing secret.' }), 'unavailable'],
    [() => okJson({ ok: false, error: 'duplicate', message: 'That gamertag is taken.' }), 'duplicate'],
    [() => okJson({ ok: false, error: 'bad_request', message: 'Invalid player data.' }), 'bad_request'],
    [() => okJson(null), 'unavailable'],
  ];
  for (const [answer, code] of cases) {
    const store = new SheetsStore({ url: 'https://script.example/exec', secret: 'x', fetchImpl: fakeFetch(answer) });
    await assert.rejects(store.createPlayer({ gamertag: 'Ana' }), (err) => err instanceof StoreError && err.code === code);
  }
});

test('the server runs on the sheet client the same way: outage and recovery end to end', async (t) => {
  let down = false;
  const sheet = new MemoryStore(); // stands in for the spreadsheet behind the web app
  const net = fakeFetch(async () => okJson({ ok: true, data: null }));
  const fetchImpl = async (url, options) => {
    if (down) throw new TypeError('fetch failed');
    const { action, payload } = JSON.parse(options.body);
    try {
      const data = action === 'getPlayer' ? await sheet.getPlayer(payload.gamertag_lower)
        : action === 'createPlayer' ? await sheet.createPlayer(payload)
          : action === 'recordMatch' ? await sheet.recordMatch(payload.match, payload.updates)
            : await sheet.listPlayers();
      return okJson({ ok: true, data });
    } catch (err) {
      return okJson({ ok: false, error: err.code, message: err.message });
    }
  };
  assert.ok(net);
  const s = await startServer(t, { store: new SheetsStore({ url: 'https://script.example/exec', secret: 'x', fetchImpl }) });
  assert.equal((await s.api('/healthz')).data.store, 'sheets');
  await s.register('Ana');
  assert.equal((await s.api('/api/register', { gamertag: 'ANA', pin: '1234', pin2: '1234' })).status, 409);
  down = true;
  assert.equal((await s.api('/api/register', { gamertag: 'Bea', pin: '1234', pin2: '1234' })).status, 503);
  assert.equal((await s.api('/api/login', { gamertag: 'Ana', pin: '1234' })).status, 200);
  down = false;
  assert.equal((await s.api('/api/register', { gamertag: 'Bea', pin: '1234', pin2: '1234' })).status, 201);
  assert.equal(sheet.players.size, 2);
});

// ---- configuration ----

test('without sheet variables the server uses the in-memory store and still starts', () => {
  const config = readConfig({});
  assert.equal(config.useSheets, false);
  assert.ok(config.pinPepper.length >= 32 && config.sessionSecret.length >= 32, 'random secrets for this run');
  assert.notEqual(readConfig({}).sessionSecret, config.sessionSecret);
  assert.ok(config.warnings.some((w) => /in-memory store/.test(w)));
  assert.equal(config.port, 3000);
  assert.equal(readConfig({ PORT: '8080', TRUST_PROXY: '1' }).port, 8080);
});

test('with a sheet configured, missing or weak secrets stop the server from starting', () => {
  const full = { SHEETS_WEBAPP_URL: 'https://script.google.com/macros/s/x/exec', SHEETS_SHARED_SECRET: 'a'.repeat(32), PIN_PEPPER: 'b'.repeat(32), SESSION_SECRET: 'c'.repeat(32) };
  assert.equal(readConfig(full).useSheets, true);
  assert.throws(() => readConfig({ ...full, PIN_PEPPER: '' }), /PIN_PEPPER/);
  assert.throws(() => readConfig({ ...full, PIN_PEPPER: 'short' }), /PIN_PEPPER/);
  assert.throws(() => readConfig({ ...full, SESSION_SECRET: '' }), /SESSION_SECRET/);
  assert.throws(() => readConfig({ ...full, SHEETS_SHARED_SECRET: '' }), /both/);
  assert.throws(() => readConfig({ ...full, SHEETS_WEBAPP_URL: '' }), /both/);
  assert.throws(() => readConfig({ ...full, SHEETS_WEBAPP_URL: 'http://insecure.example/exec' }), /https/);
});
