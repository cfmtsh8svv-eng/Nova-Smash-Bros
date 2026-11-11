// Plausibility checks for match results, points and achievements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResult, newAchievements, scoreResult, ACHIEVEMENT_IDS } from '../../server/results.js';
import { emptyStats } from '../../server/store/memory.js';
import { sampleResult } from '../helpers/server.js';

const NOW = 1_800_000_000_000;
const match = (over = {}) => ({ id: '11111111-2222-3333-4444-555555555555', stage: 'campus', lives: 3, slots: [0, 1], guests: 0, startedAt: NOW - 120_000, ...over });
const check = (result, m = match()) => checkResult(m, result, NOW);
const change = (fn, opts) => {
  const r = sampleResult(opts);
  fn(r);
  return r;
};

test('a plausible result is accepted for 2, 3 and 4 players and 1 to 3 lives', () => {
  for (const slots of [[0, 1], [0, 1, 2], [3, 1, 0, 2]]) {
    for (const lives of [1, 2, 3]) {
      const res = check(sampleResult({ slots, lives }), match({ slots, lives }));
      assert.equal(res.ok, true, `${slots.length} players, ${lives} lives: ${res.reason}`);
      assert.equal(res.players.length, slots.length);
    }
  }
});

test('extra fields in a result are dropped, not stored', () => {
  const res = check(change((r) => {
    r.players[0].isAdmin = true;
    r.players[0].name = '=HYPERLINK("http://evil")';
  }));
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.players[0]).sort(), ['damageDealt', 'damageTaken', 'endLives', 'endPercent', 'falls', 'fighterId', 'kos', 'place', 'slot', 'specialKos']);
});

for (const [name, mutate, reason] of [
  ['another stage than the one started', (r) => { r.stage = 'beach'; }, /stage/],
  ['an unknown stage', (r) => { r.stage = 'moon'; }, /stage/],
  ['other lives than the match was started with', (r) => { r.lives = 1; }, /lives/],
  ['a duration of zero', (r) => { r.durationS = 0; }, /duration/],
  ['a negative duration', (r) => { r.durationS = -5; }, /duration/],
  ['a duration longer than the time since the start', (r) => { r.durationS = 500; }, /longer than the time/],
  ['a duration of more than six hours', (r) => { r.durationS = 6 * 3600 + 1; }, /duration/],
  ['a duration that is not a whole number', (r) => { r.durationS = 12.5; }, /duration/],
  ['a time-cap win, which this build does not have', (r) => { r.byTimeCap = true; }, /time limit/],
  ['a missing player', (r) => { r.players.pop(); }, /player list/],
  ['an extra player', (r) => { r.players.push({ ...r.players[1], slot: 2, place: 3 }); }, /player list/],
  ['a player who is not in the match', (r) => { r.players[1].slot = 3; }, /missing from the result/],
  ['the same player twice', (r) => { r.players[1].slot = 0; }, /malformed/],
  ['a slot outside 0 to 3', (r) => { r.players[1].slot = 9; }, /malformed/],
  ['two winners', (r) => { r.players[1].place = 1; }, /share a place/],
  ['a place outside the player count', (r) => { r.players[1].place = 4; }, /place/],
  ['a winner that does not match the places', (r) => { r.winner = 1; }, /winner/],
  ['a winner without lives', (r) => { r.players[0].falls = 3; r.players[0].endLives = 0; }, /winner has no life/],
  ['a loser who still has lives', (r) => { r.players[1].falls = 1; r.players[1].endLives = 2; }, /one player is left/],
  ['more falls than lives', (r) => { r.players[1].falls = 4; }, /out of range/],
  ['lives left that do not fit the falls', (r) => { r.players[0].endLives = 1; }, /do not fit/],
  ['more KOs than there were falls', (r) => { r.players[1].kos = 3; r.players[1].specialKos = 0; }, /More KOs than falls/],
  ['more KOs than opponents have lives', (r) => { r.players[0].kos = 4; }, /out of range/],
  ['more special KOs than KOs', (r) => { r.players[0].specialKos = 4; }, /out of range/],
  ['negative damage', (r) => { r.players[0].damageDealt = -1; }, /Damage/],
  ['damage that is not a number', (r) => { r.players[0].damageDealt = '300'; }, /Damage/],
  ['a million percent damage', (r) => { r.players[0].damageDealt = 1_000_000; }, /Damage/],
  ['more damage dealt than anyone took', (r) => { r.players[0].damageDealt = 5000; }, /dealt/],
  ['more damage taken than three lives allow', (r) => { r.players[1].damageTaken = 2000; r.players[0].damageDealt = 2000; }, /more damage taken than is possible/i],
  ['an end percentage far above 200', (r) => { r.players[0].endPercent = 900; }, /Damage/],
  ['an unknown fighter', (r) => { r.players[0].fighterId = 'mario'; }, /fighter/],
  ['a player entry that is not an object', (r) => { r.players[1] = 'p2'; }, /malformed/],
  ['players that are not a list', (r) => { r.players = { 0: {}, 1: {} }; }, /player list/],
]) {
  test(`a result with ${name} is refused`, () => {
    const res = check(change(mutate));
    assert.equal(res.ok, false);
    assert.match(res.reason, reason);
  });
}

