// Demo mode in the rules: the values come from DEMO_SETTINGS, the match ends at the time cap
// and the cap decides by lives left, then lower damage %, then damage dealt (docs/DEMO.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SETTINGS, FPS, demoFighters, demoMatchSettings, makeSettings } from '../../src/game/config.js';
import { FIGHTER_IDS } from '../../src/game/fighters.js';
import { fight, run, of, launchOut } from '../helpers/game.js';

const capFrames = () => demoMatchSettings().timeCapS * FPS;
const demoFight = (extra = {}, fighters) => fight({ fighters, settings: { ...demoMatchSettings({ items: false, hazards: false }), ...extra } });

function runToEnd(state, max) {
  for (let i = 0; i < max; i++) {
    const end = of(run(state, 1), 'matchEnd')[0];
    if (end) return end.result;
  }
  return null;
}

test('the demo values agreed on 2026-11-13 are in DEMO_SETTINGS', () => {
  assert.deepEqual(
    { lives: DEMO_SETTINGS.lives, timeCapS: DEMO_SETTINGS.timeCapS, hazardMinS: DEMO_SETTINGS.hazardMinS, hazardMaxS: DEMO_SETTINGS.hazardMaxS },
    { lives: 1, timeCapS: 120, hazardMinS: 5, hazardMaxS: 8 },
  );
  assert.deepEqual(DEMO_SETTINGS.fighters, ['maastricht_blondie', 'lisboa_og', 'finance_bro', 'surfer_girl']);
  const s = demoMatchSettings({ items: true, hazards: false });
  assert.deepEqual([s.lives, s.timeCapS, s.hazardMinS, s.hazardMaxS, s.items, s.hazards], [1, 120, 5, 8, true, false]);
});

test('a bad edit of DEMO_SETTINGS falls back safely', () => {
  const s = demoMatchSettings({}, { lives: 7, timeCapS: 'soon', hazardMinS: -1, hazardMaxS: NaN });
  assert.equal(s.lives, makeSettings().lives);
  assert.equal(s.timeCapS, 0, 'no usable cap means no cap, never a broken match');
  assert.deepEqual([s.hazardMinS, s.hazardMaxS], [makeSettings().hazardMinS, makeSettings().hazardMaxS]);
  assert.equal(demoMatchSettings({}, { ...DEMO_SETTINGS, lives: 2 }).lives, 2, 'lives 2 just works');
  assert.deepEqual(demoFighters(['surfer_girl', 'nobody', 'surfer_girl', 42]), ['surfer_girl']);
  assert.deepEqual(demoFighters(['nobody']), FIGHTER_IDS, 'an empty list means all fighters');
  assert.deepEqual(demoFighters('surfer_girl'), FIGHTER_IDS);
  assert.deepEqual(demoFighters(), DEMO_SETTINGS.fighters);
});

test('a demo match ends at 120 s of fighting with byTimeCap', () => {
  const state = demoFight();
  run(state, capFrames() - 1);
  assert.equal(state.phase, 'fight', 'still fighting one frame before the cap');
  const result = runToEnd(state, 1);
  assert.ok(result, 'ends on the frame the cap is reached');
  assert.equal(state.fightFrames, 120 * 60);
  assert.equal(result.byTimeCap, true);
  assert.equal(result.durationS, 120);
  assert.equal(result.lives, 1);
  assert.equal(result.players.filter((p) => p.endLives > 0).length, 2, 'both are still in the match');
});

test('at the cap more lives left wins (demo with lives 2)', () => {
  const state = demoFight({ lives: 2 });
  const [a, b] = state.fighters;
  launchOut(state, b); // b has 1 life left and comes back at 0 %
  a.percent = 150; // a keeps 2 lives but has far more damage
  const result = runToEnd(state, capFrames());
  assert.equal(result.byTimeCap, true);
  assert.equal(result.winner, a.slot);
  assert.deepEqual(result.players.map((p) => p.place), [1, 2]);
});

test('at the cap with equal lives the lower current damage % wins', () => {
  const state = demoFight();
  const [a, b] = state.fighters;
  a.percent = 90;
  b.percent = 30;
  a.stats.damageDealt = 500; // damage dealt only counts when the % is equal
  const result = runToEnd(state, capFrames());
  assert.equal(result.winner, b.slot);
});

test('at the cap with equal lives and equal % more damage dealt wins', () => {
  const state = demoFight({}, ['finance_bro', 'surfer_girl', 'lisboa_og']);
  const [a, b, c] = state.fighters;
  a.percent = b.percent = c.percent = 40;
  a.stats.damageDealt = 10;
  b.stats.damageDealt = 60;
  c.stats.damageDealt = 30;
  const result = runToEnd(state, capFrames());
  assert.deepEqual([b, c, a].map((f) => result.players.find((p) => p.slot === f.slot).place), [1, 2, 3]);
});

test('a fighter already out at the cap places below everyone still in the match', () => {
  const state = demoFight({}, ['finance_bro', 'surfer_girl', 'lisboa_og']);
  const [a, b, c] = state.fighters;
  launchOut(state, c); // 1 life: c is out
  a.percent = 10;
  b.percent = 20;
  const result = runToEnd(state, capFrames());
  assert.deepEqual([a, b, c].map((f) => result.players.find((p) => p.slot === f.slot).place), [1, 2, 3]);
});

test('demo hazards: the next warning comes 5 to 8 s after a hazard ends', () => {
  for (const stage of ['campus', 'beach', 'bairro']) {
    const state = fight({ stage, settings: { ...demoMatchSettings({ items: false, hazards: true }), timeCapS: 0 }, seed: 11 });
    let lastEnd = state.frame;
    let gaps = 0;
    for (let i = 0; i < 60 * 60 * 3; i++) {
      state.fighters.forEach((f, k) => Object.assign(f, { x: 500 + k * 200, y: -50, vy: 0, gravityScale: 0, percent: 0 }));
      for (const e of run(state, 1)) {
        if (e.type === 'hazardWarn') {
          const gap = state.frame - lastEnd;
          assert.ok(gap >= 5 * 60 && gap <= 8 * 60 + 1, `${stage}: gap ${gap} frames`);
          gaps += 1;
        }
        if (e.type === 'hazardEnd') lastEnd = state.frame;
      }
    }
    assert.ok(gaps >= 5, `${stage}: ${gaps} hazards in 3 minutes`);
  }
});

test('a normal match has no cap and keeps the normal hazard gap', () => {
  const s = makeSettings();
  assert.equal(s.timeCapS, 0);
  assert.deepEqual([s.hazardMinS, s.hazardMaxS], [10, 15]);
  const state = fight({ settings: { lives: 1 } });
  run(state, (DEMO_SETTINGS.timeCapS + 30) * FPS);
  assert.equal(state.phase, 'fight', 'still fighting after the demo cap');
  assert.equal(state.byTimeCap, false);
});
