// The input buffer between the phones and the game, and the clock that drives the simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputBuffer, encodeInput, decodeInput, isValidMask, neutralInput, BIT, MAX_MASK } from '../../src/game/input.js';
import { createClock, advance, freeze } from '../../src/game/clock.js';
import { CONFIG } from '../../src/game/config.js';
import { step, buildResult } from '../../src/game/match.js';
import { fight, place, run, of } from '../helpers/game.js';
import { botInputs } from '../helpers/bot.js';

test('input state survives the trip through the bit mask', () => {
  for (let mask = 0; mask <= MAX_MASK; mask++) assert.equal(encodeInput(decodeInput(mask)), mask);
  assert.equal(encodeInput({ ...neutralInput(), right: true, jump: true }), BIT.right | BIT.jump);
});

test('masks that are not whole numbers from 0 to 127 are rejected', () => {
  for (const bad of [-1, 128, 1.5, '3', null, undefined, NaN, Infinity, {}, [1]]) {
    assert.equal(isValidMask(bad), false, String(bad));
    const buffer = new InputBuffer();
    assert.equal(buffer.receive(bad, 1), false);
    assert.deepEqual(buffer.consume(), { ...neutralInput(), attackP: false, jumpP: false, specialP: false });
  }
});

test('a tap shorter than one frame still registers exactly once', () => {
  const buffer = new InputBuffer();
  buffer.receive(BIT.attack, 1); // finger down ...
  buffer.receive(0, 2); // ... and up again before the game looked
  const first = buffer.consume();
  assert.equal(first.attack, true);
  assert.equal(first.attackP, true);
  const second = buffer.consume();
  assert.equal(second.attack, false);
  assert.equal(second.attackP, false);
});

test('a short tap on a direction moves the fighter for one frame', () => {
  const buffer = new InputBuffer();
  buffer.receive(BIT.left, 1);
  buffer.receive(0, 2);
  assert.equal(buffer.consume().left, true);
  assert.equal(buffer.consume().left, false);
});

test('a short tap really makes the fighter attack in the game', () => {
  const state = fight();
  place(state.fighters[0], 400);
  const buffer = new InputBuffer();
  buffer.receive(BIT.attack, 1);
  buffer.receive(0, 2);
  const events = [...step(state, { 0: buffer.consume() }), ...step(state, { 0: buffer.consume() })];
  assert.equal(of(events, 'attack').length, 1);
});

test('holding a button is one press, not one per frame', () => {
  const buffer = new InputBuffer();
  buffer.receive(BIT.jump, 1);
  const presses = [buffer.consume(), buffer.consume(), buffer.consume()].map((i) => i.jumpP);
  assert.deepEqual(presses, [true, false, false]);
  buffer.receive(BIT.jump, 2); // heartbeat with the same state
  assert.equal(buffer.consume().jumpP, false);
  assert.equal(buffer.consume().jump, true);
});

test('two presses that arrive bunched together are played on two frames', () => {
  const buffer = new InputBuffer();
  for (const [mask, seq] of [[BIT.jump, 1], [0, 2], [BIT.jump, 3], [0, 4]]) buffer.receive(mask, seq);
  assert.deepEqual([buffer.consume().jumpP, buffer.consume().jumpP, buffer.consume().jumpP], [true, true, false]);
});

test('a flood of presses is capped and cannot queue up forever', () => {
  const buffer = new InputBuffer();
  for (let i = 0; i < 100; i++) buffer.receive(i % 2 ? 0 : BIT.attack, i + 1);
  let presses = 0;
  for (let i = 0; i < 50; i++) if (buffer.consume().attackP) presses += 1;
  assert.equal(presses, 2);
});

test('old or repeated messages are ignored, a restarted phone is accepted', () => {
  const buffer = new InputBuffer();
  assert.equal(buffer.receive(BIT.right, 5), true);
  assert.equal(buffer.receive(BIT.left, 4), false, 'older than the last one');
  assert.equal(buffer.receive(BIT.left, 5), false, 'a duplicate');
  assert.equal(buffer.consume().right, true);
  assert.equal(buffer.receive(BIT.left, 0), true, 'the phone reloaded and counts from 0');
  assert.equal(buffer.consume().left, true);
});