test('a result that is not an object is refused', () => {
  for (const junk of [null, undefined, 'win', 42, [], true]) assert.equal(check(junk).ok, false);
});

test('huge damage in a few seconds is refused', () => {
  const res = checkResult(match({ lives: 3, startedAt: NOW - 10_000 }), change((r) => {
    r.durationS = 2;
    r.players[0].damageDealt = 600;
    r.players[1].damageTaken = 600;
  }), NOW);
  assert.equal(res.ok, false);
  assert.match(res.reason, /Too much damage/);
});

test('keyboard guests are part of the player count but need not be in the room', () => {
  const m = match({ slots: [0], guests: 1 });
  assert.equal(check(sampleResult({ slots: [0, 2] }), m).ok, true);
  assert.equal(check(sampleResult({ slots: [1, 2] }), m).ok, false, 'the logged-in player must be in it');
  assert.equal(check(sampleResult({ slots: [0, 1, 2] }), m).ok, false, 'one guest too many');
});

// ---- achievements ----

const line = (over = {}) => ({ place: 1, falls: 1, endLives: 2, endPercent: 30, damageDealt: 100, damageTaken: 50, kos: 3, specialKos: 0, ...over });
const before = (over = {}) => ({ ...emptyStats(), ...over });

test('First Win on the first win only', () => {
  assert.ok(newAchievements(before(), line(), 'campus').includes('first_win'));
  assert.equal(newAchievements(before(), line({ place: 2 }), 'campus').includes('first_win'), false);
  assert.equal(newAchievements(before({ wins: 1, achievements: ['first_win'] }), line(), 'campus').includes('first_win'), false, 'not earned twice');
});

test('Hat-Trick on the third win', () => {
  assert.equal(newAchievements(before({ wins: 1 }), line(), 'campus').includes('hat_trick'), false);
  assert.ok(newAchievements(before({ wins: 2 }), line(), 'campus').includes('hat_trick'));
  assert.equal(newAchievements(before({ wins: 2 }), line({ place: 2 }), 'campus').includes('hat_trick'), false);
});

test('Heavy Hitter at 1,000 % damage dealt in total', () => {
  assert.equal(newAchievements(before({ damage_dealt: 899 }), line({ damageDealt: 100 }), 'campus').includes('heavy_hitter'), false);
  assert.ok(newAchievements(before({ damage_dealt: 900 }), line({ damageDealt: 100 }), 'campus').includes('heavy_hitter'));
});

test('Untouchable: win without losing a life', () => {
  assert.ok(newAchievements(before(), line({ falls: 0, endLives: 3 }), 'campus').includes('untouchable'));
  assert.equal(newAchievements(before(), line({ falls: 1 }), 'campus').includes('untouchable'), false);
  assert.equal(newAchievements(before(), line({ falls: 0, place: 2 }), 'campus').includes('untouchable'), false);
});

test('Comeback: win on the last life above 150 %', () => {
  assert.ok(newAchievements(before(), line({ endLives: 1, endPercent: 151 }), 'campus').includes('comeback'));
  assert.equal(newAchievements(before(), line({ endLives: 1, endPercent: 150 }), 'campus').includes('comeback'), false);
  assert.equal(newAchievements(before(), line({ endLives: 2, endPercent: 180 }), 'campus').includes('comeback'), false);
  assert.equal(newAchievements(before(), line({ endLives: 1, endPercent: 180, place: 2 }), 'campus').includes('comeback'), false);
});

test('Globetrotter: a win on each of the three stages', () => {
  const first = newAchievements(before(), line(), 'campus');
  assert.ok(first.includes('won_campus'));
  assert.equal(first.includes('globetrotter'), false);
  const two = before({ wins: 2, achievements: ['first_win', 'won_campus', 'won_beach'] });
  assert.equal(newAchievements(two, line(), 'beach').includes('globetrotter'), false, 'the same stage again does not count');
  assert.ok(newAchievements(two, line(), 'bairro').includes('globetrotter'));
  assert.equal(newAchievements(two, line({ place: 2 }), 'bairro').includes('globetrotter'), false, 'losing there does not count');
});

