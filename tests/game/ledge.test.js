// Ledge grab (GAME_SPEC §5, D-138): getting back after a fall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/game/config.js';
import { applyHit } from '../../src/game/combat.js';
import { poseOf } from '../../src/game/view.js';
import { POSES } from '../../public/shared/art/characters.js';
import { fight, of, place, run, tap } from '../helpers/game.js';

const L = CONFIG.ledge;
const B = CONFIG.body;

// A fighter just beside the left wall of the campus terrace (corner at 120, 600), facing it.
function besideLeftWall(state, f, { y = 640, vy = 1, facing = 1 } = {}) {
  const ground = state.stage.platforms[0];
  Object.assign(f, { x: ground.x - B.w / 2 - 2, y, vx: 0, vy, facing, onGround: false, groundId: -1, jumpsLeft: 0 });
  return f;
}

// Run until the fighter hangs (or `frames` frames have passed). Returns the events.
function untilHang(state, f, frames = 40, inputs = {}) {
  const events = [];
  for (let i = 0; i < frames && !f.hang; i++) events.push(...run(state, 1, inputs));
  return events;
}

test('the ledge numbers are in config.js', () => {
  assert.deepEqual(L, { reach: 20, hangFrames: 90, climbInset: 30 });
});

test('a falling fighter facing the wall grabs the corner of the main ground', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  const events = untilHang(state, a);
  assert.ok(a.hang, 'hanging');
  assert.equal(of(events, 'ledgeGrab').length, 1);
  const ground = state.stage.platforms[0];
  // The hand point (top of the hurtbox, wall side) is at the corner.
  assert.equal(a.x + a.facing * (B.w / 2), ground.x);
  assert.equal(a.y - B.h, ground.y);
  assert.equal(poseOf(a), 'hang');
  assert.ok(POSES.hang, 'the sprite generator has a hanging pose');
  // Hanging keeps the fighter in place.
  run(state, 20);
  assert.equal(a.y - B.h, ground.y);
  assert.equal(a.vy, 0);
});

test('the right corner works the same, facing left', () => {
  const state = fight();
  const [a] = state.fighters;
  const ground = state.stage.platforms[0];
  Object.assign(a, { x: ground.x + ground.w + B.w / 2 + 2, y: 640, vx: 0, vy: 1, facing: -1, onGround: false, groundId: -1 });
  untilHang(state, a);
  assert.ok(a.hang);
  assert.equal(a.x - B.w / 2, ground.x + ground.w);
});

test('no grab while going up', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a, { y: 720, vy: -8 });
  for (let i = 0; i < 12; i++) {
    run(state, 1);
    if (a.vy > 0) break; // from here on it is falling again
    assert.equal(a.hang, null, `frame ${i}: moving up, no grab`);
  }
});

test('no grab when facing away from the wall', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a, { facing: -1 });
  untilHang(state, a, 30);
  assert.equal(a.hang, null);
});

test('no grab in hitstun or stun', () => {
  for (const key of ['hitstun', 'stun']) {
    const state = fight();
    const [a] = state.fighters;
    besideLeftWall(state, a);
    a[key] = 200;
    untilHang(state, a, 30);
    assert.equal(a.hang, null, key);
  }
});

test('only the main ground can be grabbed, not a thin platform', () => {
  const state = fight();
  const [a] = state.fighters;
  const canopy = state.stage.platforms.find((p) => p.id === 'canopy'); // x 130..320 at y 470
  Object.assign(a, { x: canopy.x + canopy.w + B.w / 2 + 2, y: canopy.y + B.h + 30, vx: 0, vy: 1, facing: -1, onGround: false, groundId: -1 });
  for (let i = 0; i < 15; i++) run(state, 1);
  assert.equal(a.hang, null);
});

test('once per airtime: after letting go, no new grab until standing on a platform again', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  assert.ok(a.hang);
  tap(state, 0, { down: true });
  assert.equal(a.hang, null, 'Down lets go');
  besideLeftWall(state, a);
  untilHang(state, a, 30);
  assert.equal(a.hang, null, 'the same airtime: no second grab');
  // Standing on the ground resets it.
  place(a, 400);
  run(state, 2);
  besideLeftWall(state, a);
  untilHang(state, a);
  assert.ok(a.hang, 'a new airtime, a new grab');
});

test('a respawn resets the grab too', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  tap(state, 0, { down: true });
  a.x = -1000;
  run(state, 1);
  assert.equal(a.state, 'dead');
  run(state, CONFIG.match.respawnFrames + 1);
  assert.equal(a.state, 'alive');
  assert.equal(a.ledgeUsed, false);
});

test('Jump climbs up onto the ground, standing near the edge', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  const events = tap(state, 0, { jump: true }, 2);
  const ground = state.stage.platforms[0];
  assert.equal(a.hang, null);
  assert.equal(a.onGround, true);
  assert.equal(a.y, ground.y);
  assert.equal(a.x, ground.x + L.climbInset);
  assert.equal(of(events, 'ledgeClimb').length, 1);
});

test('pushing away from the wall lets go; pushing towards it keeps hanging', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  run(state, 5, { 0: { right: true } });
  assert.ok(a.hang, 'towards the wall: still hanging');
  run(state, 1, { 0: { left: true } });
  assert.equal(a.hang, null, 'away from the wall: let go');
});

test('Attack and Special do nothing while hanging', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  tap(state, 0, { attack: true }, 3);
  tap(state, 0, { special: true }, 3);
  assert.ok(a.hang);
  assert.equal(a.attack, null);
  assert.equal(a.special, null);
});

test('hanging lasts at most 1.5 s, then the fighter drops', () => {
  const state = fight();
  const [a] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  run(state, L.hangFrames - 1);
  assert.ok(a.hang, 'still hanging just before 1.5 s');
  const events = run(state, 1);
  assert.equal(a.hang, null, 'dropped');
  assert.equal(of(events, 'ledgeDrop').length, 1);
  run(state, 3);
  assert.ok(a.vy > 0, 'falling');
});

test('no invincibility while hanging: a hit knocks the fighter off', () => {
  const state = fight();
  const [a, b] = state.fighters;
  besideLeftWall(state, a);
  untilHang(state, a);
  const result = applyHit(state, a, { by: b.slot, kind: 'normal', damage: 8, baseKb: 4, kbGrowth: 9, angleDeg: 38, dirX: -1 });
  assert.ok(result);
  assert.equal(a.hang, null);
  assert.equal(a.percent, 8);
  assert.ok(a.vx < 0, 'launched as usual');
});
