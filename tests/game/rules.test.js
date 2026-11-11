// Match rules: damage, knockback, KOs, lives, respawn and how a match ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, makeSettings } from '../../src/game/config.js';
import { createMatch, step, buildResult, phoneStatus } from '../../src/game/match.js';
import { launchSpeed, LAUNCH_TEXTS, BURNOUT_TEXTS } from '../../src/game/combat.js';
import { getFighter } from '../../src/game/fighters.js';
import { fight, place, run, tap, of, feedbackFor, launchOut, knockOutTimes } from '../helpers/game.js';

// Attacker (slot 0) hits a target (slot 1) standing 60 px to the right. Returns the hit event.
function oneHit({ targetFighter = 'house_dj', percent = 0 } = {}) {
  const state = fight({ fighters: ['finance_bro', targetFighter] });
  const [a, b] = state.fighters;
  place(a, 500);
  place(b, 560);
  a.facing = 1;
  b.percent = percent;
  const events = tap(state, 0, { attack: true }, 12);
  return { state, a, b, events, hit: of(events, 'hit')[0] };
}

test('a normal attack does 8 % and launches with the formula from the spec', () => {
  const { b, hit } = oneHit();
  assert.equal(b.percent, 8);
  const expected = (4 + (9 * 8) / 100) * (100 / 100);
  assert.equal(hit.speed, expected);
  assert.equal(hit.speed, launchSpeed(4, 9, 8, 100));
  assert.equal(hit.damage, CONFIG.attack.damage);
});

test('hitstun is launch speed times 2.5, rounded, and the fighter cannot act during it', () => {
  const { state, b, hit } = oneHit({ percent: 60 });
  const expected = Math.round(hit.speed * 2.5);
  // the hit landed a few frames ago, so the counter has already run down a little
  assert.ok(b.hitstun > 0 && b.hitstun <= expected);
  const jumps = of(run(state, 3, { 1: { jump: true } }), 'jump');
  assert.equal(jumps.length, 0, 'no jump while in hitstun');
});

test('knockback grows with damage', () => {
  const low = oneHit({ percent: 0 }).hit.speed;
  const mid = oneHit({ percent: 80 }).hit.speed;
  const high = oneHit({ percent: 160 }).hit.speed;
  assert.ok(low < mid && mid < high, `${low} < ${mid} < ${high}`);
});

test('knockback shrinks with weight', () => {
  const light = oneHit({ targetFighter: 'surfer_girl', percent: 50 }).hit.speed; // weight 85
  const normal = oneHit({ targetFighter: 'house_dj', percent: 50 }).hit.speed; // weight 100
  const heavy = oneHit({ targetFighter: 'bairro_chad', percent: 50 }).hit.speed; // weight 120
  assert.ok(light > normal && normal > heavy, `${light} > ${normal} > ${heavy}`);
  assert.equal(heavy, launchSpeed(4, 9, 58, getFighter('bairro_chad').weight));
});

test('a hit is launched away from the attacker and upward', () => {
  const { b } = oneHit({ percent: 50 });
  assert.ok(b.x > 560, 'moved to the right');
  assert.ok(b.y < 600, 'left the ground');
});

test('a hit from 195 % to over 200 % is a burnout KO', () => {
  const { state, a, b, events } = oneHit({ percent: 195 });
  const ko = of(events, 'ko')[0];
  assert.ok(ko, 'a KO happened');
  assert.equal(ko.kind, 'burnout');
  assert.ok(BURNOUT_TEXTS.includes(ko.text));
  assert.equal(ko.by, 0);
  assert.equal(b.lives, 2);
  assert.equal(b.state, 'dead');
  assert.equal(a.stats.kos, 1);
  assert.equal(b.stats.falls, 1);
  assert.equal(state.phase, 'fight');
});

test('reaching exactly 200 % is a burnout, 199 % is not', () => {
  assert.equal(of(oneHit({ percent: 192 }).events, 'ko').length, 1);
  const below = oneHit({ percent: 191 });
  assert.equal(of(below.events, 'ko').length, 0);
  assert.equal(below.b.percent, 199);
});