test('Regular on the tenth match, Special Delivery for a KO with a special', () => {
  assert.equal(newAchievements(before({ matches: 8 }), line({ place: 3 }), 'campus').includes('regular'), false);
  assert.ok(newAchievements(before({ matches: 9 }), line({ place: 3 }), 'campus').includes('regular'));
  assert.ok(newAchievements(before(), line({ place: 2, specialKos: 1 }), 'campus').includes('special_delivery'));
  assert.equal(newAchievements(before(), line({ place: 2, specialKos: 0 }), 'campus').includes('special_delivery'), false);
});

test('there are eight achievements and none has an effect on the result check', () => {
  assert.deepEqual(ACHIEVEMENT_IDS, ['first_win', 'hat_trick', 'heavy_hitter', 'untouchable', 'comeback', 'globetrotter', 'regular', 'special_delivery']);
});

test('scoring: places and damage become points, guests get none', () => {
  const m = match({ slots: [0, 1], guests: 1 });
  const checked = check(sampleResult({ slots: [0, 1, 2] }), m);
  assert.equal(checked.ok, true, checked.reason);
  const roster = new Map([[0, { gamertag: 'Ana', gamertag_lower: 'ana', ...emptyStats() }], [1, { gamertag: 'Max', gamertag_lower: 'max', ...emptyStats(), points: 500 }]]);
  const { matchRow, updates, lines } = scoreResult(m, checked, roster, NOW);
  assert.deepEqual(lines.map((l) => [l.slot, l.place, l.points]), [[0, 1, 130], [1, 2, 64], [2, 3, 0]]);
  assert.equal(lines[1].totalPoints, 564);
  assert.equal(lines[2].guest, true);
  assert.deepEqual(updates.map((u) => u.gamertag_lower), ['ana', 'max']);
  assert.deepEqual(updates[0].deltas, { matches: 1, wins: 1, points: 130, kos: 6, falls: 0, damage_dealt: 300, damage_taken: 80 });
  assert.ok(updates[0].achievements.includes('first_win') && updates[0].achievements.includes('untouchable'));
  assert.deepEqual(lines[0].achievements.map((a) => a.id).sort(), ['first_win', 'untouchable'], 'hidden stage markers are not shown');
  assert.equal(matchRow.match_id, m.id);
  assert.equal(matchRow.winner, 'Ana');
  assert.equal(matchRow.duration_s, 60);
  assert.equal(JSON.parse(matchRow.players_json).length, 3);
  assert.ok(matchRow.players_json.startsWith('['), 'never starts like a spreadsheet formula');
});

test('a long match is fine: there is no time limit', () => {
  const m = match({ startedAt: NOW - 3 * 3600 * 1000 });
  const res = checkResult(m, change((r) => { r.durationS = 2 * 3600; }), NOW);
  assert.equal(res.ok, true, res.reason);
});

test('whatever way a real match ends, its result passes the server check', async () => {
  const { createMatch, step, buildResult } = await import('../../src/game/match.js');
  const play = (setup) => {
    const state = createMatch({ stageId: 'campus', players: [{ slot: 0, name: 'A', fighterId: 'finance_bro' }, { slot: 1, name: 'B', fighterId: 'house_dj' }], settings: { lives: 1, items: false, hazards: false }, seed: 2 });
    while (state.phase === 'countdown') step(state, {});
    setup(state);
    while (state.phase !== 'ended') step(state, {});
    return buildResult(state);
  };
  // Both remaining players leave the screen in the very same frame.
  const both = play((s) => { s.fighters[0].x = -1000; s.fighters[1].x = -1000; });
  // Both hit each other into the 200 % burnout in the very same frame.
  const trade = play((s) => {
    const [a, b] = s.fighters;
    Object.assign(a, { x: 500, facing: 1, percent: 195 });
    Object.assign(b, { x: 560, facing: -1, percent: 195 });
    step(s, { 0: { attack: true }, 1: { attack: true } });
  });
  for (const result of [both, trade]) {
    const res = checkResult(match({ lives: 1 }), result, NOW);
    assert.equal(res.ok, true, res.reason);
    assert.equal(result.players.filter((p) => p.endLives === 1).length, 1, 'exactly one player is left standing');
  }
});
