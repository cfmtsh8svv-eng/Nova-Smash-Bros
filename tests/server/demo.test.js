// Demo mode on the server (docs/DEMO.md): the `demo: true` start, its checks against
// DEMO_SETTINGS, the time-cap result of a demo match, that a demo match is never stored,
// and the lobby phase's `fighters` field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sampleResult, sleep } from '../helpers/server.js';
import { checkResult } from '../../server/results.js';
import { relayProblem, DEMO_NOTE } from '../../server/rooms.js';
import { DEMO_SETTINGS, demoMatchSettings } from '../../src/game/config.js';
import { FIGHTER_IDS } from '../../src/game/fighters.js';

const DEMO = demoMatchSettings();
const [F1, F2, F3] = DEMO_SETTINGS.fighters;
const OTHER = FIGHTER_IDS.find((id) => !DEMO_SETTINGS.fighters.includes(id));

// A result that ended at the cap: everyone still has lives, the first slot wins on lower damage.
function capResult({ slots = [0, 1], lives = DEMO.lives, durationS = DEMO.timeCapS, fighters = [F1, F2, F3, F1] } = {}) {
  return {
    stage: 'campus', lives, durationS, winner: slots[0], byTimeCap: true,
    players: slots.map((slot, i) => ({
      slot, name: `P${slot}`, fighterId: fighters[i], place: i + 1,
      damageDealt: 40, damageTaken: 60, kos: 0, falls: 0, specialKos: 0, endLives: lives, endPercent: 20 + i * 10,
    })),
  };
}

// Two ready players on demo fighters (or the ones given) in a fresh room.
async function demoRoom(s, fighters = [F1, F2]) {
  const h = await s.host();
  const a = await s.player(h, 'Ana', { fighter: fighters[0] });
  const b = await s.player(h, 'Max', { fighter: fighters[1] });
  return { h, a, b };
}

async function startDemo(s, h, slots = [0, 1]) {
  h.send({ t: 'match_start', stage: 'campus', lives: DEMO.lives, slots, demo: true });
  const { matchId } = await h.next('match_started');
  await h.next('roster');
  return matchId;
}

// ---- the result check ----

const NOW = 1_800_000_000_000;
const demoMatch = (over = {}) => ({ id: 'm', stage: 'campus', lives: DEMO.lives, slots: [0, 1], startedAt: NOW - 200_000, demo: true, ...over });

test('checkResult: a demo match that ended at the cap is accepted, with several players still in', () => {
  for (const slots of [[0, 1], [0, 1, 2], [2, 0, 3, 1]]) {
    const res = checkResult(demoMatch({ slots }), capResult({ slots }), NOW);
    assert.equal(res.ok, true, res.reason);
  }
  // The rounding of the duration may come out a little above the cap.
  assert.equal(checkResult(demoMatch(), capResult({ durationS: DEMO.timeCapS + 1 }), NOW).ok, true);
});

test('checkResult: a demo match that ended normally is accepted like any match', () => {
  const r = sampleResult({ lives: DEMO.lives, durationS: 50 });
  assert.equal(checkResult(demoMatch(), r, NOW).ok, true);
});

test('checkResult: everything else stays strict for a demo match', () => {
  const cases = [
    ['a duration above the cap', (r) => { r.durationS = DEMO.timeCapS + 10; }, /time limit/],
    ['a cap end long before the cap', (r) => { r.durationS = 30; }, /before the time was up/],
    ['a cap flag that is not a boolean', (r) => { r.byTimeCap = 'yes'; }, /malformed/],
    ['a winner who is not place 1', (r) => { r.winner = 1; }, /winner/],
    ['a player who is out above one still in', (r) => { r.players[0].falls = 1; r.players[0].endLives = 0; r.players[1].kos = 1; }, /out places above|no life/],
    ['other lives', (r) => { r.lives = 3; }, /lives/],
    ['a longer match than the time since the start', (r) => { r.durationS = DEMO.timeCapS; }, /longer than the time since it started/, { startedAt: NOW - 60_000 }],
  ];
  for (const [name, mutate, reason, over] of cases) {
    const r = capResult();
    mutate(r);
    const res = checkResult(demoMatch(over), r, NOW);
    assert.equal(res.ok, false, name);
    assert.match(res.reason, reason, name);
  }
  // With lives 2: at the cap more lives left must place higher.
  const two = capResult({ lives: 2 });
  two.players[0].falls = 1;
  two.players[0].endLives = 1;
  two.players[1].kos = 1;
  const res = checkResult(demoMatch({ lives: 2 }), two, NOW);
  assert.equal(res.ok, false);
  assert.match(res.reason, /more lives left/);
});

