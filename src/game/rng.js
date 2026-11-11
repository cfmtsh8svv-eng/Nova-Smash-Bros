// A small seeded random number generator (mulberry32).
// The game never calls Math.random: all chance comes from the match state's seed,
// so the same seed and the same inputs always give the same match. That is what
// makes the rules testable.

export function nextRandom(state) {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randomBetween = (state, min, max) => min + nextRandom(state) * (max - min);
export const randomInt = (state, min, max) => Math.floor(randomBetween(state, min, max + 1));
export const pick = (state, list) => list[Math.floor(nextRandom(state) * list.length)];
