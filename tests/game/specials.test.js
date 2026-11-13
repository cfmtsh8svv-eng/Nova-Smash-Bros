// The eight specials: each one hits inside its range, misses outside it, and
// tells only the player it hit (the "feedback" event that goes to that phone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTERS, getFighter } from '../../src/game/fighters.js';
import { CONFIG } from '../../src/game/config.js';
import { fight, place, run, tap, of } from '../helpers/game.js';

// Slot 0 uses the special. Slots 1.. are opponents placed at the given offsets (dx, and optionally y).
function cast(fighterId, targets, { input = {}, casterX = 300, stage = 'campus', frames = 110 } = {}) {
  const others = ['house_dj', 'lisboa_og', 'bairro_chad'].filter((id) => id !== fighterId).slice(0, targets.length);
  const state = fight({ stage, fighters: [fighterId, ...others] });
  const caster = place(state.fighters[0], casterX);
  caster.facing = 1;
  const foes = state.fighters.slice(1);
  targets.forEach((t, i) => place(foes[i], casterX + t.dx, t.y ?? 600));
  const events = run(state, frames, (i) => ({ 0: i === 1 ? { ...input, special: true } : input }));
  const told = of(events, 'feedback').filter((e) => e.kind === 'special');
  return { state, caster, foes, events, told, S: getFighter(fighterId).special };
}

test('every fighter has one special with a cooldown between 6 and 8 seconds', () => {
  assert.equal(FIGHTERS.length, 8);
  assert.equal(new Set(FIGHTERS.map((f) => f.special.id)).size, 8);
  for (const f of FIGHTERS) {
    assert.ok(f.special.cooldown >= 6 * 60 && f.special.cooldown <= 8 * 60, f.name);
    assert.ok(f.special.phone.length > 0, f.name);
  }
});

test('Cash Rain: 6 % and slipping inside 220 px, nothing outside', () => {
  const { foes, told, S } = cast('finance_bro', [{ dx: 150 }, { dx: 300 }], { frames: 14 });
  const [inside, outside] = foes;
  assert.equal(inside.percent, 6);
  assert.ok(inside.slip > 0 && inside.slip <= S.slipFrames);
  assert.ok(inside.vx > 0, 'slides away from the caster');
  assert.equal(outside.percent, 0);
  assert.equal(outside.slip, 0);
  assert.deepEqual(told.map((e) => e.slot), [inside.slot]);
  assert.equal(told[0].text, 'You slipped on cash!');
});

test('Cash Rain: slipping lasts 1.5 s and leaves almost no grip', () => {
  const { state, foes } = cast('finance_bro', [{ dx: 150 }], { frames: 14 });
  const foe = foes[0];
  const vx = foe.vx;
  run(state, 20, { [foe.slot]: { left: true } });
  assert.ok(foe.vx > 0, `still sliding away although steering back (vx ${vx} -> ${foe.vx})`);
  run(state, 90);
  assert.equal(foe.slip, 0);
});

test('Padel Smash: 14 % on the first opponent in the line only', () => {
  const { foes, told, events } = cast('maastricht_blondie', [{ dx: 200 }, { dx: 400 }]);
  const [first, second] = foes;
  assert.equal(first.percent, 14);
  assert.equal(second.percent, 0, 'the ball stops at the first opponent');
  assert.deepEqual(told.map((e) => e.slot), [first.slot]);
  assert.equal(told[0].text, 'Smashed!');
  // "strong knockback": clearly more than a normal attack would give at the same damage (weight 100)
  const normal = CONFIG.attack.baseKb + CONFIG.attack.kbGrowth * 0.14;
  assert.ok(of(events, 'hit')[0].speed > normal * 1.3, `strong knockback (${of(events, 'hit')[0].speed} against ${normal})`);
});

test('Padel Smash: misses beyond its range and above its line', () => {
  const far = cast('maastricht_blondie', [{ dx: 640 }]);
  assert.equal(far.foes[0].percent, 0);
  assert.equal(far.told.length, 0);
  assert.equal(far.state.projectiles.length, 0, 'the ball is gone');
  const above = cast('maastricht_blondie', [{ dx: 200, y: 336 }]);
  assert.equal(above.foes[0].percent, 0);
});

test('Padel Smash goes up while Up is held', () => {
  const { foes } = cast('maastricht_blondie', [{ dx: 0, y: 336 }, { dx: 200 }], { input: { up: true }, casterX: 640 });
  assert.equal(foes[0].percent, 14, 'the opponent on the roof above is hit');
  assert.equal(foes[1].percent, 0, 'the opponent beside is not');
});