test('checkResult: a normal match with byTimeCap is still refused', () => {
  const res = checkResult(demoMatch({ demo: false }), capResult(), NOW);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'This build has no time limit.');
  const old = checkResult({ ...demoMatch(), demo: undefined }, capResult(), NOW);
  assert.equal(old.reason, 'This build has no time limit.');
});

// ---- starting a demo match ----

test('demo: true is accepted on match_start and vote_start; any other demo value is a strike', async (t) => {
  const s = await startServer(t);
  const { h } = await demoRoom(s);
  for (const demo of [false, 1, 'true', null, {}, [true]]) {
    h.send({ t: 'match_start', stage: 'campus', lives: DEMO.lives, slots: [0, 1], demo });
    assert.equal((await h.next('error')).code, 'bad_message', JSON.stringify(demo));
    h.send({ t: 'vote_start', slots: [0, 1], demo });
    assert.equal((await h.next('error')).code, 'bad_message', JSON.stringify(demo));
  }
  h.send({ t: 'vote_start', slots: [0, 1], demo: true });
  await h.next('vote_started');
  assert.equal(s.app.rooms.rooms.get(h.code).vote.demo, true);
  // The match after a demo vote has to be a demo match too.
  h.send({ t: 'match_start', stage: 'campus', lives: DEMO.lives, slots: [0, 1] });
  assert.match((await h.next('error')).msg, /demo mode/);
  const matchId = await startDemo(s, h);
  assert.ok(matchId);
  assert.equal(s.app.rooms.rooms.get(h.code).match.demo, true);
});

test('a demo start with other lives or a fighter outside the list is refused', async (t) => {
  const s = await startServer(t);
  const { h, a } = await demoRoom(s, [F1, OTHER]);
  const other = [1, 2, 3].find((n) => n !== DEMO.lives);
  h.send({ t: 'match_start', stage: 'campus', lives: other, slots: [0, 1], demo: true });
  let err = await h.next('error');
  assert.equal(err.code, 'bad_start');
  assert.match(err.msg, /Demo mode/);
  h.send({ t: 'match_start', stage: 'campus', lives: DEMO.lives, slots: [0, 1], demo: true });
  err = await h.next('error');
  assert.equal(err.code, 'bad_start');
  assert.match(err.msg, /Max has to pick one of the demo fighters/);
  h.send({ t: 'vote_start', slots: [0, 1], demo: true });
  assert.match((await h.next('error')).msg, /Max has to pick one of the demo fighters/);
  // A pick outside the list is fine as such: the server does not know about demo mode in the lobby.
  a.send({ t: 'pick', fighter: OTHER, ready: true });
  await h.next('roster');
  assert.equal(s.app.rooms.rooms.get(h.code).phase, 'lobby');
  // Without demo the same lobby starts.
  h.send({ t: 'match_start', stage: 'campus', lives: other, slots: [0, 1] });
  assert.ok((await h.next('match_started')).matchId);
});

test('a demo start with a bot on another fighter is refused', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  await s.player(h, 'Ana', { fighter: F1 });
  h.send({ t: 'bots', bots: [{ fighter: OTHER, level: 'medium' }] });
  await h.next('roster');
  h.send({ t: 'match_start', stage: 'campus', lives: DEMO.lives, slots: [0], demo: true });
  assert.match((await h.next('error')).msg, /Freshman has to play one of the demo fighters/);
  h.send({ t: 'bots', bots: [{ fighter: F2, level: 'medium' }] });
  await h.next('roster');
  assert.ok(await startDemo(s, h, [0]));
});

// ---- a demo result is never stored ----

