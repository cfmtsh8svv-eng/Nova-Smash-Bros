import test from 'node:test';
import assert from 'node:assert/strict';
import { roomServer } from '../helpers/rooms.js';
import { DataService } from '../../server/data.js';
import { MemoryStore, tutorialDone } from '../../server/store/memory.js';
import { SheetsStore } from '../../server/store/sheets.js';
import { relayProblem } from '../../server/rooms.js';

async function readyRoom(t) {
  const s = await roomServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: 'finance_bro' });
  const b = await s.player(h, 'Max', { fighter: 'house_dj' });
  const start = async () => {
    h.send({ t: 'match_start', stage: 'campus', lives: 3, slots: [0, 1] });
    const m = await h.next('match_started'); await h.next('roster'); return m;
  };
  return { ...s, h, a, b, start };
}

test('one new account triggers the shared guide; completion survives a new data service with no scored match', async (t) => {
  const s = await readyRoom(t);
  await s.app.data.completeTutorial('max'); await s.app.data.flush();
  const m = await s.start();
  assert.equal(m.tutorial, true);
  s.a.send({ t: 'tutorial_complete', matchId: m.matchId, slots: [0] });
  assert.equal((await s.a.next('error')).code, 'not_host');
  s.h.send({ t: 'tutorial_complete', matchId: m.matchId, slots: [3] });
  assert.equal((await s.h.next('error')).code, 'bad_message');
  assert.equal(s.app.data.players.get('ana').tutorial_done, false);
  s.h.send({ t: 'tutorial_complete', matchId: m.matchId, slots: [0, 1] });
  await s.h.next('tutorial_saved'); await s.app.data.flush();
  assert.equal(s.store.matches.size, 0, 'onboarding is separate from scores');
  assert.equal((await new DataService(s.store, { autoRetry: false }).getPlayer('ana')).tutorial_done, true);
  s.h.send({ t: 'match_abort', matchId: m.matchId }); await s.h.next('roster');
  for (const p of [s.a, s.b]) { p.send({ t: 'pick', fighter: 'finance_bro', ready: true }); await s.h.next('roster'); }
  assert.equal((await s.start()).tutorial, false, 'all accounts are experienced now');
});

test('aborting leaves onboarding pending; host reconnect receives the tutorial flag', async (t) => {
  const s = await readyRoom(t);
  const m = await s.start();
  const resumed = await s.open();
  resumed.send({ t: 'host_resume', code: s.h.code, hostKey: s.h.hostKey });
  const answer = await resumed.next('room');
  assert.equal(answer.tutorial, true);
  await resumed.next('roster');
  const host = resumed;
  host.send({ t: 'match_abort', matchId: m.matchId }); await host.next('roster');
  assert.equal(s.app.data.players.get('ana').tutorial_done, false);
});

test('tutorial writes queue during an outage, update cache immediately, retry idempotently and preserve leaderboard', async () => {
  const store = new MemoryStore();
  const data = new DataService(store, { autoRetry: false });
  await data.createPlayer({ gamertag: 'Ana', gamertag_lower: 'ana' });
  await data.leaderboard();
  store.failing = true;
  data.completeTutorial('ana');
  await data.flush();
  assert.equal(tutorialDone(await data.getPlayer('ana')), true);
  assert.equal(data.pending, 1);
  assert.deepEqual(data.leaderboardNow().players, []);
  data.completeTutorial('ana'); await data.flush(); assert.equal(data.pending, 1);
  store.failing = false;
  await data.flush();
  assert.equal(data.pending, 0);
  assert.equal(store.players.get('ana').tutorial_done, true);
  assert.equal(store.players.get('ana').matches, 0);
  assert.equal(store.matches.size, 0);
});

test('legacy sheet experience, explicit pending flags, and the completion request normalize correctly', async () => {
  for (const [cell, matches, expected] of [[undefined, 1, true], ['', 0, false], ['', 1, true], [0, 20, false], [false, 20, false], [1, 0, true], [true, 0, true], ['1', 0, true]]) {
    const store = new SheetsStore({ url: 'https://example.test', secret: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data: { gamertag: 'Ana', gamertag_lower: 'ana', tutorial_done: cell, matches } }) }) });
    assert.equal((await store.getPlayer('ana')).tutorial_done, expected, `${cell}, ${matches}`);
  }
  const sent = [];
  const store = new SheetsStore({ url: 'https://example.test', secret: 'test', fetchImpl: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true, data: { saved: true } }) }; } });
  await store.completeTutorial('ana');
  assert.equal(sent[0].action, 'completeTutorial');
  assert.deepEqual(sent[0].payload, { gamertag_lower: 'ana' });
});

test('tutorial status is bounded and accepted by the relay', () => {
  const status = { t: 'status', pct: 0, lives: 3, state: 'alive', cd: 0, cdMax: 360, held: null, tipsy: false, fuse: null, buff: null, tutorialStep: 3, tutorialDone: false, tutorialLeft: 15 };
  assert.equal(relayProblem(status), false);
  for (const over of [{ tutorialStep: 5 }, { tutorialLeft: 16 }, { tutorialDone: 'yes' }]) assert.equal(relayProblem({ ...status, ...over }), true);
});
