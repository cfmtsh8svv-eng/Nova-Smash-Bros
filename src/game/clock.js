// The clock decides how many game frames to simulate for a stretch of real time.
//
// The rules always advance in the same fixed step (one frame = 1/60 s). Slow
// motion and hit pause do not change that step: they only change how many steps
// are taken per real second. So an effect can never change who wins.

import { FPS } from './config.js';

const STEP_MS = 1000 / FPS;
const MAX_STEPS = 5; // after a long stall (a hidden tab), catch up at most this much per call

export function createClock() {
  return { acc: 0, scale: 1, freezeMs: 0 };
}

// Stop the simulation for a moment (hit pause). The longest request wins.
export function freeze(clock, ms) {
  clock.freezeMs = Math.max(clock.freezeMs, ms);
}

// Returns the number of simulation steps to run for `realMs` of real time.
export function advance(clock, realMs) {
  let ms = Math.max(0, Math.min(realMs, 250));
  if (clock.freezeMs > 0) {
    const used = Math.min(clock.freezeMs, ms);
    clock.freezeMs -= used;
    ms -= used;
  }
  clock.acc += ms * clock.scale;
  let steps = Math.floor(clock.acc / STEP_MS);
  clock.acc -= steps * STEP_MS;
  if (steps > MAX_STEPS) {
    steps = MAX_STEPS;
    clock.acc = 0;
  }
  return steps;
}

// How far we are between two steps (0..1). The renderer could use it to interpolate.
export const alpha = (clock) => clock.acc / STEP_MS;
