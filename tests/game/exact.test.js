// Exact values. These tests use the literal numbers from docs/GAME_SPEC.md instead of
// reading them from the code, so changing a rule by accident makes a test fail.
// (Added after the independent test review: its mutation run showed which changes
// the first version of the suite did not notice.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/game/config.js';
import { STAGES } from '../../src/game/stages.js';
import { step, buildResult, phoneStatus } from '../../src/game/match.js';
import { beginWarning, WARN_FRAMES } from '../../src/game/hazards.js';
import { spawnItem } from '../../src/game/items.js';
import { InputBuffer, BIT } from '../../src/game/input.js';
import { createClock, advance, freeze } from '../../src/game/clock.js';
import { createLoop } from '../../src/game/loop.js';
import { fight, place, run, tap, of, feedbackFor, launchOut } from '../helpers/game.js';
import { botInputs } from '../helpers/bot.js';

// Run until an event of this type shows up; returns it (the state is then on that very frame).
function until(state, type, inputs = {}, max = 400) {
  for (let i = 0; i < max; i++) {
    const hit = (typeof inputs === 'function' ? step(state, inputs(i)) : step(state, i === 0 ? inputs : {})).find((e) => e.type === type);
    if (hit) return hit;
  }
  throw new Error(`no ${type} event within ${max} frames`);
}
const still = (f) => { f.gravityScale = 0; f.vx = 0; f.vy = 0; };

// ---- knockback, hitstun, KO ----

test('launch speed in numbers: 4.72 at 8 %, lighter flies faster, heavier slower', () => {
  const speedFor = (fighter, percent) => {
    const state = fight({ fighters: ['finance_bro', fighter] });
    const [a, b] = state.fighters;
    place(a, 500).facing = 1;
    place(b, 560).percent = percent;
    return until(state, 'hit', { 0: { attack: true } }).speed;
  };
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);
  near(speedFor('house_dj', 0), 4.72); // (4 + 9 * 8/100) * 100/100
  near(speedFor('house_dj', 92), 13); // (4 + 9 * 100/100)
  near(speedFor('surfer_girl', 50), (4 + 9 * 0.58) * (100 / 85)); // weight 85
  near(speedFor('bairro_chad', 50), 7.6833333333333333); // weight 120
  near(speedFor('lisboa_og', 50), (4 + 9 * 0.58) * (100 / 115));
});

test('hitstun is exactly round(speed x 2.5) on the frame of the hit', () => {
  for (const [percent, frames] of [[0, 12], [60, 25], [92, 33], [150, 46]]) {
    const state = fight();
    const [a, b] = state.fighters;
    place(a, 500).facing = 1;
    place(b, 560).percent = percent;
    until(state, 'hit', { 0: { attack: true } });
    assert.equal(b.hitstun, frames, `${percent} %`);
  }
});

test('in hitstun, and during the own special, an attack press does nothing', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 500).facing = 1;
  place(b, 560).percent = 100;
  until(state, 'hit', { 0: { attack: true } });
  const pressed = run(state, 12, (i) => ({ 1: { attack: i % 2 === 0, special: i % 2 === 1, jump: i % 3 === 0 } }));
  assert.deepEqual(pressed.filter((e) => e.slot === 1 && ['attack', 'special', 'jump'].includes(e.type)), []);
  // While the own special is running, attack does not start.
  const s2 = fight({ fighters: ['finance_bro', 'house_dj'] });
  place(s2.fighters[0], 300);
  place(s2.fighters[1], 1000);
  const events = run(s2, 20, (i) => ({ 0: { special: i === 0, attack: i > 2 && i % 2 === 0 } }));
  assert.equal(of(events, 'special').length, 1);
  assert.equal(of(events, 'attack').length, 0);
});

for (const [side, inside, outside] of [
  ['left', { x: -170, y: 300 }, { x: -171, y: 300 }],
  ['right', { x: 1450, y: 300 }, { x: 1451, y: 300 }],
  ['top', { x: 640, y: -182 }, { x: 640, y: -183 }], // the middle of the body crosses y = -230
  ['bottom', { x: 640, y: 996 }, { x: 640, y: 997 }], // the head crosses y = 900
]) {
  test(`${side} blast zone: one pixel inside is safe, one pixel outside is a KO`, () => {
    for (const [pos, kos] of [[inside, 0], [outside, 1]]) {
      const state = fight();
      const b = state.fighters[1];
      Object.assign(b, { ...pos, onGround: false });
      still(b);
      assert.equal(of(step(state, {}), 'ko').length, kos, JSON.stringify(pos));
    }
  });
}

test('a real launch: at 190 % near the edge a hit sends the fighter out and the attacker gets the KO', () => {
  const state = fight({ settings: { lives: 2 } });
  const [a, b] = state.fighters;
  place(a, 1040).facing = 1;
  place(b, 1100).percent = 190;
  const ko = until(state, 'ko', { 0: { attack: true } });
  assert.equal(ko.kind, 'launched');
  assert.equal(ko.by, 0);
  assert.equal(ko.slot, 1);
  assert.equal(ko.livesLeft, 1);
  assert.equal(ko.eliminated, false);
  assert.equal(a.stats.kos, 1);
  assert.equal(phoneStatus(state, 1).state, 'dead');
  assert.equal(phoneStatus(state, 1).lives, 1);
});