for (const [side, pos] of [
  ['left', { x: CONFIG.blast.left - 1, y: 300 }],
  ['right', { x: CONFIG.blast.right + 1, y: 300 }],
  ['top', { x: 640, y: CONFIG.blast.top - 10 }],
  ['bottom', { x: 640, y: CONFIG.blast.bottom + CONFIG.body.h + 1 }],
]) {
  test(`crossing the ${side} blast zone is a KO ("launched")`, () => {
    const state = fight();
    const b = state.fighters[1];
    Object.assign(b, { x: pos.x, y: pos.y, vx: 0, vy: 0, onGround: false });
    const events = step(state, {});
    const ko = of(events, 'ko')[0];
    assert.ok(ko, 'KO event');
    assert.equal(ko.kind, 'launched');
    assert.ok(LAUNCH_TEXTS.includes(ko.text));
    assert.equal(b.lives, 2);
  });
}

test('a fighter just inside the blast zone is not knocked out', () => {
  const state = fight();
  const b = state.fighters[1];
  Object.assign(b, { x: CONFIG.blast.left + 30, y: 300, vx: 0, vy: 0, onGround: false });
  assert.equal(of(step(state, {}), 'ko').length, 0);
  assert.equal(b.lives, 3);
});

test('a KO without a recent attacker gives nobody the credit', () => {
  const state = fight();
  const ko = of(launchOut(state, state.fighters[1]), 'ko')[0];
  assert.equal(ko.by, null);
  assert.equal(state.fighters[0].stats.kos, 0);
});

test('after a KO: respawn after 2 s at the top centre, at 0 %, with 2 s of invincibility', () => {
  const state = fight();
  const [a, b] = state.fighters;
  b.percent = 120;
  launchOut(state, b);
  assert.equal(b.state, 'dead');
  run(state, CONFIG.match.respawnFrames - 1);
  assert.equal(b.state, 'dead', 'still away just before 2 s');
  const events = run(state, 1);
  assert.equal(b.state, 'alive');
  assert.equal(of(events, 'respawn').length, 1);
  assert.equal(b.percent, 0);
  assert.equal(b.x, state.stage.respawn.x);
  assert.ok(b.y < 200, 'near the top');
  assert.equal(b.invincible, CONFIG.match.invincibleFrames);

  // An attack during the invincibility does nothing.
  place(b, 560);
  place(a, 500);
  a.facing = 1;
  tap(state, 0, { attack: true }, 12);
  assert.equal(b.percent, 0);
  assert.equal(a.stats.damageDealt, 0);

  // Once it has run out, the same attack lands.
  run(state, CONFIG.match.invincibleFrames);
  place(b, 560);
  place(a, 500);
  tap(state, 0, { attack: true }, 12);
  assert.equal(b.percent, 8);
});

for (const lives of [1, 2, 3]) {
  test(`with ${lives} ${lives === 1 ? 'life' : 'lives'} a player is out after ${lives} KO${lives === 1 ? '' : 's'}`, () => {
    const state = fight({ settings: { lives } });
    const [a, b] = state.fighters;
    assert.equal(b.lives, lives);
    const events = knockOutTimes(state, b, lives - 1);
    assert.equal(b.lives, 1);
    assert.equal(state.phase, 'fight', 'the match goes on while lives are left');
    events.push(...knockOutTimes(state, b, 1));
    assert.equal(b.state, 'out');
    assert.equal(b.lives, 0);
    assert.equal(feedbackFor(events, 'out').length, 1);
    assert.equal(feedbackFor(events, 'ko').length, lives - 1);
    assert.equal(state.winner, a.slot);
  });
}

