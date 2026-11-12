// The stomp (GAME_SPEC §6, D-137): Attack in the air without Up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/game/config.js';
import { step } from '../../src/game/match.js';
import { fight, of, place, run, tap } from '../helpers/game.js';

const S = CONFIG.stomp;

// Put a fighter in the air above the main ground (feet at y).
function inAir(f, x, y) {
  Object.assign(f, { x, y, vx: 0, vy: 0, onGround: false, groundId: -1, jumpsLeft: 1 });
  return f;
}

// Run until the stomper has landed and the shockwave is out (or the frames run out).
function untilShockwave(state, frames = 80) {
  const events = [];
  for (let i = 0; i < frames; i++) {
    events.push(...step(state, {}));
    if (of(events, 'fx').some((e) => e.fx === 'stomp')) break;
  }
  return events;
}

test('the stomp numbers are in config.js', () => {
  assert.deepEqual(S, { diveSpeed: 18, radius: 130, damage: 9, baseKb: 6, kbGrowth: 9, angleDeg: 45, recovery: 14, maxAir: 60 });
});

test('attack in the air without Up starts a stomp: no sideways movement, a fast straight drop', () => {
  const state = fight();
  const [a] = state.fighters;
  inAir(a, 400, 100); // high above the main roof
  a.vx = 5;
  tap(state, 0, { attack: true, right: true }, 2);
  assert.equal(a.attack.kind, 'stomp');
  assert.equal(a.vx, 0, 'stops moving sideways');
  const x = a.x;
  const y = a.y;
  run(state, 2, { 0: { right: true } }); // holding right changes nothing
  assert.equal(a.x, x);
  assert.equal(a.y, y + 2 * S.diveSpeed, 'drops straight down at the dive speed');
});

test('the shockwave hits an opponent inside the radius, not one outside, and knocks them away', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj', 'surfer_girl'] });
  const [a, near, far] = state.fighters;
  inAir(a, 600, 420);
  place(near, 600 + S.radius - 10);
  place(far, 600 - S.radius - 30);
  tap(state, 0, { attack: true });
  const events = untilShockwave(state);
  const wave = of(events, 'fx').find((e) => e.fx === 'stomp');
  assert.ok(wave, 'a shockwave on landing');
  assert.equal(wave.radius, S.radius);
  assert.equal(near.percent, S.damage);
  assert.ok(near.vx > 0, 'pushed away from the stomper (to the right)');
  assert.ok(near.vy < 0, 'and up');
  assert.equal(far.percent, 0, 'outside the radius: nothing');
  assert.deepEqual(of(events, 'hit').map((e) => [e.slot, e.source]), [[1, 'stomp']]);
});

test('after landing the stomper needs the recovery frames before acting again', () => {
  const state = fight();
  const [a, b] = state.fighters;
  place(b, 1000);
  inAir(a, 400, 560);
  tap(state, 0, { attack: true });
  untilShockwave(state);
  assert.equal(a.onGround, true);
  assert.equal(a.attack.phase, 'recover');
  run(state, S.recovery - 1);
  assert.ok(a.attack, 'still recovering');
  run(state, 1);
  assert.equal(a.attack, null, 'free again');
  tap(state, 0, { attack: true }, 1);
  assert.equal(a.attack.kind, 'normal', 'on the ground Attack is the normal attack');
  assert.equal(a.cooldown, 0, 'the stomp uses no special cooldown');
});

test('Up + Attack in the air is still the upward attack', () => {
  const state = fight();
  const [a, b] = state.fighters;
  inAir(a, 600, 400);
  inAir(b, 600, 330);
  b.invincible = 0;
  tap(state, 0, { attack: true, up: true });
  assert.equal(a.attack.kind, 'normal');
  assert.equal(a.attack.dir, 'up');
  run(state, CONFIG.attack.startup + 1, { 0: { up: true } });
  assert.equal(b.percent, CONFIG.attack.damage);
});

test('a held Book is thrown in the air, not stomped', () => {
  const state = fight();
  const [a] = state.fighters;
  a.held = { type: 'book', uses: 1 };
  inAir(a, 400, 300);
  const events = tap(state, 0, { attack: true }, CONFIG.attack.startup + 1);
  assert.equal(of(events, 'projectile').filter((e) => e.kind === 'book').length, 1, 'the book flies');
  assert.equal(a.held, null);
  assert.ok(!of(events, 'fx').some((e) => e.fx === 'stomp'));
});

test('a held Sardine powers the stomp and uses one swing', () => {
  const state = fight();
  const [a, b] = state.fighters;
  a.held = { type: 'sardine', uses: CONFIG.items.sardineSwings };
  inAir(a, 600, 420);
  place(b, 680);
  tap(state, 0, { attack: true });
  assert.equal(a.attack.kind, 'stomp');
  assert.equal(a.attack.power, 'sardine');
  assert.equal(a.held.uses, CONFIG.items.sardineSwings - 1, 'one swing used');
  untilShockwave(state);
  assert.equal(b.percent, CONFIG.items.sardine.damage, 'Sardine damage');
});

test('a stomp off the edge ends after the maximum air time without a shockwave', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const [a, b] = state.fighters;
  place(b, 130); // standing on the edge of the main ground, close to where the stomper falls past
  inAir(a, 60, 300); // beside the stage: nothing to land on
  tap(state, 0, { attack: true });
  assert.equal(a.attack.kind, 'stomp');
  const events = [];
  for (let i = 0; i < S.maxAir + 5 && a.state === 'alive'; i++) events.push(...step(state, {}));
  assert.ok(!of(events, 'fx').some((e) => e.fx === 'stomp'), 'no shockwave');
  assert.equal(b.percent, 0, 'nobody was hit');
});

test('a stomp that runs out of air time over the void lets gravity take over again', () => {
  const state = fight();
  const [a] = state.fighters;
  inAir(a, 60, -150); // high and beside the stage: 60 frames of diving end above the bottom of the blast zone
  tap(state, 0, { attack: true });
  run(state, S.maxAir);
  assert.equal(a.state, 'alive');
  assert.equal(a.attack, null, 'the stomp is over');
  run(state, 1);
  assert.ok(a.vy < S.diveSpeed, `falling normally again (vy ${a.vy})`);
});

test('no jump while diving', () => {
  const state = fight();
  const [a] = state.fighters;
  inAir(a, 400, 100);
  tap(state, 0, { attack: true });
  const events = tap(state, 0, { jump: true }, 2);
  assert.equal(of(events, 'jump').length, 0);
  assert.equal(a.jumpsLeft, 1, 'the double jump is kept');
  assert.equal(a.vy, S.diveSpeed);
});

test('the diving fighter shows the stomp pose, which every sprite set has', async () => {
  const { poseOf } = await import('../../src/game/view.js');
  const { POSES } = await import('../../public/shared/art/characters.js');
  const state = fight();
  const [a] = state.fighters;
  inAir(a, 400, 100);
  tap(state, 0, { attack: true });
  assert.equal(poseOf(a), 'stomp');
  assert.ok(POSES.stomp, 'the sprite generator draws it');
});