test("Round's On Me: 7 % and tipsy for 3 s inside 200 px, nothing outside", () => {
  const { state, foes, told, S } = cast('bairro_chad', [{ dx: 150 }, { dx: 260 }], { frames: 14 });
  const [inside, outside] = foes;
  assert.equal(inside.percent, 7);
  assert.ok(inside.tipsy > 0 && inside.tipsy <= S.tipsyFrames);
  assert.equal(S.tipsyFrames, 180);
  assert.equal(outside.percent, 0);
  assert.equal(outside.tipsy, 0);
  assert.deepEqual(told.map((e) => e.slot), [inside.slot]);
  assert.equal(told[0].text, "You're drunk! Drink water!");
  // Tipsy swaps left and right.
  place(inside, 800);
  place(outside, 900);
  run(state, 10, { [inside.slot]: { right: true }, [outside.slot]: { right: true } });
  assert.ok(inside.x < 800, 'pressing right walks left');
  assert.ok(outside.x > 900, 'a sober fighter walks right');
});

test('Wave Rider: surfs 360 px, 10 % and carries the opponent along', () => {
  const { caster, foes, told } = cast('surfer_girl', [{ dx: 200 }, { dx: 700 }], { frames: 36 });
  const [inside, outside] = foes;
  assert.ok(Math.abs(caster.x - (300 + 360)) < 6, `surfed to ${caster.x}`);
  assert.equal(inside.percent, 10);
  assert.ok(inside.x > 500 + 100, `pushed along to ${inside.x}`);
  assert.equal(outside.percent, 0);
  assert.equal(outside.x, 1000);
  assert.deepEqual(told.map((e) => e.slot), [inside.slot]);
  assert.equal(told[0].text, 'Wipeout!');
});

test('Wave Rider hits each opponent once, not every frame', () => {
  const { events } = cast('surfer_girl', [{ dx: 120 }], { frames: 60 });
  assert.equal(of(events, 'hit').length, 1);
});

test('Wave Rider goes up while Up is held', () => {
  const { caster, foes } = cast('surfer_girl', [{ dx: 0, y: 380 }], { input: { up: true }, casterX: 200, stage: 'beach', frames: 20 });
  assert.ok(caster.y < 600 - 150, `rode up to y ${caster.y}`);
  assert.equal(foes[0].percent, 10);
});

test('Ring Light Flash: hits exactly one opponent, the nearest, and stuns for 1 s', () => {
  const { state, foes, told, S } = cast('wannabe_influencer', [{ dx: 200 }, { dx: 100 }, { dx: -260 }], { frames: 10, casterX: 600 });
  const [far, near, behind] = foes;
  assert.equal(near.percent, 5);
  assert.ok(near.stun > 0 && near.stun <= S.stunFrames);
  assert.equal(S.stunFrames, 60);
  assert.equal(far.percent, 0);
  assert.equal(behind.percent, 0);
  assert.deepEqual(told.map((e) => e.slot), [near.slot]);
  assert.equal(told[0].flash, '#ffffff', 'the phone flashes white');
  assert.equal(told[0].text, 'Blinded! No filter can save you.');
  // A stunned fighter cannot act.
  const x = near.x;
  const events = run(state, 20, { [near.slot]: { right: true, jump: true, attack: true } });
  assert.equal(near.x, x);
  assert.equal(of(events, 'jump').length, 0);
  assert.equal(of(events, 'attack').length, 0);
});

test('Ring Light Flash: misses when nobody is within 320 px', () => {
  const { foes, told } = cast('wannabe_influencer', [{ dx: 400 }, { dx: -500 }], { casterX: 600 });
  assert.deepEqual(foes.map((f) => f.percent), [0, 0]);
  assert.equal(told.length, 0);
});

test('Ring Light Flash skips an invincible opponent and takes the next nearest', () => {
  const others = ['house_dj', 'lisboa_og'];
  const state = fight({ fighters: ['wannabe_influencer', ...others] });
  const [c, near, far] = state.fighters;
  place(c, 600);
  place(near, 700);
  place(far, 800);
  near.invincible = 100;
  tap(state, 0, { special: true }, 12);
  assert.equal(near.percent, 0);
  assert.equal(far.percent, 5);
});

test('Bass Drop: 12 % and an upward launch inside 230 px, nothing outside', () => {
  const { foes, told, events } = cast('house_dj', [{ dx: 100 }, { dx: 300 }], { frames: 23 });
  const [inside, outside] = foes;
  assert.equal(inside.percent, 12);
  const hit = of(events, 'hit')[0];
  assert.ok(hit, 'hit event');
  assert.ok(inside.y < 600 || inside.vy < 0, 'launched upward');
  assert.equal(outside.percent, 0);
  assert.deepEqual(told.map((e) => e.slot), [inside.slot]);
  assert.equal(told[0].text, 'BASS DROP!');
});

