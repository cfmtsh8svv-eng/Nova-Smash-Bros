// The loop that drives a match in real time. The host page calls tick() once per
// screen refresh; the tests call it with made-up times.
//
// It owns the clock and the two effects that play with time:
//   - hit pause: a strong hit freezes the game for a few hundredths of a second,
//   - final KO:  the last KO runs in slow motion for two seconds.
// Both only change WHEN the next step happens. The steps themselves, and so the
// result of the match, are exactly the same with or without them.
import { CONFIG } from './config.js';
import { advance, createClock, freeze } from './clock.js';
import { step } from './match.js';

export const HIT_PAUSE_MS = CONFIG.match.hitPauseMs;

// getInputs(state) returns { slot: input } for the next step.
// onEvent(event, state) is called for everything that happens.
export function createLoop({ state, getInputs, onEvent = () => {}, effects = true }) {
  const clock = createClock();
  const loop = { state, clock, paused: false, steps: 0, slowMs: 0 };

  loop.tick = (realMs) => {
    if (loop.paused || state.phase === 'ended') return 0;
    clock.scale = effects && state.phase === 'finalKo' ? CONFIG.match.finalKoTimeScale : 1;
    if (state.phase === 'finalKo' && Number.isFinite(realMs)) loop.slowMs += Math.max(0, Math.min(realMs, 250));
    const steps = effects ? advance(clock, realMs) : 1;
    let done = 0;
    for (let i = 0; i < steps && state.phase !== 'ended'; i++) {
      const events = step(state, getInputs(state));
      done += 1;
      loop.steps += 1;
      for (const event of events) {
        if (effects) {
          if (event.type === 'ko') freeze(clock, HIT_PAUSE_MS.ko);
          else if (event.type === 'hit') freeze(clock, event.strong ? HIT_PAUSE_MS.strong : HIT_PAUSE_MS.normal);
        }
        onEvent(event, state);
      }
      // A freeze or the start of the slow motion takes effect at once, not after the remaining steps.
      if (effects && (clock.freezeMs > 0 || state.phase === 'finalKo')) break;
    }
    return done;
  };
  return loop;
}
