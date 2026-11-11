// Edge cases found by the independent reviewers. Each test failed before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, makeSettings } from '../../src/game/config.js';
import { step, buildResult, phoneStatus } from '../../src/game/match.js';
import { beginWarning, WARN_FRAMES } from '../../src/game/hazards.js';
import { spawnItem } from '../../src/game/items.js';
import { InputBuffer, BIT } from '../../src/game/input.js';
import { createClock, advance, freeze } from '../../src/game/clock.js';
import { fight, place, run, tap, of, feedbackFor, launchOut } from '../helpers/game.js';

test('holding Down drops through one platform, not two', () => {
  for (const [stage, x, from, to] of [['campus', 640, 206, 336], ['beach', 770, 240, 350], ['campus', 1000, 336, 470]]) {
    const state = fight({ stage });
    const a = place(state.fighters[0], x, from);
    run(state, 2);
    assert.equal(a.onGround, true);
    run(state, 90, { 0: { down: true } }); // held the whole time
    assert.equal(a.y, to, `${stage}: from y=${from} to the next platform`);
  }
});

test('a second press of Down is needed for the next platform', () => {
  const state = fight({ stage: 'campus' });
  const a = place(state.fighters[0], 640, 206);
  run(state, 2);
  tap(state, 0, { down: true }, 60);
  assert.equal(a.y, 336);
  tap(state, 0, { down: true }, 60);
  assert.equal(a.y, 600);
});

for (const button of ['jump', 'attack', 'special']) {
  test(`a ${button} pressed while flying out does not happen by itself after the respawn`, () => {
    const state = fight({ fighters: ['bairro_chad', 'house_dj'] });
    const [a] = state.fighters;
    a.hitstun = 30;
    a.x = CONFIG.blast.left + 8;
    a.vx = -12;
    const events = run(state, 1, { 0: { [button]: true } }); // pressed in the last frame on screen
    events.push(...run(state, CONFIG.match.respawnFrames + 30)); // no input at all from here
    assert.equal(of(events, 'ko').length, 1);
    assert.equal(of(events, 'respawn').length, 1);
    assert.deepEqual(of(events, button === 'jump' ? 'jump' : button).filter((e) => e.slot === 0), []);
    assert.equal(a.cooldown, 0);
    assert.equal(a.jumpsLeft, 1);
  });
}

test('after a respawn the first jump in the air is the double jump, not a ground jump', () => {
  const state = fight();
  const [a] = state.fighters;
  place(a, 300, 470);
  run(state, 1);
  a.x = 325; // walks off the canopy edge: the short "still counts as ground" window starts
  run(state, 2, { 0: { right: true } });
  a.x = -1000;
  run(state, CONFIG.match.respawnFrames + 2);
  assert.equal(a.state, 'alive');
  const jumps = of(tap(state, 0, { jump: true }, 2), 'jump');
  assert.deepEqual(jumps.map((e) => e.double), [true]);
});

test('Spaghetti Lasso never pulls a fighter into the ground', () => {
  const state = fight({ stage: 'beach', fighters: ['carcavelos_gang_member', 'house_dj'] });
  const [caster, target] = state.fighters;
  place(target, 338, 600);
  Object.assign(caster, { x: 80, y: 604, vx: 0, vy: 0, onGround: false, facing: 1, gravityScale: 0 }); // just off the ledge, a little lower
  const before = target.x;
  const xs = [];
  for (let i = 0; i < 30; i++) {
    caster.gravityScale = 0;
    caster.vy = 0;
    run(state, 1, { 0: i === 1 ? { special: true } : {} });
    xs.push(target.x);
  }
  assert.equal(target.percent, 6, 'the lasso still hits');
  const biggestJump = Math.max(...xs.map((x, i) => Math.abs(x - (i ? xs[i - 1] : before))));
  assert.ok(biggestJump < 40, `no teleport (largest move in one frame: ${biggestJump})`);
  assert.ok(target.x > 120 && target.y <= 600.6, `still on the sand at ${target.x}, ${target.y}`);
});

test('the lasso and thrown things do not reach through the solid ground', () => {
  const state = fight({ stage: 'campus', fighters: ['carcavelos_gang_member', 'maastricht_blondie', 'house_dj'] });
  const [lasso, padel, target] = state.fighters;
  place(target, 600, 600);
  const under = (f, x) => Object.assign(f, { x, y: 600 + 66 + CONFIG.body.h + 6, vx: 0, vy: 0, onGround: false });
  for (let i = 0; i < 40; i++) {
    under(lasso, 600);
    under(padel, 600);
    lasso.gravityScale = 0;
    padel.gravityScale = 0;
    run(state, 1, i === 1 ? { 0: { up: true, special: true }, 1: { up: true, special: true } } : { 0: { up: true }, 1: { up: true } });
  }
  assert.equal(target.percent, 0);
  assert.equal(target.x, 600);
});

