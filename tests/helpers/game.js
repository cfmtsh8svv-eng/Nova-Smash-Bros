// Shared helpers for the game tests.
import { createMatch, step } from '../../src/game/match.js';
import { neutralInput } from '../../src/game/input.js';

// A match that is already past the 3-2-1 countdown, with items and hazards off
// unless a test asks for them. Fighters stand on the main ground.
export function fight({ stage = 'campus', fighters = ['finance_bro', 'house_dj'], settings = {}, seed = 7 } = {}) {
  const players = fighters.map((fighterId, i) => ({ slot: i, name: `P${i + 1}`, fighterId }));
  const state = createMatch({ stageId: stage, players, settings: { items: false, hazards: false, ...settings }, seed });
  while (state.phase === 'countdown') step(state, {});
  return state;
}

// Put a fighter somewhere, standing still. y is the feet (600 = main ground).
export function place(f, x, y = 600) {
  Object.assign(f, { x, y, vx: 0, vy: 0, onGround: true, groundId: -1 });
  return f;
}

// Run `frames` frames. inputs is an object { slot: input } or a function (frameIndex) => that object.
export function run(state, frames, inputs = {}) {
  const events = [];
  for (let i = 0; i < frames; i++) events.push(...step(state, typeof inputs === 'function' ? inputs(i) : inputs));
  return events;
}

// Press buttons for one frame, then let go and keep running for `frames` frames in total.
export function tap(state, slot, buttons, frames = 1) {
  const pressed = { ...neutralInput(), ...buttons };
  return run(state, frames, (i) => (i === 0 ? { [slot]: pressed } : {}));
}

export const of = (events, type) => events.filter((e) => e.type === type);
export const feedbackFor = (events, kind) => of(events, 'feedback').filter((e) => e.kind === kind).map((e) => e.slot);

// Throw a fighter out of the screen so the next frame is a KO.
export function launchOut(state, f) {
  f.x = -1000;
  return step(state, {});
}

// Knock a fighter out `times` times, waiting for each respawn in between.
export function knockOutTimes(state, f, times) {
  const events = [];
  for (let i = 0; i < times; i++) {
    let guard = 0;
    while (f.state === 'dead' && guard++ < 1000) events.push(...step(state, {}));
    events.push(...launchOut(state, f));
  }
  return events;
}
