// Stage hazards: the warning always comes first, there is never more than one,
// and every hazard leaves a safe place to stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/game/config.js';
import { STAGES, HAZARDS } from '../../src/game/stages.js';
import { beginWarning, voteHazard, WARN_FRAMES, hazardRect } from '../../src/game/hazards.js';
import { spawnItem } from '../../src/game/items.js';
import { fight, place, run, tap, of, feedbackFor, launchOut } from '../helpers/game.js';

// Start a chosen hazard and run through its warning. Returns the events of the warning.
function warn(state, forced) {
  beginWarning(state, forced);
  const announced = state.events.filter((e) => e.type === 'hazardWarn'); // pushed outside of a step
  return [...announced, ...run(state, WARN_FRAMES - 1)];
}
// Keep fighters where the test put them while the warning counts down.
function pinned(state, spots, frames) {
  const events = [];
  for (let i = 0; i < frames; i++) {
    spots.forEach(([f, x, y]) => place(f, x, y));
    events.push(...run(state, 1));
  }
  return events;
}
// The train is cancelled 25 % of the time: find a seed where it really comes.
function trainMatch(want = 'hazardStart') {
  for (let seed = 1; seed < 200; seed++) {
    const state = fight({ stage: 'campus', settings: { hazards: true }, seed });
    const [a, b] = state.fighters;
    beginWarning(state, { id: 'train', dir: 1 });
    const events = pinned(state, [[a, 640, 600], [b, 200, 470]], WARN_FRAMES);
    if (of(events, want).length) return { state, a, b, events };
  }
  throw new Error('no seed found');
}

test('every stage has exactly two hazards', () => {
  for (const stage of STAGES) {
    assert.equal(stage.hazards.length, 2, stage.name);
    for (const id of stage.hazards) assert.ok(HAZARDS[id], id);
  }
});

test('the announcement is the name, then 3, 2, 1, and only then the hazard starts', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  beginWarning(state, { id: 'wave', dir: 1 });
  const events = [];
  const frames = {};
  for (let i = 1; i <= WARN_FRAMES; i++) {
    for (const e of run(state, 1)) {
      events.push(e);
      if (e.type === 'hazardCount') frames[e.n] = i;
      if (e.type === 'hazardStart') frames.start = i;
    }
    if (i < WARN_FRAMES) assert.equal(hazardRect(state), null, 'no wave on the stage during the warning');
  }
  assert.deepEqual(of(events, 'hazardCount').map((e) => e.n), [3, 2, 1]);
  assert.deepEqual(frames, { 3: 60, 2: 120, 1: 180, start: 240 });
  assert.equal(of(events, 'hazardCount')[0].name, 'BIG WAVE');
  assert.equal(state.hazard.phase, 'active');
});

test('nothing is hurt while a hazard is only being announced', () => {
  const state = fight({ stage: 'campus', settings: { hazards: true }, seed: 2 });
  const [a, b] = state.fighters;
  beginWarning(state, { id: 'train', dir: 1 });
  const events = pinned(state, [[a, 640, 600], [b, 700, 600]], WARN_FRAMES - 1);
  assert.equal(of(events, 'hit').length, 0);
  assert.equal(a.percent + b.percent, 0);
});

test('over a long match: never two hazards at once, always warning first, 25 to 40 s apart', () => {
  for (const stage of ['campus', 'beach', 'bairro']) {
    const state = fight({ stage, settings: { hazards: true }, seed: 5 });
    let open = null; // the hazard that is currently announced or running
    let lastEnd = state.frame;
    let warned = false;
    let counts = [];
    let rounds = 0;
    const ids = new Set();
    for (let i = 0; i < 60 * 60 * 6; i++) {
      state.fighters.forEach((f, k) => Object.assign(f, { x: 500 + k * 200, y: -50, vy: 0, gravityScale: 0, percent: 0 }));
      for (const e of run(state, 1)) {
        if (e.type === 'hazardWarn') {
          assert.equal(open, null, 'a new warning only when no hazard is open');
          const gap = state.frame - lastEnd;
          assert.ok(gap >= 25 * 60 && gap <= 40 * 60 + 1, `gap ${gap} frames`);
          open = e.hazard;
          warned = true;
          counts = [];
          ids.add(e.hazard);
          assert.ok(state.stage.hazards.includes(e.hazard));
        }
        if (e.type === 'hazardCount') counts.push(e.n);
        if (e.type === 'hazardStart' || e.type === 'hazardCancel') {
          assert.equal(e.hazard, open);
          assert.ok(warned, 'the warning came first');
          assert.deepEqual(counts, [3, 2, 1]);
        }
        if (e.type === 'hazardEnd') {
          assert.equal(e.hazard, open);
          open = null;
          warned = false;
          lastEnd = state.frame;
          rounds += 1;
        }
      }
    }
    assert.ok(rounds >= 6, `${stage}: ${rounds} hazards happened`);
    assert.equal(ids.size, 2, `${stage}: both hazards showed up`);
  }
});