test('the clock survives a broken time value', () => {
  const clock = createClock();
  assert.equal(advance(clock, NaN), 0);
  assert.equal(advance(clock, undefined), 0);
  assert.equal(advance(clock, Infinity), 0);
  assert.equal(advance(clock, 17), 1, 'still running afterwards');
  freeze(clock, NaN);
  freeze(clock, -5);
  assert.equal(clock.freezeMs, 0);
  freeze(clock, Infinity);
  assert.equal(clock.freezeMs, 0);
  freeze(clock, 1e9);
  let frozen = 0;
  for (let i = 0; i < 100; i++) if (advance(clock, 16.7) === 0) frozen += 1;
  assert.ok(frozen <= 31, `a freeze is capped at half a second (${frozen} frames)`);
});

test('step() copes with a missing or broken input object', () => {
  const state = fight();
  for (const bad of [null, undefined, 5, 'x', [], { 0: null, 1: 5 }, { 0: 'abc', 1: [] }, { 0: { left: 'yes', attackP: 1, jump: {} } }]) {
    assert.doesNotThrow(() => step(state, bad));
  }
  for (const f of state.fighters) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
});

test('Bad Wi-Fi: a press that is still in the delay queue when the fighter leaves the zone is not lost', () => {
  const state = fight({ stage: 'campus', settings: { hazards: true } });
  const [a] = state.fighters;
  place(a, 600, 600);
  beginWarning(state, { id: 'wifi', zone: 'ground' });
  for (let i = 0; i < WARN_FRAMES + 20; i++) { place(a, 600, 600); run(state, 1); }
  const events = tap(state, 0, { jump: true }, 4); // pressed in the zone, still waiting in the queue
  assert.equal(of(events, 'jump').length, 0, 'delayed');
  place(a, 600, 336); // now on the roof: outside the zone
  assert.equal(of(run(state, 3), 'jump').length, 1, 'the waiting press comes through');
});

test('Bad Wi-Fi and tipsy together: the direction does not flicker', () => {
  const state = fight({ stage: 'campus', settings: { hazards: true } });
  const [a] = state.fighters;
  place(a, 600, 600);
  beginWarning(state, { id: 'wifi', zone: 'ground' });
  for (let i = 0; i < WARN_FRAMES + 1; i++) { place(a, 600, 600); run(state, 1, { 0: { right: true } }); }
  a.tipsy = 400;
  let flips = 0;
  let last = 0;
  for (let i = 0; i < 40; i++) {
    const before = a.x;
    run(state, 1, { 0: { right: true } });
    const dir = Math.sign(a.x - before);
    if (dir && last && dir !== last) flips += 1;
    if (dir) last = dir;
  }
  assert.ok(flips <= 1, `direction changed ${flips} times`);
  assert.ok(a.x < 600, 'tipsy: holding right walks left');
});

test('a hit that is the 200 % KO leaves no status effect behind and sends only the KO message', () => {
  const state = fight({ fighters: ['bairro_chad', 'house_dj', 'finance_bro'], settings: { lives: 1 } });
  const [chad, victim] = state.fighters;
  place(chad, 300);
  place(victim, 400);
  place(state.fighters[2], 1000);
  victim.percent = 198;
  const events = tap(state, 0, { special: true }, 14);
  assert.equal(of(events, 'ko')[0].kind, 'burnout');
  assert.equal(victim.state, 'out');
  assert.equal(victim.tipsy, 0);
  assert.equal(phoneStatus(state, victim.slot).tipsy, false);
  const toVictim = of(events, 'feedback').filter((e) => e.slot === victim.slot).map((e) => e.kind);
  assert.deepEqual(toVictim, ['out'], 'the phone shows the KO, not "You\'re drunk!"');
});

test('a normal attack that is the 200 % KO sends no extra hit feedback after the KO', () => {
  const state = fight();
  const [a, b] = state.fighters;
  place(a, 500);
  place(b, 560);
  b.percent = 195;
  const events = tap(state, 0, { attack: true }, 12);
  assert.deepEqual(of(events, 'feedback').filter((e) => e.slot === 1).map((e) => e.kind), ['ko']);
});

test('two players who swing at each other in the same frame both land their hit', () => {
  for (const order of [['finance_bro', 'house_dj'], ['house_dj', 'finance_bro']]) {
    const state = fight({ fighters: order });
    const [a, b] = state.fighters;
    place(a, 500).facing = 1;
    place(b, 560).facing = -1;
    run(state, 12, (i) => (i === 0 ? { 0: { attack: true }, 1: { attack: true } } : {}));
    assert.deepEqual([a.percent, b.percent], [8, 8], 'a trade');
    assert.ok(a.vx < 0 && b.vx > 0, 'both are knocked back');
  }
});