test('an invalid lives setting falls back to 3', () => {
  assert.equal(makeSettings({ lives: 7 }).lives, 3);
  assert.equal(makeSettings({ lives: 0 }).lives, 3);
  assert.equal(makeSettings({ lives: '2' }).lives, 2, 'a number that arrives as text is accepted');
  assert.equal(makeSettings({ lives: true }).lives, 3);
  assert.equal(makeSettings({ lives: 2.5 }).lives, 3);
});

test('the match ends only when one player is left', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj', 'surfer_girl'], settings: { lives: 1 } });
  const [a, b, c] = state.fighters;
  launchOut(state, c);
  assert.equal(c.state, 'out');
  assert.equal(state.phase, 'fight', 'two players left: still fighting');
  assert.equal(state.winner, null);
  const events = launchOut(state, b);
  assert.equal(of(events, 'finalKo').length, 1);
  assert.equal(state.phase, 'finalKo');
  assert.equal(state.winner, a.slot);
  const rest = run(state, 200);
  assert.equal(state.phase, 'ended');
  const end = of(rest, 'matchEnd')[0];
  assert.deepEqual(end.result.players.map((p) => p.place), [1, 2, 3]);
  assert.equal(end.result.winner, 0);
});

test('nothing changes any more once the match has ended', () => {
  const state = fight({ settings: { lives: 1 } });
  launchOut(state, state.fighters[1]);
  run(state, 200);
  const before = JSON.stringify(buildResult(state));
  const frame = state.frame;
  const events = run(state, 50, { 0: { attack: true, right: true } });
  assert.equal(events.length, 0);
  assert.equal(state.frame, frame);
  assert.equal(JSON.stringify(buildResult(state)), before);
});

test('the winner cannot be hurt or knocked out during the final KO', () => {
  const state = fight({ settings: { lives: 1 } });
  const [a, b] = state.fighters;
  launchOut(state, b);
  assert.equal(state.phase, 'finalKo');
  a.x = -2000;
  run(state, 200);
  assert.equal(a.lives, 1);
  assert.equal(buildResult(state).winner, 0);
});

test('two players knocked out in the same frame: the one with less damage places higher', () => {
  const state = fight({ settings: { lives: 1 } });
  const [a, b] = state.fighters;
  a.percent = 150;
  b.percent = 20;
  a.x = -1000;
  b.x = -1000;
  step(state, {});
  assert.equal(state.winner, b.slot);
  assert.deepEqual(state.placements, [1, 0]);
});

test('the result lists every player with stats and places', () => {
  const state = fight({ settings: { lives: 1 } });
  const [a, b] = state.fighters;
  place(a, 500);
  place(b, 560);
  tap(state, 0, { attack: true }, 12);
  launchOut(state, b);
  run(state, 200);
  const r = buildResult(state);
  assert.equal(r.stage, 'campus');
  assert.equal(r.lives, 1);
  assert.equal(r.winner, 0);
  const [pa, pb] = r.players;
  assert.deepEqual([pa.place, pa.damageDealt, pa.kos, pa.falls, pa.endLives], [1, 8, 1, 0, 1]);
  assert.deepEqual([pb.place, pb.damageTaken, pb.kos, pb.falls, pb.endLives, pb.endPercent], [2, 8, 0, 1, 0, 8]);
});

test('the countdown runs 3, 2, 1 and nobody can move before "go"', () => {
  const state = createMatch({ stageId: 'beach', players: [{ slot: 0, name: 'A', fighterId: 'finance_bro' }, { slot: 2, name: 'B', fighterId: 'house_dj' }], seed: 3 });
  const x = state.fighters[0].x;
  const events = [];
  for (let i = 0; i < CONFIG.match.countdownFrames; i++) events.push(...step(state, { 0: { right: true, jump: true } }));
  assert.deepEqual(of(events, 'countdown').map((e) => e.n), [3, 2, 1]);
  assert.equal(of(events, 'go').length, 1);
  assert.equal(state.fighters[0].x, x);
  assert.equal(state.phase, 'fight');
});