test('with hazards switched off none appear', () => {
  const state = fight({ settings: { hazards: false } });
  assert.equal(run(state, 60 * 120).filter((e) => e.type.startsWith('hazard')).length, 0);
});

// ---- one test per hazard: it hits in its zone and spares the safe platform ----

test('Cascais Line Train: hits the terrace level, a fighter on the canopy is safe', () => {
  const { state, a, b } = trainMatch();
  const events = [];
  for (let i = 0; i < 200 && state.hazard.phase === 'active'; i++) {
    place(b, 200, 470);
    if (a.percent === 0) place(a, 640, 600);
    events.push(...run(state, 1));
  }
  assert.equal(a.percent, CONFIG.hazards.train.damage, 'the fighter on the terrace is hit');
  assert.ok(a.x > 640, 'knocked along with the train');
  assert.equal(b.percent, 0, 'the fighter on the canopy is safe');
  assert.deepEqual(feedbackFor(events, 'hazard'), [a.slot]);
  assert.equal(of(events, 'hit').length, 1, 'the train hits only once');
  assert.equal(state.hazard.phase, 'idle');
});

test('Cascais Line Train: a jump at the right moment clears it... onto a platform', () => {
  const { state, a } = trainMatch();
  place(a, 640, 336); // already up on the main roof
  for (let i = 0; i < 200 && state.hazard.phase === 'active'; i++) run(state, 1);
  assert.equal(a.percent, 0);
});

test('Cascais Line Train: one time in four it is cancelled by a strike and hurts nobody', () => {
  const { state, a, events } = trainMatch('hazardCancel');
  assert.equal(of(events, 'hazardCancel')[0].text, 'STRIKE! Train cancelled.');
  assert.equal(of(events, 'hazardStart').length, 0);
  const rest = pinned(state, [[a, 640, 600]], 300);
  assert.equal(a.percent, 0);
  assert.equal(of(rest, 'hazardEnd').length, 1);
  assert.equal(state.hazard.phase, 'idle');

  let strikes = 0;
  const tries = 400;
  for (let seed = 1; seed <= tries; seed++) {
    const s = fight({ stage: 'campus', settings: { hazards: true }, seed });
    beginWarning(s, { id: 'train' });
    if (of(pinned(s, [[s.fighters[0], 640, 100], [s.fighters[1], 700, 100]], WARN_FRAMES), 'hazardCancel').length) strikes += 1;
  }
  assert.ok(strikes > tries * 0.17 && strikes < tries * 0.33, `${strikes} strikes in ${tries}`);
});

test('Bad Wi-Fi: inputs in the zone arrive 200 ms late, the other zone is unaffected', () => {
  const state = fight({ stage: 'campus', settings: { hazards: true } });
  const [onRoof, onGround] = state.fighters;
  place(onRoof, 600, 336);
  place(onGround, 600, 600);
  run(state, 2);
  const warning = warn(state, { id: 'wifi', zone: 'roof' });
  assert.equal(of(warning, 'hazardWarn')[0].name, 'BAD WI-FI ON THE ROOFS');
  const start = run(state, 3);
  assert.equal(of(start, 'hazardStart').length, 1);
  assert.deepEqual(feedbackFor(start, 'hazard'), [onRoof.slot], 'only the affected player is told');
  // Both press jump in the same frame.
  let roofJump = null;
  let groundJump = null;
  for (let i = 0; i < 30; i++) {
    const events = run(state, 1, i === 0 ? { 0: { jump: true }, 1: { jump: true } } : {});
    for (const e of of(events, 'jump')) {
      if (e.slot === onRoof.slot) roofJump = i;
      else groundJump = i;
    }
  }
  assert.equal(groundJump, 0, 'the safe fighter jumps at once');
  assert.equal(roofJump, CONFIG.hazards.wifi.delayFrames, 'the fighter in the zone jumps 12 frames (200 ms) later');
  assert.equal(CONFIG.hazards.wifi.delayFrames / 60, 0.2);
});