test('Bass Drop: the DJ hops first and the shockwave comes on landing', () => {
  const state = fight({ fighters: ['house_dj', 'finance_bro'] });
  const [dj, foe] = state.fighters;
  place(dj, 300);
  place(foe, 380);
  tap(state, 0, { special: true }, 6);
  assert.ok(dj.y < 600, 'in the air');
  assert.equal(foe.percent, 0, 'nothing yet');
  run(state, 40);
  assert.equal(foe.percent, 12);
  assert.equal(dj.y, 600);
});

test('Ding-Ding: the mini tram rolls along the ground, 12 % and sideways knockback', () => {
  const { foes, told, events } = cast('lisboa_og', [{ dx: 400 }, { dx: 300, y: 336 }], { casterX: 200 });
  const [onGround, onRoof] = foes;
  assert.equal(onGround.percent, 12);
  const hit = of(events, 'hit')[0];
  assert.ok(hit.speed > 0);
  assert.ok(onGround.x > 600, 'knocked sideways, in the direction of the tram');
  assert.equal(onRoof.percent, 0, 'a fighter on the roof is safe');
  assert.deepEqual(told.map((e) => e.slot), [onGround.slot]);
  assert.equal(told[0].text, 'Run over by the 28!');
});

test('Ding-Ding: the tram stops after its range', () => {
  const { foes, state } = cast('lisboa_og', [{ dx: 950 }], { casterX: 150, frames: 200 });
  assert.equal(foes[0].percent, 0);
  assert.equal(state.projectiles.length, 0);
});

test('Ding-Ding goes left when the fighter looks left, and up while Up is held', () => {
  const left = cast('lisboa_og', [{ dx: -300 }, { dx: 300 }], { casterX: 640, input: { left: true }, frames: 80 });
  assert.equal(left.foes[0].percent, 12);
  assert.equal(left.foes[1].percent, 0);
  const up = cast('lisboa_og', [{ dx: 0, y: 470 }], { casterX: 200, input: { up: true }, frames: 30 });
  assert.equal(up.foes[0].percent, 12, 'tossed up to the canopy above');
});

test('Spaghetti Lasso: pulls the first opponent within 380 px to the caster, 6 % and a short stun', () => {
  const { caster, foes, told, S } = cast('carcavelos_gang_member', [{ dx: 300 }, { dx: 360 }], { frames: 20 });
  const [first, second] = foes;
  assert.equal(first.percent, 6);
  assert.ok(Math.abs(first.x - (caster.x + S.pullGap)) < 2, `pulled to ${first.x}`);
  assert.equal(S.stunFrames, 42);
  assert.equal(second.percent, 0, 'only the first opponent');
  assert.equal(second.x, 660);
  assert.deepEqual(told.map((e) => e.slot), [first.slot]);
  assert.equal(told[0].text, 'Caught in the pasta!');
});

test('Spaghetti Lasso: misses beyond 380 px and behind the caster', () => {
  const { foes, told } = cast('carcavelos_gang_member', [{ dx: 450 }, { dx: -200 }], { casterX: 500 });
  assert.deepEqual(foes.map((f) => [f.percent, f.x]), [[0, 950], [0, 300]]);
  assert.equal(told.length, 0);
});

test('Spaghetti Lasso reaches up while Up is held', () => {
  const { foes } = cast('carcavelos_gang_member', [{ dx: 0, y: 336 }], { casterX: 600, input: { up: true }, frames: 12 });
  assert.equal(foes[0].percent, 6);
});

test('a special cannot be used again until its cooldown is over', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 300);
  place(b, 1000);
  const S = getFighter('finance_bro').special;
  assert.equal(of(tap(state, 0, { special: true }, 60), 'special').length, 1);
  assert.equal(of(tap(state, 0, { special: true }, 60), 'special').length, 0, 'rejected during the cooldown');
  run(state, S.cooldown - 120 - 30);
  assert.equal(of(tap(state, 0, { special: true }, 10), 'special').length, 0, 'still too early');
  assert.ok(a.cooldown > 0);
  run(state, 30);
  assert.equal(a.cooldown, 0);
  assert.equal(of(tap(state, 0, { special: true }, 2), 'special').length, 1, 'ready again');
});

test('a KO caused by a special is counted as a special KO', () => {
  const state = fight({ fighters: ['finance_bro', 'house_dj'] });
  const [a, b] = state.fighters;
  place(a, 300);
  place(b, 400);
  b.percent = 196;
  const events = tap(state, 0, { special: true }, 14);
  assert.equal(of(events, 'ko')[0].kind, 'burnout');
  assert.equal(a.stats.specialKos, 1);
  assert.equal(a.stats.kos, 1);
});