test('createMatch rejects bad player lists, stages and fighters', () => {
  const p = (slot, fighterId = 'finance_bro') => ({ slot, name: 'X', fighterId });
  assert.throws(() => createMatch({ stageId: 'campus', players: [p(0)] }), /2 to 4/);
  assert.throws(() => createMatch({ stageId: 'campus', players: [p(0), p(1), p(2), p(3), p(4)] }), /2 to 4/);
  assert.throws(() => createMatch({ stageId: 'campus', players: [p(0), p(0)] }), /different slot/);
  assert.throws(() => createMatch({ stageId: 'campus', players: [p(0), p(7)] }), /different slot/);
  assert.throws(() => createMatch({ stageId: 'moon', players: [p(0), p(1)] }), /Unknown stage/);
  assert.throws(() => createMatch({ stageId: 'campus', players: [p(0), p(1, 'mario')] }), /Unknown fighter/);
});

test('the later player with the same fighter is marked for the player-colour top', () => {
  const state = fight({ fighters: ['surfer_girl', 'surfer_girl', 'house_dj'] });
  assert.deepEqual(state.fighters.map((f) => f.altColor), [false, true, false]);
});

test('an absent player (no input) stands idle and can still be hit', () => {
  const state = fight();
  const [a, b] = state.fighters;
  place(a, 500);
  place(b, 560);
  run(state, 30, { 0: {} }); // slot 1 sends nothing at all
  assert.equal(b.x, 560);
  tap(state, 0, { attack: true }, 12);
  assert.equal(b.percent, 8);
});

test('the phone status reports damage, lives and the special cooldown', () => {
  const state = fight();
  const a = state.fighters[0];
  a.percent = 42.7;
  tap(state, 0, { special: true }, 2);
  const s = phoneStatus(state, 0);
  assert.equal(s.pct, 42);
  assert.equal(s.lives, 3);
  assert.equal(s.state, 'alive');
  assert.ok(s.cd > 0 && s.cd <= s.cdMax);
  assert.equal(phoneStatus(state, 3), null);
});

test('the optional time cap is off by default and ranks by lives, then lowest damage', () => {
  const normal = fight();
  run(normal, 60 * 30);
  assert.equal(normal.phase, 'fight', 'no time limit in the normal game');

  const capped = fight({ settings: { timeCapS: 5 } });
  capped.fighters[0].percent = 90;
  capped.fighters[1].percent = 30;
  const events = run(capped, 60 * 5 + 1);
  assert.equal(capped.phase, 'ended');
  const result = of(events, 'matchEnd')[0].result;
  assert.equal(result.winner, 1);
  assert.equal(result.byTimeCap, true);
});

test('the final KO announces "FINAL KO!", names the winner and vibrates every phone', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj', 'surfer_girl'], settings: { lives: 1 } });
  launchOut(state, state.fighters[2]);
  const events = launchOut(state, state.fighters[1]);
  const final = of(events, 'finalKo')[0];
  assert.equal(final.text, 'FINAL KO!');
  assert.equal(final.winnerText, 'P1 graduates with honours!');
  assert.equal(final.winner, 0);
  assert.deepEqual(feedbackFor(events, 'finalKo').sort(), [0, 1, 2], 'all three phones, also the eliminated ones');
  const longest = of(events, 'feedback').find((e) => e.kind === 'out').vibrate.reduce((a, b) => a + b, 0);
  assert.ok(longest >= 1700, 'an elimination vibrates longest');
});

test('respawn takes exactly 2 s also when the KO comes from a special of an earlier player', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 300);
  place(b, 400);
  b.percent = 196;
  let koAt = null;
  let backAt = null;
  tap(state, 0, { special: true }, 1);
  for (let i = 0; i < 200 && backAt === null; i++) {
    for (const e of run(state, 1)) {
      if (e.type === 'ko') koAt = state.frame;
      if (e.type === 'respawn') backAt = state.frame;
    }
  }
  assert.equal(backAt - koAt, CONFIG.match.respawnFrames);
});
