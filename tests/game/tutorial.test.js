import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step, phoneStatus } from '../../src/game/match.js';
import { applyHit, canBeHit, knockOut, MISS } from '../../src/game/combat.js';
import { createLoop } from '../../src/game/loop.js';
import { run } from '../helpers/game.js';

const players = [
  { slot: 0, name: 'New', fighterId: 'finance_bro' },
  { slot: 1, name: 'Returning', fighterId: 'surfer_girl' },
  { slot: 2, name: 'Bot', fighterId: 'house_dj', bot: true },
];
function practice() {
  const s = createMatch({ stageId: 'campus', players, tutorial: true });
  run(s, 180);
  return s;
}
function both(s, input) { step(s, { 0: input, 1: input }); }
function finishSteps(s) {
  both(s, { left: true }); both(s, { right: true });
  both(s, { jump: true }); both(s, { attack: true }); both(s, { special: true });
}

test('tutorial waits for both directions and every human; unrelated and held buttons cannot skip steps', () => {
  const s = practice();
  step(s, { 0: { left: true, jump: true }, 1: { left: true } });
  step(s, { 0: { right: true, jump: true } });
  assert.equal(s.tutorial.step, 0, 'second human has not gone right');
  assert.equal(phoneStatus(s, 0).tutorialDone, true);
  step(s, { 0: { jump: true }, 1: { right: true } });
  assert.equal(s.tutorial.step, 1);
  both(s, { jump: true });
  assert.equal(s.tutorial.step, 1, 'a jump held from the previous step is not a new press');
  both(s, {}); both(s, { jump: true });
  assert.equal(s.tutorial.step, 2, 'bots do not block progress');
});

test('all fighters are protected for exactly the first 900 active frames when steps finish early', () => {
  const s = practice();
  finishSteps(s);
  assert.equal(s.tutorial.step, 4);
  for (const f of s.fighters) {
    assert.equal(canBeHit(f), false);
    assert.equal(applyHit(s, f, { damage: 200, by: null, kind: 'hazard' }), MISS);
    knockOut(s, f, 'launched');
    assert.equal(f.lives, 3);
  }
  const remaining = 900 - s.tutorial.frames;
  run(s, remaining - 1);
  assert.equal(s.tutorial.active, true);
  assert.equal(s.tutorial.frames, 899);
  const events = step(s);
  assert.equal(s.tutorial.active, false);
  assert.deepEqual(events.find((e) => e.type === 'tutorialEnd').slots, [0, 1]);
  assert.ok(s.fighters.every(canBeHit));
  assert.equal(phoneStatus(s, 0).tutorialStep, undefined);
  assert.equal(s.itemTimer > 0, true);
  step(s); assert.equal(applyHit(s, s.fighters[0], { damage: 8, by: 1, kind: 'normal' }), 1);
});

test('tutorial extends until real actions finish; countdown and pause do not use protection time', () => {
  const s = createMatch({ stageId: 'beach', players, tutorial: true });
  run(s, 180);
  assert.equal(s.tutorial.frames, 0);
  const loop = createLoop({ state: s, getInputs: () => ({}) });
  loop.paused = true; loop.tick(1000);
  assert.equal(s.tutorial.frames, 0);
  run(s, 1000);
  assert.equal(s.tutorial.active, true);
  assert.equal(phoneStatus(s, 0).tutorialLeft, 0);
  finishSteps(s);
  assert.equal(s.tutorial.active, false);
});

test('falling during practice returns safely; items and hazards wait; disconnects do not block connected humans', () => {
  const s = practice();
  const itemTimer = s.itemTimer;
  const hazard = structuredClone(s.hazard);
  s.fighters[0].x = -1000;
  step(s);
  assert.equal(s.fighters[0].lives, 3);
  assert.ok(s.fighters[0].x >= 0);
  assert.equal(s.itemTimer, itemTimer);
  assert.deepEqual(s.hazard, hazard);
  s.fighters[1].connected = false;
  for (const input of [{ left: true }, { right: true }, { jump: true }, { attack: true }, { special: true }]) step(s, { 0: input });
  assert.equal(s.tutorial.step, 4);
  run(s, 900 - s.tutorial.frames - 1);
  const e = step(s).find((e) => e.type === 'tutorialEnd');
  assert.deepEqual(e.slots, [0], 'a player who missed the guide still needs it next time');
});

test('normal matches have no tutorial or extra protection; tutorial replay is deterministic', () => {
  const normal = createMatch({ stageId: 'campus', players });
  assert.equal(normal.tutorial, null);
  assert.ok(normal.fighters.every(canBeHit));
  const a = practice(), b = practice();
  finishSteps(a); finishSteps(b); run(a, 900); run(b, 900);
  assert.deepEqual(a, b);
});
