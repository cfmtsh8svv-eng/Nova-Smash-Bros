// Movement and aiming: running, jumping, platforms, and where attacks go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/game/config.js';
import { fight, place, run, tap, of } from '../helpers/game.js';

test('a single jump reaches about 160 px', () => {
  const state = fight();
  const a = place(state.fighters[0], 640);
  let top = a.y;
  tap(state, 0, { jump: true }, 1);
  for (let i = 0; i < 80; i++) {
    run(state, 1);
    top = Math.min(top, a.y);
  }
  const height = 600 - top;
  assert.ok(height > 150 && height < 170, `jump height ${height}`);
  assert.equal(a.y, 600, 'back on the ground');
});

test('every platform level can be reached with a jump from the level below', () => {
  const state = fight({ stage: 'campus' });
  const a = place(state.fighters[0], 200); // under the canopy (y 470)
  tap(state, 0, { jump: true }, 60);
  assert.equal(a.y, 470);
  assert.equal(a.onGround, true);
});

test('exactly one double jump per airtime', () => {
  const state = fight();
  const a = place(state.fighters[0], 400);
  const first = of(tap(state, 0, { jump: true }, 10), 'jump');
  assert.deepEqual(first.map((e) => e.double), [false]);
  const second = of(tap(state, 0, { jump: true }, 10), 'jump');
  assert.deepEqual(second.map((e) => e.double), [true]);
  const third = of(tap(state, 0, { jump: true }, 10), 'jump');
  assert.equal(third.length, 0, 'no third jump in the air');
  run(state, 120);
  assert.equal(a.onGround, true);
  // After landing the jumps are back.
  assert.equal(of(tap(state, 0, { jump: true }, 10), 'jump').length, 1);
  assert.equal(of(tap(state, 0, { jump: true }, 10), 'jump')[0].double, true);
});

test('walking off an edge leaves exactly one jump in the air', () => {
  const state = fight({ stage: 'campus' });
  const a = place(state.fighters[0], 300, 470); // on the canopy, right end at 320
  run(state, 12, { 0: { right: true } });
  assert.equal(a.onGround, false, 'walked off');
  assert.ok(a.y > 470 && a.y < 600, 'falling between the canopy and the terrace');
  assert.equal(of(tap(state, 0, { jump: true }, 6), 'jump').length, 1);
  assert.equal(of(tap(state, 0, { jump: true }, 6), 'jump').length, 0);
});

test('holding the jump button does not repeat the jump', () => {
  const state = fight();
  place(state.fighters[0], 400);
  const jumps = of(run(state, 200, { 0: { jump: true } }), 'jump');
  assert.equal(jumps.length, 1);
});

test('a jump pressed a moment before landing still happens (input buffer)', () => {
  const state = fight();
  const a = place(state.fighters[0], 400);
  tap(state, 0, { jump: true }, 2);
  assert.equal(of(tap(state, 0, { jump: true }, 2), 'jump')[0].double, true); // the double jump is used up
  let guard = 0;
  while (!(a.vy > 0 && 600 - a.y < 12) && guard++ < 300) run(state, 1);
  const events = tap(state, 0, { jump: true }, 12); // pressed just above the ground
  assert.equal(of(events, 'jump').length, 1);
  assert.equal(of(events, 'jump')[0].double, false);
});

test('left and right move the fighter; faster fighters run faster', () => {
  const state = fight({ fighters: ['surfer_girl', 'bairro_chad'] }); // speed 5 and speed 2
  const [fast, slow] = state.fighters;
  place(fast, 300);
  place(slow, 300);
  run(state, 40, { 0: { right: true }, 1: { right: true } });
  assert.ok(fast.x > slow.x + 30, `${fast.x} vs ${slow.x}`);
  assert.equal(fast.facing, 1);
  run(state, 40, { 0: { left: true } });
  assert.equal(fast.facing, -1);
  assert.ok(fast.vx < 0);
});

test('run speed never exceeds the fighter maximum on the ground', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const a = place(state.fighters[0], 200);
  let max = 0;
  for (let i = 0; i < 100; i++) {
    run(state, 1, { 0: { right: true } });
    max = Math.max(max, a.vx);
  }
  assert.ok(Math.abs(max - a.runSpeed) < 1e-9, `${max} vs ${a.runSpeed}`);
});

test('Down drops through a thin platform but not through the main ground', () => {
  const state = fight({ stage: 'campus' });
  const a = place(state.fighters[0], 600, 336); // on the main roof
  run(state, 2);
  assert.equal(a.onGround, true);
  tap(state, 0, { down: true }, 60);
  assert.equal(a.y, 600, 'fell to the terrace');
  tap(state, 0, { down: true }, 30);
  assert.equal(a.y, 600, 'the terrace is solid');
});

