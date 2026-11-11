// Input: what a player is pressing, and how it travels from a phone to the game.
//
// A phone sends its whole button state as one small number (a bit mask) every
// time it changes. Messages arrive at any moment, but the game only looks once
// per frame. The InputBuffer sits in between and makes sure nothing is lost:
//  - a tap that starts and ends between two frames still counts once,
//  - two presses that arrive bunched together (a network hiccup) are played
//    back one per frame instead of melting into one.

export const BUTTONS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special'];
export const BIT = { left: 1, right: 2, up: 4, down: 8, attack: 16, jump: 32, special: 64 };
export const MAX_MASK = 127;
const ACTIONS = ['attack', 'jump', 'special'];
const MAX_QUEUED_PRESSES = 2;

export function neutralInput() {
  return { left: false, right: false, up: false, down: false, attack: false, jump: false, special: false };
}

export function encodeInput(input) {
  let mask = 0;
  for (const b of BUTTONS) if (input[b]) mask |= BIT[b];
  return mask;
}

export function decodeInput(mask) {
  const input = {};
  for (const b of BUTTONS) input[b] = (mask & BIT[b]) !== 0;
  return input;
}

export const isValidMask = (mask) => Number.isInteger(mask) && mask >= 0 && mask <= MAX_MASK;

export class InputBuffer {
  constructor() {
    this.reset();
  }

  // Forget everything: used when a phone disconnects, so its fighter stands still.
  reset() {
    this.held = neutralInput();
    this.tapped = neutralInput(); // went down since the last frame, even if already up again
    this.presses = { attack: 0, jump: 0, special: 0 }; // presses not yet played back
    this.lastSeq = -1;
  }

  // A message from the phone. seq is the phone's message counter: anything that
  // is not newer than the last one seen is ignored (a late duplicate after a reconnect).
  // (When a phone reconnects, the host resets this buffer, so its new counter starts fresh.)
  receive(mask, seq) {
    if (!isValidMask(mask)) return false;
    if (seq !== undefined) {
      if (!Number.isInteger(seq) || seq < 0) return false;
      if (seq <= this.lastSeq && seq !== 0) return false;
      this.lastSeq = seq;
    }
    const next = decodeInput(mask);
    for (const b of BUTTONS) {
      if (next[b] && !this.held[b]) {
        this.tapped[b] = true;
        if (b in this.presses) this.presses[b] = Math.min(MAX_QUEUED_PRESSES, this.presses[b] + 1);
      }
    }
    this.held = next;
    return true;
  }

  // Called once per simulated frame. Returns the input for that frame.
  // attackP / jumpP / specialP are true only on the frame a press is played.
  consume() {
    const out = {};
    for (const b of BUTTONS) out[b] = this.held[b] || this.tapped[b];
    for (const a of ACTIONS) {
      out[a + 'P'] = this.presses[a] > 0;
      if (this.presses[a] > 0) this.presses[a] -= 1;
    }
    this.tapped = neutralInput();
    return out;
  }
}

// The game reads the "pressed this frame" flags if they are given (from the
// InputBuffer) and otherwise works them out by comparing with the last frame.
export function withPresses(input, previous) {
  const inp = { ...neutralInput(), ...input };
  for (const a of ACTIONS) {
    if (typeof inp[a + 'P'] !== 'boolean') inp[a + 'P'] = inp[a] && !previous[a];
  }
  inp.downP = inp.down && !previous.down;
  inp.leftP = inp.left && !previous.left;
  inp.rightP = inp.right && !previous.right;
  return inp;
}
