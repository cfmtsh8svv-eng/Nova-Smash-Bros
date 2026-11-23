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
function guide(roster = players) {
  const s = createMatch({ stageId: 'campus', players: roster, tutorial: true });
  run(s, 180);
  return s;
}
function both(s, input) { return step(s, { 0: input, 1: input }); }
function finishSteps(s) {
  both(s, { left: true }); both(s, { right: true });
  both(s, { jump: true }); both(s, { attack: true });
  return both(s, { special: true });
}

test('tutorial waits for both directions and every human; unrelated and held buttons cannot skip steps', () => {
  const s = guide();
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

test('free practice starts after the final required action and lasts exactly 600 active frames', () => {
  const s = guide();
  const events = finishSteps(s);
  assert.equal(s.tutorial.step, 4);
  assert.equal(s.tutorial.practiceFrames, 0, 'the last explanation does not consume practice time');
  assert.equal(events.some((e) => e.type === 'tutorialEnd'), false, 'completion is not saved yet');
  for (const slot of [0, 1]) assert.equal(phoneStatus(s, slot).tutorialLeft, 10);
  for (const f of s.fighters) {
    assert.equal(canBeHit(f), false, 'newcomer, returning human and bot are protected');
    for (const kind of ['normal', 'special', 'item', 'hazard']) {
      assert.equal(applyHit(s, f, { damage: 200, baseKb: 100, kbGrowth: 100, by: null, kind }), MISS);
    }
    knockOut(s, f, 'launched');
    assert.equal(f.lives, 3);
    assert.equal(f.percent, 0);
    assert.equal(f.hitstun, 0);
  }
  run(s, 599);
  assert.equal(s.tutorial.active, true);
  assert.equal(phoneStatus(s, 0).tutorialLeft, 1);
  const end = step(s).find((e) => e.type === 'tutorialEnd');
  assert.deepEqual(end.slots, [0, 1]);
  assert.equal(s.tutorial.practiceFrames, 600);
  assert.equal(s.tutorial.active, false);
  assert.ok(s.fighters.every(canBeHit));
  assert.equal(phoneStatus(s, 0).tutorialStep, undefined);
  assert.equal(applyHit(s, s.fighters[0], { damage: 8, by: 1, kind: 'normal' }), 1, 'combat starts immediately afterwards');
});

test('a long explanation still gets a fresh ten seconds; countdown and pause consume no practice time', () => {
  const s = createMatch({ stageId: 'beach', players, tutorial: true });
  run(s, 180);
  assert.equal(s.tutorial.frames, 0);
  run(s, 1200);
  assert.equal(s.tutorial.step, 0, 'time alone does not complete the explanation');
  assert.equal(s.tutorial.practiceFrames, 0);
  finishSteps(s);
  assert.equal(phoneStatus(s, 0).tutorialLeft, 10);
  run(s, 60);
  assert.equal(phoneStatus(s, 0).tutorialLeft, 9);
  const loop = createLoop({ state: s, getInputs: () => ({}) });
  loop.paused = true;
  loop.tick(10000);
  assert.equal(s.tutorial.practiceFrames, 60);
  run(s, 539);
  assert.equal(s.tutorial.active, true);
  step(s);
  assert.equal(s.tutorial.active, false);
});

test('movement and jumps work during free practice; falls cost no life and item/hazard timers wait', () => {
  const s = guide();
  finishSteps(s);
  const itemTimer = s.itemTimer;
  const hazard = structuredClone(s.hazard);
  run(s, 60); // the trial special from the last step plays out first (D-221)
  const x = s.fighters[0].x;
  both(s, {}); both(s, { right: true });
  assert.ok(s.fighters[0].x > x, 'the controller can still steer');
  run(s, 100); // land after the jump in the explanation
  both(s, { jump: true });
  assert.ok(s.fighters[0].vy < 0, 'jumping works');
  s.fighters[0].x = -1000;
  step(s);
  assert.equal(s.fighters[0].lives, 3);
  assert.ok(s.fighters[0].x >= 0);
  assert.equal(s.itemTimer, itemTimer);
  assert.deepEqual(s.hazard, hazard);
  run(s, 600 - s.tutorial.practiceFrames);
  step(s);
  assert.equal(s.itemTimer, itemTimer - 1, 'items only start ticking during the real fight');
});

test('trial specials and projectiles are cleared before combat and cooldowns are reset', () => {
  const s = guide([{ ...players[0], fighterId: 'maastricht_blondie' }, ...players.slice(1)]);
  finishSteps(s);
  assert.equal(s.fighters[0].cooldown, 0, 'special is ready for free practice');
  run(s, 592);
  both(s, { special: true }); // Padel Smash releases its ball on its eighth frame.
  run(s, 6);
  const events = step(s);
  assert.ok(events.some((e) => e.type === 'projectile'), 'the real practice special was animated');
  assert.equal(s.projectiles.length, 0, 'no practice projectile can hit after protection ends');
  for (const f of s.fighters) {
    assert.equal(f.special, null);
    assert.equal(f.attack, null);
    assert.equal(f.specialBuffer, 0);
    assert.equal(f.attackBuffer, 0);
    assert.equal(f.cooldown, 0);
    assert.equal(f.stats.damageDealt, 0);
    assert.equal(f.stats.damageTaken, 0);
  }
});

test('the special that finishes the last step plays out in free practice (D-221)', () => {
  const s = guide([{ ...players[0], fighterId: 'maastricht_blondie' }, ...players.slice(1)]);
  both(s, { left: true }); both(s, { right: true }); both(s, { jump: true }); both(s, { attack: true });
  run(s, 60); // the attack from step 3 is over, so the special can start at once
  step(s, { 1: { special: true } });
  const events = step(s, { 0: { special: true } });
  assert.equal(s.tutorial.step, 4);
  assert.ok(events.some((e) => e.type === 'special' && e.slot === 0));
  assert.ok(s.fighters[0].special, 'the special is not cancelled when free practice starts');
  assert.equal(s.fighters[0].cooldown, 0, 'and it is ready again for free practice');
  let ball = false;
  for (let i = 0; i < 10; i++) ball = step(s).some((e) => e.type === 'projectile' && e.slot === 0) || ball;
  assert.ok(ball, 'Padel Smash releases its ball as usual');
});

test('a fighter who is falling out when free practice ends returns to the spawn point (D-221)', () => {
  const s = guide();
  finishSteps(s);
  run(s, 585);
  Object.assign(s.fighters[0], { x: 100, y: 700, vx: -3, vy: 6, onGround: false, jumpsLeft: 0 });
  run(s, 14);
  assert.equal(s.tutorial.active, true);
  const end = step(s);
  assert.ok(end.some((e) => e.type === 'tutorialEnd'));
  assert.equal(s.fighters[0].x, s.stage.spawns[0].x);
  assert.equal(s.fighters[0].y, s.stage.spawns[0].y);
  const kos = [];
  for (let i = 0; i < 120; i++) kos.push(...step(s).filter((e) => e.type === 'ko'));
  assert.deepEqual(kos, [], 'no life is lost for a fall that began during practice');
  assert.equal(s.fighters[0].lives, 3);
});

test('disconnected humans do not block guide steps; free practice ends without further inputs', () => {
  const s = guide();
  s.fighters[1].connected = false;
  for (const input of [{ left: true }, { right: true }, { jump: true }, { attack: true }, { special: true }]) step(s, { 0: input });
  assert.equal(s.tutorial.step, 4);
  run(s, 599);
  const e = step(s).find((e) => e.type === 'tutorialEnd');
  assert.deepEqual(e.slots, [0], 'a player who missed the guide still needs it next time');
  const allOffline = guide();
  finishSteps(allOffline);
  for (const f of allOffline.fighters) f.connected = false;
  run(allOffline, 600);
  assert.equal(allOffline.tutorial.active, false, 'a dropped phone does not extend the ten seconds');
});

test('normal matches have no tutorial or extra protection; tutorial replay is deterministic', () => {
  const normal = createMatch({ stageId: 'campus', players });
  assert.equal(normal.tutorial, null);
  assert.ok(normal.fighters.every(canBeHit));
  const a = guide(), b = guide();
  finishSteps(a); finishSteps(b); run(a, 900); run(b, 900);
  assert.deepEqual(a, b);
});