for (const [name, result] of [
  ['ended at the cap', () => capResult()],
  ['ended normally (one player left)', () => ({ ...sampleResult({ lives: DEMO.lives, durationS: 40 }), players: sampleResult({ lives: DEMO.lives, durationS: 40 }).players.map((p, i) => ({ ...p, fighterId: [F1, F2][i] })) })],
]) {
  test(`a demo match that ${name} is not stored: no points, no crowns, no per-hour count`, async (t) => {
    const s = await startServer(t);
    const { h } = await demoRoom(s);
    const matchId = await startDemo(s, h);
    let stored = 0;
    const record = s.app.rooms.data.recordMatch.bind(s.app.rooms.data);
    s.app.rooms.data.recordMatch = (...args) => { stored += 1; return record(...args); };
    const counted = [...s.app.rooms.limiter.hits.keys()].filter((k) => k.startsWith('results:'));
    s.clock.now += (DEMO.timeCapS + 10) * 1000;
    h.send({ t: 'match_result', matchId, result: result() });
    const saved = await h.next('result_saved');
    assert.equal(saved.stored, false);
    assert.equal(saved.note, DEMO_NOTE);
    assert.equal(saved.note, 'Demo match: not saved.');
    assert.deepEqual(saved.players.map((p) => [p.points, p.achievements.length]), [[0, 0], [0, 0]]);
    assert.equal(stored, 0, 'the store was not called');
    assert.equal(s.store.matches.size, 0);
    for (const lower of ['ana', 'max']) {
      const row = s.store.players.get(lower);
      assert.deepEqual([row.matches, row.points, row.last_won], [0, 0, false]);
      assert.equal(s.app.data.players.get(lower).last_won, false, 'no crown in memory either');
    }
    assert.deepEqual([...s.app.rooms.limiter.hits.keys()].filter((k) => k.startsWith('results:')), counted, 'no per-hour count');
    assert.equal(s.app.rooms.rooms.get(h.code).phase, 'lobby');
    await sleep(20);
    const roster = s.app.rooms.roster(s.app.rooms.rooms.get(h.code));
    assert.ok(roster.players.every((p) => !p.crown));
  });
}

test('a demo match with four logged-in players is not stored either', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  for (const [i, name] of ['Ana', 'Max', 'Zoe', 'Lea'].entries()) await s.player(h, name, { fighter: DEMO_SETTINGS.fighters[i % DEMO_SETTINGS.fighters.length] });
  const matchId = await startDemo(s, h, [0, 1, 2, 3]);
  s.clock.now += (DEMO.timeCapS + 10) * 1000;
  h.send({ t: 'match_result', matchId, result: capResult({ slots: [0, 1, 2, 3], fighters: [0, 1, 2, 3].map((i) => DEMO_SETTINGS.fighters[i % DEMO_SETTINGS.fighters.length]) }) });
  const saved = await h.next('result_saved');
  assert.equal(saved.stored, false);
  assert.equal(saved.note, DEMO_NOTE);
  assert.equal(s.store.matches.size, 0);
});

test('a normal match that claims the time cap is still refused on the server', async (t) => {
  const s = await startServer(t);
  const { h } = await demoRoom(s);
  h.send({ t: 'match_start', stage: 'campus', lives: DEMO.lives, slots: [0, 1] });
  const { matchId } = await h.next('match_started');
  s.clock.now += (DEMO.timeCapS + 10) * 1000;
  h.send({ t: 'match_result', matchId, result: capResult() });
  const err = await h.next('error');
  assert.equal(err.code, 'bad_result');
  assert.match(err.msg, /This build has no time limit\./);
});

// ---- the lobby phase's fighters ----

test('the lobby phase relays a valid fighters list and refuses a bad one', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  const a = await s.player(h, 'Ana');
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'lobby', fighters: DEMO_SETTINGS.fighters } });
  assert.deepEqual((await a.next('phase')).fighters, DEMO_SETTINGS.fighters);
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'lobby' } });
  assert.equal((await a.next('phase')).fighters, undefined);
  assert.equal(relayProblem({ t: 'phase', name: 'lobby', fighters: FIGHTER_IDS }), false, 'all eight is fine');
  for (const fighters of [['moon_man'], [...FIGHTER_IDS, F1], 'surfer_girl', { 0: F1 }, [F1, F1], [], [1]]) {
    assert.equal(relayProblem({ t: 'phase', name: 'lobby', fighters }), true, JSON.stringify(fighters));
    h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'lobby', fighters } });
    assert.equal((await h.next('error')).code, 'bad_message');
  }
  // fighters belongs to the lobby only.
  assert.equal(relayProblem({ t: 'phase', name: 'match', fighters: [F1] }), true);
  await a.settle();
  assert.equal(a.inbox.filter((m) => m.t === 'phase').length, 0);
});

test('a phone that joins later gets the demo fighters from the last lobby phase', async (t) => {
  const s = await startServer(t);
  const h = await s.host();
  h.send({ t: 'to', slot: 'all', msg: { t: 'phase', name: 'lobby', fighters: DEMO_SETTINGS.fighters } });
  await h.settle();
  const a = await s.player(h, 'Ana');
  assert.deepEqual((await a.next('phase')).fighters, DEMO_SETTINGS.fighters);
});