test('KO credit lasts 8 seconds after the last hit, not longer', () => {
  for (const [wait, by] of [[470, 0], [485, null]]) {
    const state = fight();
    const [a, b] = state.fighters;
    place(a, 500).facing = 1;
    place(b, 560);
    until(state, 'hit', { 0: { attack: true } });
    for (let i = 0; i < wait; i++) { place(b, 560); run(state, 1); }
    const ko = of(launchOut(state, b), 'ko')[0];
    assert.equal(ko.by, by, `${wait} frames after the hit`);
    assert.equal(a.stats.kos, by === null ? 0 : 1);
  }
});

test('respawn: exactly 120 frames away, at x 640, then exactly 120 frames of invincibility', () => {
  const state = fight();
  const [a, b] = state.fighters;
  launchOut(state, b);
  run(state, 119);
  assert.equal(b.state, 'dead');
  run(state, 1);
  assert.equal(b.state, 'alive');
  assert.equal(b.x, 640);
  assert.equal(b.y, 60);
  assert.equal(b.invincible, 120);
  // A swing that connects on the 119th frame after the respawn does nothing; on the 120th it counts.
  for (const [frames, percent] of [[118, 0], [119, 8]]) {
    const s = fight();
    const [p, q] = s.fighters;
    launchOut(s, q);
    run(s, 120);
    run(s, frames);
    place(q, 560);
    place(p, 500).facing = 1;
    // A swing that is one frame away from connecting.
    p.attack = { t: CONFIG.attack.startup - 1, dir: 'side', facing: 1, kind: 'normal', hit: [] };
    step(s, {});
    assert.equal(q.percent, percent, `${frames + 1} frames after the respawn`);
  }
  assert.ok(a);
});

test('after a respawn there is exactly one jump in the air, and being hit does not give it back', () => {
  const state = fight();
  const [a, b] = state.fighters;
  launchOut(state, b);
  run(state, 122);
  assert.deepEqual(of(tap(state, 1, { jump: true }, 3), 'jump').map((e) => e.double), [true]);
  assert.equal(of(tap(state, 1, { jump: true }, 3), 'jump').length, 0);
  // Hit in the air after the double jump is used: no new jump.
  b.invincible = 0;
  place(a, 500).facing = 1;
  Object.assign(b, { x: 560, y: 560, vx: 0, vy: 0, onGround: false, jumpsLeft: 0 });
  until(state, 'hit', (i) => { if (b.hitstun <= 0) { still(b); Object.assign(b, { x: 560, y: 560 }); } return { 0: { attack: i === 0 } }; });
  assert.equal(b.jumpsLeft, 0);
  const startY = b.y;
  assert.ok(startY);
  let jumped = 0;
  for (let i = 0; i < 60 && !b.onGround; i++) jumped += of(run(state, 1, { 1: { jump: i % 2 === 0 } }), 'jump').length;
  assert.equal(jumped, 0);
});

test('the double jump really gains height', () => {
  const state = fight();
  const a = place(state.fighters[0], 640);
  tap(state, 0, { jump: true }, 22);
  const before = a.y;
  tap(state, 0, { jump: true }, 1);
  let top = a.y;
  for (let i = 0; i < 40; i++) { run(state, 1); top = Math.min(top, a.y); }
  assert.ok(before - top > 100, `rose another ${before - top} px`);
});

test('during the final KO the winner takes no damage from attacks, hazards or items', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj', 'surfer_girl'], settings: { lives: 1 } });
  const [w, x, y] = state.fighters;
  launchOut(state, y);
  place(w, 560);
  place(x, 500).facing = 1;
  // x starts a swing, then is thrown out: the swing would land during the final KO.
  run(state, 2, { 1: { attack: true } });
  const ghost = { ...x };
  x.x = -1000;
  step(state, {});
  assert.equal(state.phase, 'finalKo');
  assert.ok(ghost);
  w.percent = 199;
  place(x, 500);
  for (let i = 0; i < 20; i++) step(state, { 0: {}, 1: { attack: true } });
  assert.equal(w.percent, 199);
  assert.equal(w.lives, 1);
});

test('the dead and the eliminated take no part: no input, no hits on them, no pickups', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj', 'surfer_girl'], settings: { lives: 2 } });
  const [a, dead, out] = state.fighters;
  launchOut(state, out);
  run(state, 122);
  launchOut(state, out); // eliminated
  launchOut(state, dead); // waiting to respawn
  assert.deepEqual([dead.state, out.state], ['dead', 'out']);
  for (const ghost of [dead, out]) Object.assign(ghost, { x: 560, y: 600 });
  place(a, 500).facing = 1;
  spawnItem(state, 'nata', 560, 600).age = 50;
  const events = run(state, 40, (i) => ({ 0: { attack: i === 0 }, 1: { attack: true, jump: true, right: true, special: true }, 2: { attack: true, jump: true, right: true, special: true } }));
  assert.deepEqual(events.filter((e) => e.slot === 1 || e.slot === 2), []);
  assert.equal(of(events, 'hit').length, 0);
  assert.equal(state.items.length, 1, 'the pastel de nata is still there');
  assert.equal(a.stats.damageDealt, 0);
  assert.equal(phoneStatus(state, 2).state, 'out');
});