test('reset lets go of everything (a phone that disconnected)', () => {
  const buffer = new InputBuffer();
  buffer.receive(BIT.right | BIT.attack, 1);
  buffer.reset();
  assert.deepEqual(buffer.consume(), { ...neutralInput(), attackP: false, jumpP: false, specialP: false });
});

// ---- the clock ----

test('the clock turns real time into whole 60 Hz steps and keeps the remainder', () => {
  const clock = createClock();
  assert.equal(advance(clock, 16.7), 1);
  assert.equal(advance(clock, 8), 0);
  assert.equal(advance(clock, 9), 1);
  let steps = 0;
  const c2 = createClock();
  for (let i = 0; i < 1000; i++) steps += advance(c2, 1);
  assert.equal(steps, 59, 'one second of 1 ms ticks is 59 or 60 whole steps');
});

test('slow motion takes fewer steps per second, a freeze takes none', () => {
  const clock = createClock();
  clock.scale = CONFIG.match.finalKoTimeScale;
  let steps = 0;
  for (let i = 0; i < 120; i++) steps += advance(clock, 1000 / 60);
  assert.ok(steps >= 29 && steps <= 30, `2 s at quarter speed = ${steps} steps`);

  const frozen = createClock();
  freeze(frozen, 100);
  assert.equal(advance(frozen, 50), 0);
  assert.equal(advance(frozen, 50), 0);
  assert.equal(advance(frozen, 17), 1);
});

test('a long stall does not make the game race to catch up', () => {
  const clock = createClock();
  assert.ok(advance(clock, 5000) <= 5);
  assert.equal(advance(clock, 0), 0);
  assert.equal(advance(clock, -5), 0);
});

// ---- the final KO effect must not change the result ----

// Play a whole match with scripted players. With effects on, the loop runs like the
// host page: real time goes through the clock, hits freeze it and the final KO slows it.
function playMatch({ effects, seed }) {
  const state = fight({ fighters: ['finance_bro', 'surfer_girl', 'house_dj'], settings: { items: true, hazards: true, lives: 2 }, seed });
  const clock = createClock();
  let realMs = 0;
  let slowMs = 0;
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 60 * 60 * 30) {
    let steps = 1;
    if (effects) {
      clock.scale = state.phase === 'finalKo' ? CONFIG.match.finalKoTimeScale : 1;
      const dt = 1000 / 60 + ((guard * 7) % 5) - 2; // an uneven frame rate
      realMs += dt;
      if (state.phase === 'finalKo') slowMs += dt;
      steps = advance(clock, dt);
    }
    for (let i = 0; i < steps && state.phase !== 'ended'; i++) {
      for (const e of step(state, botInputs(state))) if (effects && e.type === 'hit' && e.strong) freeze(clock, 80);
    }
  }
  return { result: buildResult(state), phase: state.phase, frames: state.frame, slowMs };
}

test('a match ends with the same winner and the same numbers with and without slow motion and hit pause', () => {
  let finished = 0;
  for (const seed of [3, 8, 21, 34]) {
    const plain = playMatch({ effects: false, seed });
    const fancy = playMatch({ effects: true, seed });
    assert.equal(plain.phase, 'ended', `seed ${seed} finished`);
    assert.deepEqual(fancy.result, plain.result, `seed ${seed}`);
    assert.equal(fancy.frames, plain.frames, 'the same number of simulated frames');
    assert.ok(plain.result.winner !== null);
    assert.ok(Math.abs(fancy.slowMs - CONFIG.match.finalKoRealSeconds * 1000) < 120, `slow motion lasted ${fancy.slowMs} ms`);
    finished += 1;
  }
  assert.equal(finished, 4);
});

test('the same seed and inputs always give the same match; another seed gives another one', () => {
  const a = playMatch({ effects: false, seed: 8 });
  const b = playMatch({ effects: false, seed: 8 });
  const c = playMatch({ effects: false, seed: 9 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.result, c.result);
});

test('the final KO slow motion is 2 s of real time at quarter speed', () => {
  const state = fight({ settings: { lives: 1 } });
  state.fighters[1].x = -1000;
  const events = step(state, {});
  assert.equal(of(events, 'finalKo').length, 1);
  assert.equal(state.finalTimer, 30);
  assert.equal(state.finalTimer / 60 / CONFIG.match.finalKoTimeScale, 2);
  assert.equal(of(run(state, 30), 'matchEnd').length, 1);
});
