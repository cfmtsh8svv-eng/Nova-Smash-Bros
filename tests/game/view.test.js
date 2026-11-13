// Points, damage colours and poses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPoints, PLACEMENT_POINTS } from '../../src/game/scoring.js';
import { damageColor, poseOf, hearts } from '../../src/game/view.js';
import { FIGHTERS } from '../../src/game/fighters.js';
import { STAGES } from '../../src/game/stages.js';
import { fight, place, run, tap } from '../helpers/game.js';

test('points: 100, 60, 40, 20 for the place plus 1 per 10 % damage dealt', () => {
  assert.deepEqual(PLACEMENT_POINTS, [100, 60, 40, 20]);
  assert.equal(matchPoints(1, 0), 100);
  assert.equal(matchPoints(1, 234), 123);
  assert.equal(matchPoints(2, 9), 60);
  assert.equal(matchPoints(3, 10), 41);
  assert.equal(matchPoints(4, 199), 39);
});

test('points: a place outside 1 to 4 or negative damage gives no bonus', () => {
  assert.equal(matchPoints(5, 100), 10);
  assert.equal(matchPoints(0, 0), 0);
  assert.equal(matchPoints(1, -50), 100);
});

test('damage colour: white at 0 %, yellow at 100 %, dark red at 200 %', () => {
  assert.equal(damageColor(0), '#ffffff');
  assert.equal(damageColor(100), '#f6c343');
  assert.equal(damageColor(200), '#b0151c');
  assert.equal(damageColor(999), '#b0151c');
  assert.equal(damageColor(-5), '#ffffff');
  assert.equal(damageColor('abc'), '#ffffff');
  assert.match(damageColor(150), /^#[0-9a-f]{6}$/);
  const red = (p) => parseInt(damageColor(p).slice(3, 5), 16); // the green channel falls as damage rises
  assert.ok(red(50) > red(120) && red(120) > red(180));
});

test('hearts show lives left and lives lost', () => {
  assert.equal(hearts(2, 3), '♥♥♡');
  assert.equal(hearts(0, 3), '♡♡♡');
  assert.equal(hearts(3, 3), '♥♥♥');
});

test('the pose follows what the fighter is doing', () => {
  const state = fight();
  const [a, b] = state.fighters;
  place(a, 400);
  place(b, 900);
  run(state, 2);
  assert.equal(poseOf(a), 'idle');
  run(state, 10, { 0: { right: true } });
  assert.ok(['run1', 'run2'].includes(poseOf(a)));
  tap(state, 0, { jump: true }, 3);
  assert.equal(poseOf(a), 'jump');
  run(state, 30);
  assert.equal(poseOf(a), 'fall');
  run(state, 40);
  tap(state, 0, { attack: true }, 3);
  assert.equal(poseOf(a), 'attack');
  run(state, 30);
  tap(state, 0, { special: true }, 3);
  assert.equal(poseOf(a), 'special');
  a.special = null;
  a.hitstun = 10;
  assert.equal(poseOf(a), 'hurt');
  a.state = 'dead';
  assert.equal(poseOf(a), 'ko');
});

test('the roster and the stages match the spec', () => {
  const table = Object.fromEntries(FIGHTERS.map((f) => [f.name, [f.weight, f.speed, f.normal, f.special.name]]));
  assert.deepEqual(table, {
    'Finance Bro': [100, 3, 'Laptop Swing', 'Cash Rain'],
    'Maastricht Blondie': [85, 4, 'Tote Bag Swing', 'Padel Smash'],
    'Bairro Chad': [120, 2, 'Beer Throw', "Round's On Me"],
    'Surfer Girl': [85, 5, 'Board Swipe', 'Wave Rider'],
    'Wannabe Influencer': [90, 4, 'Selfie Stick Poke', 'Ring Light Flash'],
    'House DJ': [100, 3, 'Vinyl Throw', 'Bass Drop'],
    'Lisboa OG': [115, 2, 'Sardine Slap', 'Ding-Ding'],
    'Carcavelos Gang Member': [100, 3, 'Pizza Throw', 'Spaghetti Lasso'],
  });
  assert.deepEqual(STAGES.map((s) => [s.name, s.platforms.length, s.hazards]), [
    ['Nova SBE Campus', 5, ['train', 'wifi', 'rain']],
    ['Carcavelos Beach', 5, ['wave', 'gulls', 'sun']],
    ['Bairro Alto', 6, ['crowd', 'drinks', 'fireworks']],
  ]);
  for (const stage of STAGES) {
    assert.equal(stage.platforms.filter((p) => p.solid).length, 1, 'one solid main ground');
    for (const spawn of stage.spawns) {
      assert.ok(stage.platforms.some((p) => p.y === spawn.y && spawn.x > p.x && spawn.x < p.x + p.w), 'spawns stand on a platform');
    }
  }
});

test('pause hint: "Press P or Esc to pause" under the main ground during the countdown and the fight, not in the final KO', async () => {
  const { PAUSE_HINT, pauseHint } = await import('../../src/game/view.js');
  assert.equal(PAUSE_HINT.text, 'Press P or Esc to pause');
  for (const stage of STAGES) {
    const ground = stage.platforms.find((p) => p.solid);
    assert.ok(PAUSE_HINT.y > ground.y + 60, `${stage.id}: below the standing line of the main ground`);
    for (const p of stage.platforms) assert.ok(PAUSE_HINT.y > p.y + 20, `${stage.id}: covers no platform`);
  }
  assert.ok(PAUSE_HINT.y < 720 && PAUSE_HINT.alpha > 0 && PAUSE_HINT.alpha < 1, 'on screen, semi-transparent');
  const state = fight();
  assert.equal(pauseHint(state), true);
  state.phase = 'countdown';
  assert.equal(pauseHint(state), true);
  for (const phase of ['finalKo', 'ended']) {
    state.phase = phase;
    assert.equal(pauseHint(state), false, phase);
  }
  assert.equal(pauseHint(null), false);
});

test('demo clock: m:ss of the fighting time left under the main ground; no pause hint in a demo match', async () => {
  const { CLOCK, PAUSE_HINT, matchClock, pauseHint } = await import('../../src/game/view.js');
  const { demoMatchSettings } = await import('../../src/game/config.js');
  assert.equal(CLOCK.y, PAUSE_HINT.y, 'in the place of the pause hint');
  const normal = fight();
  assert.equal(matchClock(normal), null, 'no clock in a normal match');
  const state = fight({ settings: demoMatchSettings({ items: false, hazards: false }) });
  assert.equal(pauseHint(state), false);
  assert.equal(matchClock(state), '2:00');
  run(state, 1);
  assert.equal(matchClock(state), '2:00', 'a started second still shows');
  run(state, 59);
  assert.equal(matchClock(state), '1:59');
  state.fightFrames = 120 * 60 - 61;
  assert.equal(matchClock(state), '0:02');
  state.fightFrames = 120 * 60 - 1;
  assert.equal(matchClock(state), '0:01');
  run(state, 1);
  assert.equal(state.phase, 'ended');
  assert.equal(matchClock(state), '0:00', '0:00 on the frame the match ends');
  // The clock follows fightFrames only: frames outside the fight do not count.
  const slow = fight({ settings: demoMatchSettings({ items: false, hazards: false }) });
  slow.phase = 'finalKo';
  slow.finalTimer = 30;
  run(slow, 10);
  assert.equal(matchClock(slow), '2:00');
});