test('a trade at 195 % on the last life leaves exactly one winner with a life', () => {
  const state = fight({ settings: { lives: 1 } });
  const [a, b] = state.fighters;
  place(a, 500).facing = 1;
  place(b, 560).facing = -1;
  a.percent = 195;
  b.percent = 195;
  run(state, 12, (i) => (i === 0 ? { 0: { attack: true }, 1: { attack: true } } : {}));
  run(state, 60);
  const result = buildResult(state);
  assert.equal(state.phase, 'ended');
  assert.deepEqual(result.players.map((p) => p.endLives).sort(), [0, 1]);
  assert.equal(result.players.find((p) => p.slot === result.winner).endLives, 1);
});

test('the final KO points at the player who was eliminated, not at a winner who also fell', () => {
  const state = fight({ settings: { lives: 2 } });
  const [winner, loser] = state.fighters;
  launchOut(state, loser);
  run(state, CONFIG.match.respawnFrames + 2);
  // Both leave the screen in the same frame: the loser loses the last life, the winner only one of two.
  winner.percent = 20;
  loser.percent = 150;
  Object.assign(loser, { x: 2000, y: 300 });
  Object.assign(winner, { x: -1000, y: 300 });
  const final = of(step(state, {}), 'finalKo')[0];
  assert.equal(final.winner, winner.slot);
  assert.equal(final.slot, loser.slot);
  assert.ok(final.x > 640, 'the zoom goes to where the loser left');
  run(state, 60);
  assert.equal(buildResult(state).players[winner.slot].endPercent, 0, 'a winner waiting to respawn is not reported with the old damage');
});

test('settings that arrive as text from a form are understood', () => {
  assert.equal(makeSettings({ lives: '1' }).lives, 1);
  assert.equal(makeSettings({ items: 'false' }).items, false);
  assert.equal(makeSettings({ hazards: '0' }).hazards, false);
  assert.equal(makeSettings({ items: 'true' }).items, true);
  assert.equal(makeSettings({ hazards: true }).hazards, true);
  const odd = makeSettings({ hazardMinS: Infinity, hazardMaxS: NaN, timeCapS: -3 });
  assert.deepEqual([odd.hazardMinS, odd.hazardMaxS, odd.timeCapS], [25, 40, 0]);
  const state = fight({ settings: { hazards: true, hazardMinS: Infinity } });
  assert.ok(Number.isFinite(state.hazard.timer));
});

test('input messages need a whole, non-negative sequence number when one is given', () => {
  const buffer = new InputBuffer();
  for (const seq of [1.5, -1, '7', NaN, null, {}]) assert.equal(buffer.receive(BIT.attack, seq), false, String(seq));
  assert.equal(buffer.consume().attackP, false);
  assert.equal(buffer.receive(BIT.attack, 3), true);
  assert.equal(buffer.receive(BIT.attack), true, 'no sequence number at all is fine (keyboard, tests)');
});

test('a stunned fighter does not finish the attack they had started', () => {
  const state = fight({ stage: 'beach', fighters: ['finance_bro', 'house_dj'], settings: { hazards: true } });
  const [a, b] = state.fighters;
  beginWarning(state, { id: 'gulls', zone: 'sand', dir: 1 });
  for (let i = 0; i < WARN_FRAMES; i++) { place(a, 400, 600); place(b, 460, 600); run(state, 1); }
  a.facing = 1;
  let pecked = false;
  for (let i = 0; i < 140 && !pecked; i++) {
    place(a, 400, 600);
    place(b, 460, 350); // the target waits out of the gulls' zone
    b.gravityScale = 0;
    b.vy = 0;
    // start a swing just before the flock arrives
    const events = run(state, 1, { 0: { attack: Math.abs(state.hazard.pos - 400) < 120 && !a.attack } });
    pecked = a.percent > 0;
    assert.ok(events);
  }
  assert.equal(pecked, true, 'the gulls reached the fighter');
  assert.equal(a.attack, null, 'the swing was cancelled by the peck');
});

test('a book stolen by the seagulls in mid-throw is not thrown', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [a, b] = state.fighters;
  place(a, 400, 600);
  place(b, 900, 350);
  a.held = { type: 'book', uses: 1 };
  beginWarning(state, { id: 'gulls', zone: 'sand', dir: 1 });
  for (let i = 0; i < WARN_FRAMES; i++) { place(a, 400, 600); run(state, 1); }
  const events = [];
  let guard = 0;
  while (a.held && guard++ < 200) {
    place(a, 400, 600);
    const near = Math.abs(state.hazard.pos - 400) < CONFIG.hazards.gulls.reach + 30;
    events.push(...run(state, 1, { 0: { attack: near && guard % 2 === 0 } }));
  }
  events.push(...run(state, 20));
  assert.equal(of(events, 'itemStolen').length, 1);
  assert.equal(of(events, 'projectile').length, 0);
  assert.ok(spawnItem && feedbackFor);
});