// ---- reach of every attack: 10 px inside and 10 px outside ----

function reachCase(fighter, dx, { input = {}, button = 'special', y = 600, casterX = 400, frames = 130 } = {}) {
  const state = fight({ fighters: [fighter, 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, casterX).facing = dx < 0 ? -1 : 1;
  place(b, casterX + dx, y);
  run(state, frames, (i) => ({ 0: i === 1 ? { ...input, [button]: true } : input }));
  return b.percent;
}
for (const [name, fighter, inside, outside, damage, opts] of [
  ['normal attack (90 px from the body centre)', 'finance_bro', 108, 116, 8, { button: 'attack', frames: 12 }],
  ['Cash Rain (220 px)', 'finance_bro', 214, 226, 6, {}],
  ["Round's On Me (200 px)", 'bairro_chad', 194, 206, 4, {}],
  ['Ring Light Flash (320 px)', 'wannabe_influencer', 314, 326, 5, {}],
  ['Bass Drop (180 px)', 'house_dj', 174, 186, 12, {}],
  ['Padel Smash (510 px flight)', 'maastricht_blondie', 540, 560, 18, {}],
  ['Ding-Ding (600 px roll)', 'lisboa_og', 680, 700, 12, { casterX: 150 }],
  ['Spaghetti Lasso (380 px)', 'carcavelos_gang_member', 395, 410, 6, {}],
]) {
  test(`reach of ${name}: hits just inside, misses just outside`, () => {
    const foe = fighter === 'house_dj' ? 'finance_bro' : 'house_dj';
    const run1 = (dx) => {
      const state = fight({ fighters: [fighter, foe] });
      const [a, b] = state.fighters;
      const x = opts.casterX ?? 400;
      place(a, x).facing = 1;
      place(b, x + dx);
      run(state, opts.frames ?? 130, (i) => ({ 0: i === 1 ? { [opts.button ?? 'special']: true } : {} }));
      return b.percent;
    };
    assert.equal(run1(inside), damage, `${inside} px`);
    assert.equal(run1(outside), 0, `${outside} px`);
  });
}

test('a radius counts up to and including its edge', () => {
  assert.equal(reachCase('finance_bro', 220), 6);
  assert.equal(reachCase('finance_bro', 221), 0);
});

// ---- aiming left and up, for everything that has a direction ----

test('Padel Smash, Wave Rider, Spaghetti Lasso and the thrown book go left when the fighter looks left', () => {
  assert.equal(reachCase('maastricht_blondie', -300, { casterX: 800 }), 18);
  assert.equal(reachCase('maastricht_blondie', 300, { casterX: 800, input: { left: true }, frames: 60 }), 0, 'looking left misses the opponent on the right');
  assert.equal(reachCase('surfer_girl', -200, { casterX: 800, frames: 40 }), 10);
  assert.equal(reachCase('carcavelos_gang_member', -300, { casterX: 800, frames: 30 }), 6);
  // Wave Rider really travels left.
  const state = fight({ fighters: ['surfer_girl', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 800).facing = -1;
  place(b, 100);
  tap(state, 0, { special: true }, 40);
  assert.ok(Math.abs(a.x - (800 - 360)) < 12, `surfed to ${a.x}`);
  // The lasso pulls to the left side of the caster.
  const s2 = fight({ fighters: ['carcavelos_gang_member', 'house_dj'] });
  const [c, t] = s2.fighters;
  place(c, 800).facing = -1;
  place(t, 500);
  tap(s2, 0, { special: true }, 22);
  assert.ok(Math.abs(t.x - (800 - 56)) < 2, `pulled to ${t.x}`);
  // The book.
  for (const [dx, facing, expected] of [[-300, -1, 14], [300, -1, 0]]) {
    const s3 = fight();
    const [p, q] = s3.fighters;
    place(p, 700).facing = facing;
    place(q, 700 + dx);
    p.held = { type: 'book', uses: 1 };
    tap(s3, 0, { attack: true }, 40);
    assert.equal(q.percent, expected);
  }
});

test('aimed up: the book flies up, the lasso lifts its target above the caster, the wave carries its target up', () => {
  const s1 = fight({ stage: 'campus' });
  const [p, q] = s1.fighters;
  place(p, 640);
  place(q, 640, 336);
  p.held = { type: 'book', uses: 1 };
  run(s1, 40, (i) => ({ 0: { up: true, attack: i === 1 } }));
  assert.equal(q.percent, 14);

  const s2 = fight({ stage: 'campus', fighters: ['carcavelos_gang_member', 'house_dj'] });
  const [c, t] = s2.fighters;
  place(c, 640);
  place(t, 640, 336);
  run(s2, 19, (i) => ({ 0: { up: true, special: i === 1 } }));
  assert.equal(t.percent, 6);
  assert.ok(Math.abs(t.x - 640) < 2 && t.y < 600 - 96 + 12 && t.y > 440, `lifted to just above the caster (${t.x}, ${t.y})`);

  const s3 = fight({ stage: 'beach', fighters: ['surfer_girl', 'house_dj'] });
  const [s, o] = s3.fighters;
  place(s, 200);
  place(o, 200, 470);
  run(s3, 26, (i) => ({ 0: { up: true, special: i === 1 } }));
  assert.equal(o.percent, 10);
  assert.ok(o.y < 470 - 100, `carried up to y ${o.y}`);

  // The padel ball starts straight above the fighter, not off to the side.
  const s4 = fight({ fighters: ['maastricht_blondie', 'house_dj'] });
  place(s4.fighters[0], 400);
  place(s4.fighters[1], 1000);
  const shot = until(s4, 'projectile', (i) => ({ 0: { up: true, special: i === 1 } }));
  assert.equal(shot.x, 400);
});

test('the lasso takes the nearest opponent even when a farther one comes first in the player list', () => {
  const state = fight({ fighters: ['carcavelos_gang_member', 'house_dj', 'finance_bro'] });
  const [c, far, near] = state.fighters;
  place(c, 300).facing = 1;
  place(far, 620);
  place(near, 480);
  tap(state, 0, { special: true }, 22);
  assert.deepEqual([far.percent, near.percent], [0, 6]);
});

test('Ring Light Flash with two opponents at the same distance blinds the one with the lower player number', () => {
  const state = fight({ fighters: ['wannabe_influencer', 'house_dj', 'finance_bro'] });
  const [c, left, right] = state.fighters;
  place(c, 600);
  place(left, 500);
  place(right, 700);
  tap(state, 0, { special: true }, 12);
  assert.deepEqual([left.percent, right.percent], [5, 0]);
});

test('a tram tossed up comes down again and then rolls along the ground', () => {
  const state = fight({ stage: 'beach', fighters: ['lisboa_og', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 450).facing = 1;
  place(b, 580); // nobody above, the target stands beside on the sand
  run(state, 120, (i) => ({ 0: { up: i < 14, special: i === 1 } }));
  assert.equal(b.percent, 12);
});

// ---- how long effects last, in frames ----

test('effect lengths: slip 90, tipsy 240, blinded 60, lasso stun 24, bifana 600, lucky rooster 300 frames', () => {
  const just = (value, frames) => assert.ok(value === frames || value === frames - 1, `${value} vs ${frames}`);
  const cast = (fighter, dx) => {
    const state = fight({ fighters: [fighter, 'house_dj'] });
    place(state.fighters[0], 400).facing = 1;
    place(state.fighters[1], 400 + dx);
    until(state, 'feedback', (i) => ({ 0: { special: i === 1 } }));
    return state.fighters[1];
  };
  just(cast('finance_bro', 150).slip, 90);
  just(cast('bairro_chad', 150).tipsy, 240);
  just(cast('wannabe_influencer', 150).stun, 60);
  just(cast('carcavelos_gang_member', 300).stun, 24);
  for (const [type, key, frames] of [['bifana', 'bifana', 600], ['rooster', 'rooster', 300]]) {
    const state = fight();
    const a = place(state.fighters[0], 400);
    spawnItem(state, type, 400, 600);
    until(state, 'itemPickup');
    just(a[key], frames);
    run(state, frames - 2);
    assert.ok(a[key] > 0, type);
    run(state, 2);
    assert.equal(a[key], 0, type);
  }
});

test('slipping ends after 1.5 s and the fighter has full grip again', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 400);
  place(b, 550);
  until(state, 'feedback', (i) => ({ 0: { special: i === 1 } }));
  run(state, 80);
  assert.ok(b.slip > 0, 'still slipping after 80 frames');
  run(state, 12);
  assert.equal(b.slip, 0);
  place(b, 700);
  run(state, 12, { 1: { right: true } });
  assert.equal(b.vx, b.runSpeed);
});

// ---- phone feedback: what exactly is sent, and to whom ----

test('each special sends its own message, colour and vibration to the fighter it hit', () => {
  const expected = {
    finance_bro: ['cash_rain', 'You slipped on cash!', '#3fbf6f'],
    maastricht_blondie: ['padel_smash', 'Smashed!', '#e63946'],
    bairro_chad: ['rounds_on_me', "You're drunk! Drink water!", '#f0a81e'],
    surfer_girl: ['wave_rider', 'Wipeout!', '#3fd0e0'],
    wannabe_influencer: ['ring_light_flash', 'Blinded! No filter can save you.', '#ffffff'],
    house_dj: ['bass_drop', 'BASS DROP!', '#ff7a3d'],
    lisboa_og: ['ding_ding', 'Run over by the 28!', '#f6c343'],
    carcavelos_gang_member: ['spaghetti_lasso', 'Caught in the pasta!', '#f6c343'],
  };
  for (const [fighter, [id, text, flash]] of Object.entries(expected)) {
    const state = fight({ fighters: [fighter, fighter === 'house_dj' ? 'finance_bro' : 'house_dj'] });
    place(state.fighters[0], 400).facing = 1;
    place(state.fighters[1], 520);
    const events = run(state, 80, (i) => ({ 0: { special: i === 1 } }));
    const sent = of(events, 'feedback').filter((e) => e.kind === 'special');
    assert.equal(sent.length, 1, fighter);
    assert.deepEqual({ slot: sent[0].slot, special: sent[0].special, text: sent[0].text, flash: sent[0].flash, vibrate: sent[0].vibrate }, { slot: 1, special: id, text, flash, vibrate: [60, 40, 140] });
    const started = of(events, 'special')[0];
    assert.deepEqual([started.slot, started.special, started.dir, started.facing], [0, id, 'side', 1]);
  }
});

test('hit, KO and elimination feedback go to the right phone with the right words', () => {
  const state = fight({ settings: { lives: 2 } });
  const [a, b] = state.fighters;
  place(a, 500).facing = 1;
  place(b, 560);
  const hit = run(state, 12, (i) => ({ 0: { attack: i === 0 } }));
  assert.deepEqual(of(hit, 'feedback').map((e) => [e.slot, e.kind, e.vibrate]), [[1, 'hit', [35]]]);
  const hitEvent = of(hit, 'hit')[0];
  assert.deepEqual([hitEvent.slot, hitEvent.by, hitEvent.percent, hitEvent.damage, hitEvent.kind], [1, 0, 8, 8, 'normal']);
  assert.deepEqual([of(hit, 'attack')[0].dir, of(hit, 'attack')[0].facing], ['side', 1]);

  const first = launchOut(state, b);
  const ko = of(first, 'feedback').find((e) => e.kind === 'ko');
  assert.equal(ko.slot, 1);
  assert.match(ko.text, /Last life!$/);
  assert.deepEqual(ko.vibrate, [200, 80, 200, 80, 400]);
  assert.deepEqual(of(first, 'feedback').filter((e) => e.kind === 'good').map((e) => [e.slot, e.text]), [[0, 'Nice hit!']]);
  assert.deepEqual([of(first, 'ko')[0].livesLeft, of(first, 'ko')[0].eliminated], [1, false]);

  run(state, 122);
  const second = launchOut(state, b);
  const out = of(second, 'feedback').find((e) => e.kind === 'out');
  assert.equal(out.slot, 1);
  assert.equal(out.text, "You're out! Grab a coffee and watch.");
  assert.deepEqual(out.vibrate, [300, 100, 300, 100, 900]);
  assert.deepEqual([of(second, 'ko')[0].livesLeft, of(second, 'ko')[0].eliminated], [0, true]);

  const three = fight({ settings: { lives: 3 } });
  assert.match(of(launchOut(three, three.fighters[0]), 'feedback').find((e) => e.kind === 'ko').text, /2 lives left\.$/);
});

test('a thrown book tells the player it hit', () => {
  const state = fight();
  const [a, b] = state.fighters;
  place(a, 400).facing = 1;
  place(b, 700);
  a.held = { type: 'book', uses: 1 };
  assert.deepEqual(feedbackFor(tap(state, 0, { attack: true }, 40), 'hit'), [1]);
});

// ---- items ----

test('item details: a pastel de nata is eaten even at 0 %, a bifana works with full hands, a KO ends it', () => {
  const state = fight();
  const a = place(state.fighters[0], 400);
  a.held = { type: 'sardine', uses: 5 };
  spawnItem(state, 'nata', 400, 600);
  spawnItem(state, 'bifana', 400, 600);
  run(state, 25);
  assert.equal(state.items.length, 0);
  assert.ok(a.bifana > 0);
  launchOut(state, a);
  assert.equal(a.bifana, 0);
  run(state, 122);
  assert.equal(a.bifana, 0);
});

test('an item nobody takes disappears after 25 seconds', () => {
  const state = fight();
  state.fighters.forEach((f, i) => place(f, 900 + i * 80));
  spawnItem(state, 'book', 300, 600);
  run(state, 25 * 60);
  assert.equal(state.items.length, 1);
  run(state, 1);
  assert.equal(state.items.length, 0);
});

test('items: the limit of four really holds, new ones come every 6 to 10 s, all nine kinds appear', () => {
  const lifetime = CONFIG.items.lifetime;
  CONFIG.items.lifetime = 1e9; // items never expire here, so only the limit can stop a fourth one
  try {
    const state = fight({ stage: 'bairro', settings: { items: true }, seed: 3 });
    const frames = [];
    const idle = (n) => {
      for (let i = 0; i < n; i++) {
        state.fighters.forEach((f, k) => Object.assign(f, { x: 600 + k * 80, y: 80, vx: 0, vy: 0, gravityScale: 0 }));
        if (of(run(state, 1), 'itemSpawn').length) frames.push(state.frame);
        assert.ok(state.items.length <= 4);
      }
    };
    idle(60 * 90); // time for nine or more spawns if nothing stopped them
    assert.equal(frames.length, 4, 'only four items came');
    assert.equal(state.items.length, 4);
    for (let i = 1; i < frames.length; i++) {
      const gap = frames[i] - frames[i - 1];
      assert.ok(gap >= 360 && gap <= 600, `gap ${gap} frames is between 6 and 10 s`);
    }
    state.items.shift(); // somebody takes one ...
    idle(60 * 11);
    assert.equal(frames.length, 5, '... and within 10 s the next one appears');
    assert.equal(state.items.length, 4);
  } finally {
    CONFIG.items.lifetime = lifetime;
  }
  const state = fight({ settings: { items: true }, seed: 12 });
  const kinds = new Set();
  for (let i = 0; i < 60 * 600; i++) {
    state.fighters.forEach((f, k) => Object.assign(f, { x: 600 + k * 80, y: 80, vx: 0, vy: 0, gravityScale: 0 }));
    for (const e of of(run(state, 1), 'itemSpawn')) kinds.add(e.item);
  }
  assert.deepEqual([...kinds].sort(), ['azulejo', 'bifana', 'book', 'cork', 'megaphone', 'nata', 'project', 'rooster', 'sardine']);
});

// ---- hazards ----

const pin = (state, spots, frames) => {
  const events = [];
  for (let i = 0; i < frames; i++) {
    spots.forEach(([f, x, y]) => { if (f.hitstun <= 0 && f.state === 'alive') place(f, x, y); });
    events.push(...run(state, 1));
  }
  return events;
};

test('hazard lengths: Bad Wi-Fi is active for exactly 360 frames, the drinks stay for exactly 480', () => {
  for (const [stage, id, frames] of [['campus', 'wifi', 360], ['bairro', 'drinks', 480]]) {
    const state = fight({ stage, settings: { hazards: true } });
    state.fighters.forEach((f) => { f.invincible = 1e6; });
    beginWarning(state, { id, zone: 'roof', platform: 0 });
    let start = null;
    let end = null;
    for (let i = 0; i < 1200 && end === null; i++) {
      state.fighters.forEach((f, k) => Object.assign(f, { x: 500 + k * 100, y: -40, vy: 0, gravityScale: 0 }));
      for (const e of run(state, 1)) {
        if (e.type === 'hazardStart') start = state.frame;
        if (e.type === 'hazardEnd') end = state.frame;
      }
    }
    assert.equal(end - start, frames, id);
  }
});

test('no hazard does anything while it is only being announced', () => {
  const cases = [
    ['campus', { id: 'wifi', zone: 'ground' }, 600],
    ['beach', { id: 'gulls', zone: 'sand', dir: 1 }, 600],
    ['bairro', { id: 'crowd', dir: 1 }, 600],
    ['bairro', { id: 'drinks', platform: 0 }, 600],
    ['beach', { id: 'wave', dir: 1 }, 600],
  ];
  for (const [stage, forced, y] of cases) {
    const state = fight({ stage, settings: { hazards: true } });
    const [a, b] = state.fighters;
    a.held = { type: 'sardine', uses: 5 };
    place(a, 380, y);
    place(b, 900, y);
    beginWarning(state, forced);
    const events = [];
    let jumpAt = null;
    for (let i = 0; i < WARN_FRAMES - 1; i++) {
      if (a.onGround) place(a, 380, y);
      for (const e of run(state, 1, { 0: { jump: i === 100 } })) {
        events.push(e);
        if (e.type === 'jump') jumpAt = i;
      }
    }
    assert.equal(jumpAt, 100, `${forced.id}: no input lag during the warning`);
    assert.equal(a.percent + b.percent, 0, forced.id);
    assert.equal(a.tipsy, 0);
    assert.deepEqual(a.held, { type: 'sardine', uses: 5 });
    assert.equal(of(events, 'feedback').length, 0, forced.id);
    assert.equal(state.hazard.phase, 'warn');
  }
});

test('train, wave and crowd come from the left and from the right', () => {
  for (const [stage, id, seedFor] of [['campus', 'train', (dir) => (dir > 0 ? 2 : 2)], ['beach', 'wave', () => 2], ['bairro', 'crowd', () => 2]]) {
    for (const dir of [1, -1]) {
      let moved = null;
      for (let seed = seedFor(dir); seed < 40 && moved === null; seed++) {
        const state = fight({ stage, settings: { hazards: true }, seed });
        const [a, b] = state.fighters;
        beginWarning(state, { id, dir });
        const warn = pin(state, [[a, 640, 600], [b, 640, 336]], WARN_FRAMES);
        if (of(warn, 'hazardCancel').length) continue; // a strike: try the next seed
        const xs = [];
        let hitAt = null;
        let pushed = 0;
        for (let i = 0; i < 330; i++) {
          place(b, 640, 336);
          if (of(run(state, 1), 'hit').some((e) => e.slot === a.slot)) hitAt = i;
          if (hitAt !== null && i === hitAt + 15) pushed = Math.sign(a.x - 640);
          if (state.hazard.phase === 'active') xs.push(state.hazard.pos);
        }
        assert.ok(hitAt !== null, `${id} from ${dir > 0 ? 'the left' : 'the right'} reaches the middle`);
        assert.equal(pushed, dir, `${id}: pushed in its direction`);
        assert.equal(Math.sign(xs[xs.length - 1] - xs[0]), dir);
        assert.equal(state.hazard.phase, 'idle', 'and leaves again');
        moved = true;
      }
      assert.equal(moved, true);
    }
  }
});

test('the train does 20 %, comes with the name CASCAIS LINE TRAIN, and nobody gets the KO credit', () => {
  for (let seed = 1; seed < 40; seed++) {
    const state = fight({ stage: 'campus', settings: { hazards: true, lives: 1 }, seed });
    const [a, b] = state.fighters;
    beginWarning(state, { id: 'train', dir: 1 });
    assert.equal(state.events.find((e) => e.type === 'hazardWarn').name, 'CASCAIS LINE TRAIN');
    a.percent = 185;
    const events = pin(state, [[a, 640, 600], [b, 640, 336]], WARN_FRAMES + 120);
    if (of(events, 'hazardCancel').length) continue;
    const hit = of(events, 'hit')[0];
    assert.deepEqual([hit.slot, hit.by, hit.damage, hit.kind, hit.source], [0, null, 20, 'hazard', 'train']);
    const ko = of(events, 'ko')[0];
    assert.deepEqual([ko.kind, ko.by], ['burnout', null], 'a hazard hit past 200 % is a burnout that nobody is credited for');
    assert.equal(b.stats.kos, 0);
    return;
  }
  assert.fail('no train came');
});

test('the strike: exactly 55 of the first 200 seeds (about one in four)', () => {
  let strikes = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const state = fight({ stage: 'campus', settings: { hazards: true }, seed });
    beginWarning(state, { id: 'train' });
    for (let i = 0; i < WARN_FRAMES; i++) {
      state.fighters.forEach((f, k) => Object.assign(f, { x: 600 + k * 90, y: 100, vy: 0, gravityScale: 0 }));
      if (of(run(state, 1), 'hazardCancel').length) strikes += 1;
    }
  }
  assert.equal(strikes, 55);
});

test('seagulls over the sand leave an item on a roof alone even when it is the first one they pass', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  state.fighters.forEach((f) => { f.invincible = 1e6; });
  state.items.push({ id: 801, type: 'nata', x: 200, y: 470, age: 100 }); // on the surf bar roof, first in the flight path
  state.items.push({ id: 802, type: 'nata', x: 700, y: 600, age: 100 }); // on the sand
  beginWarning(state, { id: 'gulls', zone: 'sand', dir: 1 });
  CONFIG.items.lifetime += 1e6;
  try {
    pin(state, [], WARN_FRAMES + 130);
  } finally {
    CONFIG.items.lifetime -= 1e6;
  }
  assert.deepEqual(state.items.map((i) => i.id), [801]);
});

test('a seagull peck stuns for 14 frames; the crowd only takes fighters at street level', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [a, b] = state.fighters;
  beginWarning(state, { id: 'gulls', zone: 'sand', dir: 1 });
  place(b, 900, 350);
  let stun = 0;
  for (let i = 0; i < WARN_FRAMES + 130; i++) {
    place(a, 400, 600);
    place(b, 900, 350);
    const got = of(run(state, 1), 'hit').length;
    if (got) stun = a.stun;
  }
  assert.ok(stun === 14 || stun === 13, `stun ${stun}`);

  // The crowd: a fighter in the air above the street (feet at y 500, in the crowd's box) is left alone.
  const s2 = fight({ stage: 'bairro', settings: { hazards: true } });
  const [c, d] = s2.fighters;
  beginWarning(s2, { id: 'crowd', dir: 1 });
  pin(s2, [[c, 640, 600], [d, 900, 336]], WARN_FRAMES);
  for (let i = 0; i < 200; i++) {
    Object.assign(d, { x: 640, y: 505, vx: 0, vy: 0, gravityScale: 0, onGround: false });
    run(s2, 1);
  }
  assert.equal(d.percent, 0, 'hovering just above street level: not in the crowd');
  assert.equal(d.x, 640);
  assert.ok(c.percent > 0, 'the fighter on the street was caught');
});

// ---- input and clock ----

test('two jump presses that arrive in one bunch become a jump and a double jump in the game', () => {
  const state = fight();
  place(state.fighters[0], 400);
  const buffer = new InputBuffer();
  for (const [mask, seq] of [[BIT.jump, 1], [0, 2], [BIT.jump, 3], [0, 4]]) buffer.receive(mask, seq);
  const events = [];
  for (let i = 0; i < 4; i++) events.push(...step(state, { 0: buffer.consume() }));
  assert.deepEqual(of(events, 'jump').map((e) => e.double), [false, true]);
});

test('the clock in numbers: quarter speed is exactly 30 steps in 121 frames, the longer freeze wins', () => {
  const clock = createClock();
  clock.scale = 0.25;
  let steps = 0;
  for (let i = 0; i < 121; i++) steps += advance(clock, 1000 / 60);
  assert.equal(steps, 30);
  const c2 = createClock();
  freeze(c2, 100);
  freeze(c2, 20);
  assert.equal(c2.freezeMs, 100);
  assert.equal(advance(c2, 90), 0);
  assert.equal(advance(c2, 27), 1);
});

// ---- the real loop of the host page, with and without its time effects ----

function playWithLoop(seed, effects) {
  const stage = ['campus', 'beach', 'bairro'][seed % 3];
  const state = fight({ stage, fighters: ['finance_bro', 'surfer_girl', 'house_dj'], settings: { items: true, hazards: true, lives: 3, hazardMinS: 6, hazardMaxS: 9 }, seed });
  const log = [];
  const loop = createLoop({ state, getInputs: botInputs, effects, onEvent: (e) => { if (['hit', 'ko', 'itemPickup', 'hazardStart', 'finalKo'].includes(e.type)) log.push(`${state.frame}:${e.type}:${e.slot ?? ''}:${e.kind ?? e.item ?? e.hazard ?? ''}`); } });
  let guard = 0;
  let frozenTicks = 0;
  while (state.phase !== 'ended' && guard++ < 60 * 60 * 20) {
    const dt = effects ? 1000 / 60 + ((guard * 7) % 5) - 2 : 16.7; // an uneven frame rate
    if (loop.tick(dt) === 0) frozenTicks += 1;
  }
  return { result: buildResult(state), log, phase: state.phase, steps: loop.steps, slowMs: loop.slowMs, frozenTicks };
}

test('the host loop: slow motion and hit pause change the timing but not one event of the match', () => {
  const winners = new Set();
  // Seeds whose bot match includes a hazard hit and an item pickup, so both are compared.
  // (Picked again whenever a rule change alters what the bots' matches look like: seed 3
  // lost its hazard hit with the ledge grab, D-138, and seed 12 with the new items, D-140;
  // seed 15 is the campus match now.)
  for (const seed of [1, 15, 7, 10]) {
    const plain = playWithLoop(seed, false);
    const fancy = playWithLoop(seed, true);
    assert.equal(plain.phase, 'ended', `seed ${seed}`);
    assert.deepEqual(fancy.result, plain.result, `seed ${seed}: same result`);
    assert.deepEqual(fancy.log, plain.log, `seed ${seed}: the same events on the same frames`);
    assert.equal(fancy.steps, plain.steps);
    assert.ok(plain.log.some((l) => l.includes(':hit:') && l.endsWith(':hazard')), `seed ${seed}: a hazard really hit somebody`);
    assert.ok(plain.log.some((l) => l.includes(':itemPickup:')), `seed ${seed}: an item was picked up`);
    assert.ok(fancy.frozenTicks > 20, 'hit pause really stopped the game for some ticks');
    assert.ok(fancy.slowMs >= 2000 && fancy.slowMs < 2200, `the final KO took ${fancy.slowMs} ms: 2 s of slow motion plus the hit pause`);
    assert.equal(plain.frozenTicks, 0);
    winners.add(JSON.stringify(plain.result));
  }
  assert.equal(winners.size, 4, 'four different matches');
});

test('the same seed gives the same match event for event; another seed gives another', () => {
  assert.deepEqual(playWithLoop(7, false).log, playWithLoop(7, false).log);
  assert.notDeepEqual(playWithLoop(7, false).log, playWithLoop(10, false).log);
});

test('the loop stops stepping while paused and after the end', () => {
  const state = fight({ settings: { lives: 1 } });
  const loop = createLoop({ state, getInputs: () => ({}) });
  loop.paused = true;
  assert.equal(loop.tick(100), 0);
  loop.paused = false;
  assert.ok(loop.tick(100) > 0);
  state.fighters[1].x = -1000;
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 1000) loop.tick(17);
  assert.equal(loop.tick(100), 0);
});

