// The four items: what each one does, and the limits (three at once, tart floor, sardine breaks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/game/config.js';
import { spawnItem, ITEM_TYPES } from '../../src/game/items.js';
import { fight, place, run, tap, of, feedbackFor } from '../helpers/game.js';

// A fighter standing at x=400 with the item right at their feet. Runs until it is picked up.
function withItem(type, { percent = 0, fighters } = {}) {
  const state = fight({ fighters });
  const [a, b] = state.fighters;
  place(a, 400);
  place(b, 1000);
  a.percent = percent;
  spawnItem(state, type, 400, 600);
  const events = run(state, 25);
  return { state, a, b, events };
}

test('Custard Tart heals 20 % on touch', () => {
  const { state, a, events } = withItem('tart', { percent: 50 });
  assert.equal(a.percent, 30);
  assert.equal(state.items.length, 0);
  assert.deepEqual(of(events, 'itemPickup').map((e) => [e.slot, e.item]), [[0, 'tart']]);
  assert.deepEqual(feedbackFor(events, 'good'), [0], 'only the player who took it is told');
});

test('Custard Tart never heals below 0 %', () => {
  assert.equal(withItem('tart', { percent: 12 }).a.percent, 0);
  assert.equal(withItem('tart', { percent: 0 }).a.percent, 0);
});

test('an item cannot be taken in the first moment after it appears', () => {
  const state = fight();
  place(state.fighters[0], 400).percent = 50;
  spawnItem(state, 'tart', 400, 600);
  run(state, 5);
  assert.equal(state.items.length, 1);
  assert.equal(state.fighters[0].percent, 50);
});

test('Espresso makes the fighter 30 % faster for 8 s', () => {
  const { state, a } = withItem('espresso');
  assert.ok(a.speedBoost > 0 && a.speedBoost <= 8 * 60);
  let max = 0;
  for (let i = 0; i < 60; i++) {
    run(state, 1, { 0: { right: true } });
    max = Math.max(max, a.vx);
  }
  assert.ok(Math.abs(max - a.runSpeed * 1.3) < 1e-9, `top speed ${max}`);
  run(state, 8 * 60);
  assert.equal(a.speedBoost, 0);
  place(a, 400);
  max = 0;
  for (let i = 0; i < 60; i++) {
    run(state, 1, { 0: { right: true } });
    max = Math.max(max, a.vx);
  }
  assert.ok(Math.abs(max - a.runSpeed) < 1e-9, 'back to normal speed');
});

test('Sardine: the next 5 normal attacks do 6 % with very high knockback, then it breaks', () => {
  const { state, a, b } = withItem('sardine', { fighters: ['finance_bro', 'bairro_chad'] });
  assert.deepEqual(a.held, { type: 'sardine', uses: 5 });
  const speeds = [];
  for (let swing = 1; swing <= 5; swing++) {
    place(a, 400);
    place(b, 460);
    a.facing = 1;
    b.percent = 0;
    b.hitstun = 0;
    const events = tap(state, 0, { attack: true }, CONFIG.attack.total + 2);
    assert.equal(b.percent, 6, `swing ${swing} does 6 %`);
    speeds.push(of(events, 'hit')[0].speed);
    if (swing < 5) assert.equal(a.held.uses, 5 - swing);
    else assert.equal(of(events, 'itemBreak').length, 1);
    if (swing < 5) assert.equal(of(events, 'itemBreak').length, 0);
  }
  assert.equal(a.held, null, 'broken after five swings');
  // A normal hit at the same damage is much weaker.
  place(a, 400);
  place(b, 460);
  b.percent = 0;
  b.hitstun = 0;
  const normal = of(tap(state, 0, { attack: true }, CONFIG.attack.total + 2), 'hit')[0];
  assert.equal(b.percent, 8, 'the sixth attack is a normal one again');
  assert.ok(speeds[0] > normal.speed * 1.8, `sardine ${speeds[0]} vs normal ${normal.speed}`);
});

test('Sardine: a swing that misses still uses it up', () => {
  const { state, a } = withItem('sardine');
  for (let i = 0; i < 5; i++) tap(state, 0, { attack: true }, CONFIG.attack.total + 2);
  assert.equal(a.held, null);
});

test('Book: the next normal attack throws it for 14 %', () => {
  const { state, a, b } = withItem('book');
  assert.equal(a.held.type, 'book');
  place(b, 700);
  a.facing = 1;
  const events = tap(state, 0, { attack: true }, 40);
  assert.equal(of(events, 'projectile')[0].kind, 'book');
  assert.equal(b.percent, 14);
  assert.equal(a.held, null);
  assert.equal(state.projectiles.length, 0, 'the book is gone after the hit');
  // The attack after that is a normal swing again.
  place(a, 400);
  place(b, 460);
  b.hitstun = 0;
  tap(state, 0, { attack: true }, 12);
  assert.equal(b.percent, 22);
});