test('Bad Wi-Fi: lasts 6 s, and leaving the zone ends the lag for that fighter', () => {
  const state = fight({ stage: 'campus', settings: { hazards: true } });
  const [a] = state.fighters;
  place(a, 600, 600);
  warn(state, { id: 'wifi', zone: 'ground' });
  run(state, 20);
  place(a, 600, 336); // climbed out of the zone
  run(state, 2);
  assert.equal(of(tap(state, 0, { jump: true }, 2), 'jump').length, 1, 'no lag on the roof');
  const events = run(state, CONFIG.hazards.wifi.frames);
  assert.equal(of(events, 'hazardEnd').length, 1);
  assert.equal(state.hazard.phase, 'idle');
});

test('Big Wave: sweeps the sand level, the roofs are safe', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [a, b] = state.fighters;
  beginWarning(state, { id: 'wave', dir: -1 });
  pinned(state, [[a, 640, 600], [b, 1000, 480]], WARN_FRAMES);
  const events = [];
  for (let i = 0; i < 200 && state.hazard.phase === 'active'; i++) {
    place(b, 1000, 480);
    if (a.percent === 0) place(a, 640, 600);
    events.push(...run(state, 1));
  }
  assert.equal(a.percent, CONFIG.hazards.wave.damage);
  assert.ok(a.x < 640, 'washed along with the wave');
  assert.equal(b.percent, 0, 'the fighter on the kiosk roof is safe');
  assert.deepEqual(feedbackFor(events, 'hazard'), [a.slot]);
});

test('Seagulls: steal the held item and one lying item in their zone only', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [onSand, onRoof] = state.fighters;
  onSand.held = { type: 'sardine', uses: 5 };
  onRoof.held = { type: 'book', uses: 1 };
  state.items.push({ id: 901, type: 'tart', x: 500, y: 600, age: 100 });
  state.items.push({ id: 902, type: 'tart', x: 800, y: 600, age: 100 });
  state.items.push({ id: 903, type: 'espresso', x: 720, y: 240, age: 100 });
  beginWarning(state, { id: 'gulls', zone: 'sand', dir: 1 });
  const events = pinned(state, [[onSand, 300, 600], [onRoof, 770, 350]], WARN_FRAMES + CONFIG.hazards.gulls.frames + 2);
  assert.equal(onSand.held, null, 'the sardine is gone');
  assert.equal(onSand.percent, 0);
  assert.deepEqual(onRoof.held, { type: 'book', uses: 1 }, 'the fighter on the lifeguard deck keeps the book');
  assert.deepEqual(state.items.map((i) => i.id), [902, 903], 'one item on the sand is taken, the one on the roof stays');
  assert.deepEqual(feedbackFor(events, 'hazard'), [onSand.slot]);
  assert.equal(of(events, 'itemStolen').length, 2);
  assert.equal(state.hazard.phase, 'idle');
});

test('Seagulls: a fighter with empty hands gets a small peck, the other zone is safe', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [onRoof, onSand] = state.fighters;
  beginWarning(state, { id: 'gulls', zone: 'roofs', dir: -1 });
  pinned(state, [[onRoof, 280, 470], [onSand, 600, 600]], WARN_FRAMES + CONFIG.hazards.gulls.frames + 2);
  assert.equal(onRoof.percent, CONFIG.hazards.gulls.peckDamage);
  assert.equal(onSand.percent, 0);
});

test('Drunk Crowd: drags fighters along the street, the balconies are safe', () => {
  const state = fight({ stage: 'bairro', settings: { hazards: true } });
  const [onStreet, onBalcony] = state.fighters;
  beginWarning(state, { id: 'crowd', dir: 1 });
  pinned(state, [[onStreet, 300, 600], [onBalcony, 240, 470]], WARN_FRAMES);
  const events = run(state, 150);
  assert.ok(onStreet.x > 300 + 200, `dragged along to ${onStreet.x}`);
  assert.equal(onStreet.percent, CONFIG.hazards.crowd.damage);
  assert.equal(onBalcony.x, 240, 'not moved');
  assert.equal(onBalcony.percent, 0);
  assert.deepEqual(feedbackFor(events, 'hazard'), [onStreet.slot]);
});