// ---- the stages ----

test('the main ground is solid: a fighter is stopped at its side wall and bumps the head from below', () => {
  const state = fight({ stage: 'campus' });
  const a = state.fighters[0];
  Object.assign(a, { x: 92, y: 650, vx: 8, vy: 0, onGround: false });
  for (let i = 0; i < 4; i++) { a.y = 650; a.vy = 0; a.gravityScale = 0; run(state, 1, { 0: { right: true } }); }
  assert.equal(a.x, 120 - 22, 'stopped with the body touching the wall');
  // From below: jumping up under the terrace does not go through it.
  Object.assign(a, { x: 600, y: 600 + 66 + 96 + 30, vx: 0, vy: -14, onGround: false });
  run(state, 6);
  assert.ok(a.y - 96 >= 666, `the head stays under the slab (top at ${a.y - 96})`);
});

test('every platform of every stage can be reached with one jump from a lower one', () => {
  for (const stage of STAGES) {
    for (const target of stage.platforms.filter((p) => !p.solid)) {
      const lower = stage.platforms.filter((p) => p.y > target.y);
      const reached = lower.some((from) => {
        // Start on the lower platform as close to the target as possible, jump and steer towards it.
        const startX = Math.max(from.x + 10, Math.min(from.x + from.w - 10, target.x + target.w / 2));
        const state = fight({ stage: stage.id });
        const a = place(state.fighters[0], startX, from.y);
        run(state, 2);
        const goal = target.x + target.w / 2;
        for (let i = 0; i < 70; i++) {
          run(state, 1, { 0: { jump: i === 0, left: a.x > goal + 10, right: a.x < goal - 10 } });
          if (a.onGround && a.y === target.y) return true;
        }
        return false;
      });
      assert.ok(reached, `${stage.name}: ${target.id}`);
    }
  }
});

test('the time cap ranks more lives above less damage', () => {
  const state = fight({ settings: { timeCapS: 3, lives: 3 } });
  const [a, b] = state.fighters;
  launchOut(state, b); // b has 2 lives and comes back at 0 %
  a.percent = 150; // a has 3 lives but much more damage
  let end = null;
  for (let i = 0; i < 400 && !end; i++) end = of(run(state, 1), 'matchEnd')[0];
  assert.equal(end.result.winner, a.slot);
  assert.equal(end.result.byTimeCap, true);
});