test('thin platforms can be jumped through from below', () => {
  const state = fight({ stage: 'bairro' });
  const a = place(state.fighters[0], 240); // below the left balcony (y 470)
  tap(state, 0, { jump: true }, 70);
  assert.equal(a.y, 470);
});

test('the main ground is solid from the side and from below', () => {
  const state = fight({ stage: 'campus' });
  const a = state.fighters[0];
  Object.assign(a, { x: 60, y: 650, vx: 0, vy: 0, onGround: false });
  run(state, 3, { 0: { right: true } });
  a.y = 650;
  a.vy = 0;
  run(state, 1, { 0: { right: true } });
  assert.ok(a.x <= 120 - CONFIG.body.w / 2 + 0.001, `stopped at the wall, x=${a.x}`);
});

test('the fighter faces the last direction pressed and looks up only while Up is held', () => {
  const state = fight();
  const a = place(state.fighters[0], 400);
  tap(state, 0, { left: true }, 3);
  assert.equal(a.facing, -1);
  run(state, 2, { 0: { up: true } });
  assert.equal(a.aimUp, true);
  assert.equal(a.facing, -1, 'still remembers left');
  run(state, 2);
  assert.equal(a.aimUp, false);
  // both directions held: the newer press wins
  run(state, 1, { 0: { left: true } });
  run(state, 1, { 0: { left: true, right: true } });
  assert.equal(a.facing, 1);
});

// Attacker in the middle with three possible targets: left, right and above.
function aimSetup() {
  const state = fight({ stage: 'campus', fighters: ['finance_bro', 'house_dj', 'lisboa_og', 'surfer_girl'] });
  const [a, left, right, above] = state.fighters;
  place(a, 640);
  place(left, 580);
  place(right, 700);
  place(above, 640, 470); // standing on nothing, but it only has to be there for a few frames
  above.gravityScale = 0;
  return { state, a, left, right, above };
}
const hold = (state, slot, input, frames) => run(state, frames, (i) => {
  for (const f of state.fighters) if (f.slot !== slot && f.hitstun <= 0) Object.assign(f, { vy: 0, gravityScale: 0 });
  return { [slot]: i === 1 ? { ...input, attack: true } : input };
});

test('a normal attack goes right when the fighter looks right', () => {
  const { state, a, left, right, above } = aimSetup();
  a.facing = 1;
  hold(state, 0, {}, 12);
  assert.deepEqual([left.percent, right.percent, above.percent], [0, 8, 0]);
});

test('a normal attack goes left when the fighter looks left', () => {
  const { state, a, left, right, above } = aimSetup();
  a.facing = -1;
  hold(state, 0, {}, 12);
  assert.deepEqual([left.percent, right.percent, above.percent], [8, 0, 0]);
});

test('a normal attack goes up while Up is held', () => {
  const { state, a, left, right, above } = aimSetup();
  a.facing = 1;
  hold(state, 0, { up: true }, 12);
  assert.deepEqual([left.percent, right.percent, above.percent], [0, 0, 8]);
  assert.ok(above.vy < 0, 'launched upward');
});

test('the normal attack reaches 90 px and no further', () => {
  for (const [dx, expected] of [[100, 8], [130, 0]]) {
    const state = fight();
    const [a, b] = state.fighters;
    place(a, 400);
    place(b, 400 + dx); // body is 44 wide, so its near edge is at dx - 22
    a.facing = 1;
    tap(state, 0, { attack: true }, 12);
    assert.equal(b.percent, expected, `target at ${dx} px`);
  }
});

test('one swing hits the same opponent only once', () => {
  const state = fight({ fighters: ['finance_bro', 'bairro_chad'] });
  const [a, b] = state.fighters;
  place(a, 400);
  place(b, 440);
  a.facing = 1;
  b.percent = 0;
  const events = tap(state, 0, { attack: true }, 20);
  assert.equal(of(events, 'hit').length, 1);
});

test('a fighter cannot hit themselves and cannot attack again before the swing is over', () => {
  const state = fight();
  const [a, b] = state.fighters;
  place(a, 400);
  place(b, 900);
  const events = run(state, CONFIG.attack.total, (i) => ({ 0: { attack: i % 2 === 0 } }));
  assert.equal(of(events, 'attack').length, 1);
  assert.equal(a.percent, 0);
});