test('Drunk Crowd: jumping out of it works', () => {
  const state = fight({ stage: 'bairro', settings: { hazards: true } });
  const [a] = state.fighters;
  beginWarning(state, { id: 'crowd', dir: 1 });
  pinned(state, [[a, 200, 600]], WARN_FRAMES);
  let guard = 0;
  while (a.percent === 0 && guard++ < 300) run(state, 1);
  tap(state, 0, { jump: true }, 60); // lands on the left balcony above
  assert.equal(a.y, 470);
  const x = a.x;
  run(state, 30);
  assert.equal(a.x, x, 'no longer dragged');
});

test('Drinks: touching one makes you tipsy for 8 s, other platforms are safe', () => {
  const state = fight({ stage: 'bairro', settings: { hazards: true } });
  const [a, b] = state.fighters;
  const warning = warn(state, { id: 'drinks', platform: 3 });
  assert.equal(of(warning, 'hazardWarn')[0].name, "DRINKS ON THE SPOT'S TERRACE");
  place(a, 100, 100);
  a.gravityScale = 0;
  run(state, 1);
  const drink = state.hazard.drinks[1];
  assert.equal(state.hazard.drinks.length, 3);
  assert.equal(drink.y, 336);
  const events = pinned(state, [[a, drink.x, 336], [b, 640, 600]], 5);
  assert.equal(a.tipsy > 0 && a.tipsy <= 8 * 60, true);
  assert.equal(b.tipsy, 0, 'the fighter on the street is not affected');
  assert.deepEqual(feedbackFor(events, 'hazard'), [a.slot]);
  assert.match(of(events, 'feedback').find((e) => e.kind === 'hazard').text, /Drink water!/);
  assert.equal(state.hazard.drinks.filter((d) => d.taken).length, 1, 'a drink is used up once');
  const rest = run(state, 8 * 60);
  assert.equal(of(rest, 'hazardEnd').length, 1, 'the drinks disappear after 8 s');
  assert.equal(a.tipsy, 0);
});

// ---- the vote of knocked-out players ----

test('an eliminated player can vote for the next hazard and the vote decides it', () => {
  for (const wanted of ['train', 'wifi']) {
    for (let seed = 1; seed <= 12; seed++) {
      const state = fight({ stage: 'campus', fighters: ['finance_bro', 'house_dj', 'surfer_girl'], settings: { hazards: true, lives: 1 }, seed });
      const out = state.fighters[2];
      launchOut(state, out);
      assert.equal(voteHazard(state, out.slot, wanted), true);
      state.hazard.timer = 1;
      const events = run(state, 2);
      assert.equal(of(events, 'hazardWarn')[0].hazard, wanted);
      assert.deepEqual(state.hazardVotes, {}, 'votes are used up');
    }
  }
});

test('hazard votes are rejected from players still in the match and for hazards of another stage', () => {
  const state = fight({ stage: 'campus', fighters: ['finance_bro', 'house_dj', 'surfer_girl'], settings: { hazards: true, lives: 1 } });
  assert.equal(voteHazard(state, 0, 'train'), false, 'still playing');
  assert.equal(voteHazard(state, 3, 'train'), false, 'not in the match');
  launchOut(state, state.fighters[2]);
  assert.equal(voteHazard(state, 2, 'wave'), false, 'the wave belongs to the beach');
  assert.equal(voteHazard(state, 2, 'nonsense'), false);
  assert.deepEqual(state.hazardVotes, {});
});

test('a tied hazard vote is decided at random between the tied hazards', () => {
  const picked = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const state = fight({ stage: 'beach', fighters: ['finance_bro', 'house_dj', 'surfer_girl', 'lisboa_og'], settings: { hazards: true, lives: 1 }, seed });
    launchOut(state, state.fighters[2]);
    launchOut(state, state.fighters[3]);
    voteHazard(state, 2, 'wave');
    voteHazard(state, 3, 'gulls');
    state.hazard.timer = 1;
    picked.add(of(run(state, 2), 'hazardWarn')[0].hazard);
  }
  assert.deepEqual([...picked].sort(), ['gulls', 'wave']);
});

test('hazards do not hit a freshly respawned (invincible) fighter', () => {
  const state = fight({ stage: 'beach', settings: { hazards: true } });
  const [a] = state.fighters;
  a.invincible = 100000;
  beginWarning(state, { id: 'wave', dir: 1 });
  pinned(state, [[a, 640, 600]], WARN_FRAMES + 200);
  assert.equal(a.percent, 0);
});