test('Book: the throw has no close-range swing and misses out of reach', () => {
  const { state, a, b } = withItem('book');
  place(b, 400 + 13 * 46 + 120); // past the distance the book flies
  a.facing = 1;
  tap(state, 0, { attack: true }, 80);
  assert.equal(b.percent, 0);
  assert.equal(state.projectiles.length, 0);
});

test('with full hands a second sardine or book stays on the ground', () => {
  const { state, a } = withItem('sardine');
  spawnItem(state, 'book', 400, 600);
  run(state, 40);
  assert.equal(a.held.type, 'sardine');
  assert.deepEqual(state.items.map((i) => i.type), ['book']);
  // ... but a tart can still be eaten
  a.percent = 40;
  spawnItem(state, 'tart', 400, 600);
  run(state, 25);
  assert.equal(a.percent, 20);
});

test('a knocked-out fighter loses what they hold', () => {
  const { state, a } = withItem('sardine');
  a.x = -1000;
  run(state, 1);
  assert.equal(a.held, null);
  run(state, CONFIG.match.respawnFrames + 1);
  assert.equal(a.held, null);
});

test('never more than three items at once, and a new one only every 12 to 20 s', () => {
  const state = fight({ settings: { items: true } });
  // Park both fighters out of the way, in the air above the stage, so nothing gets picked up.
  const park = () => state.fighters.forEach((f, i) => Object.assign(f, { x: 600 + i * 80, y: 100, vx: 0, vy: 0, gravityScale: 0 }));
  const spawnFrames = [];
  const seen = new Set();
  for (let i = 0; i < 60 * 150; i++) {
    park();
    const events = run(state, 1);
    for (const e of of(events, 'itemSpawn')) {
      spawnFrames.push(state.frame);
      seen.add(e.item);
    }
    assert.ok(state.items.length <= 3, 'at most three items');
  }
  assert.ok(spawnFrames.length >= 6, `items did spawn (${spawnFrames.length})`);
  for (let i = 1; i < spawnFrames.length; i++) {
    const gap = spawnFrames[i] - spawnFrames[i - 1];
    assert.ok(gap >= 12 * 60, `gap of ${gap} frames is at least 12 s`);
  }
  for (const type of seen) assert.ok(ITEM_TYPES.includes(type));
});

test('spawnItem refuses a fourth item', () => {
  const state = fight();
  assert.ok(spawnItem(state, 'tart', 200, 600));
  assert.ok(spawnItem(state, 'book', 300, 600));
  assert.ok(spawnItem(state, 'sardine', 500, 600));
  assert.equal(spawnItem(state, 'espresso', 700, 600), null);
  assert.equal(state.items.length, 3);
});

test('with items switched off none appear', () => {
  const state = fight({ settings: { items: false } });
  const events = run(state, 60 * 60);
  assert.equal(of(events, 'itemSpawn').length, 0);
});

test('items spawn on a platform surface', () => {
  const state = fight({ stage: 'bairro', settings: { items: true }, seed: 11 });
  const ys = new Set(state.stage.platforms.map((p) => p.y));
  for (let i = 0; i < 60 * 80; i++) {
    for (const e of of(run(state, 1), 'itemSpawn')) {
      assert.ok(ys.has(e.y));
      const p = state.stage.platforms.find((pl) => pl.y === e.y && e.x >= pl.x && e.x <= pl.x + pl.w);
      assert.ok(p, `item at ${e.x},${e.y} is on a platform`);
    }
  }
});

test('Sardine: it is gone after the fifth swing even if that swing is interrupted', () => {
  const { state, a, b } = withItem('sardine', { fighters: ['finance_bro', 'bairro_chad'] });
  for (let i = 0; i < 4; i++) tap(state, 0, { attack: true }, CONFIG.attack.total + 2);
  assert.equal(a.held.uses, 1);
  // The fifth swing starts, and the opponent lands a hit before it comes out.
  place(a, 400);
  place(b, 440);
  b.facing = -1;
  tap(state, 1, { attack: true }, 3);
  tap(state, 0, { attack: true }, 1);
  run(state, 30);
  assert.ok(a.percent > 0, 'the swing was interrupted by a hit');
  assert.equal(a.held, null);
  place(a, 400);
  place(b, 460);
  a.facing = 1;
  a.hitstun = 0;
  b.percent = 0;
  tap(state, 0, { attack: true }, 12);
  assert.equal(b.percent, 8, 'the next attack is a normal one');
});
