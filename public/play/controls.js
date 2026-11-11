// The two control modes of the phone: a D-pad and a floating joystick.
// Both produce the same input state (left, right, up, down, attack, jump, special),
// so the rest of the game does not know which one is in use.
//
// Touches are handled with Pointer Events. Every finger is tracked on its own,
// so holding a direction with the left thumb while tapping Jump or Attack with
// the right one works.
import { neutralInput } from '/game/input.js';

// Joystick tuning, in CSS pixels. The team can adjust these after playtesting.
export const STICK = {
  deadZone: 14, // inside this distance from where the thumb landed nothing happens
  upAt: 30, // push this far up to look up
  downAt: 30, // ... and this far down to drop
  knobTravel: 56, // how far the knob follows the thumb on screen
};

export function createControls({ root, dpad, stickZone, ring, knob, onChange }) {
  let mode = 'dpad';
  let state = neutralInput();
  const pointers = new Map(); // pointerId -> { kind: 'key' | 'stick', buttons: [...], group, ox, oy }

  function publish() {
    const next = neutralInput();
    for (const p of pointers.values()) for (const b of p.buttons) next[b] = true;
    let changed = false;
    for (const key of Object.keys(next)) if (next[key] !== state[key]) changed = true;
    state = next;
    for (const key of root.querySelectorAll('.key')) key.classList.toggle('down', Boolean(state[key.dataset.b]));
    if (changed) onChange({ ...state });
  }

  const keyAt = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    return hit && hit.closest ? hit.closest('.key') : null;
  };

  function stickButtons(p, x, y) {
    const dx = x - p.ox;
    const dy = y - p.oy;
    const buttons = [];
    if (Math.hypot(dx, dy) >= STICK.deadZone) {
      if (dx <= -STICK.deadZone) buttons.push('left');
      if (dx >= STICK.deadZone) buttons.push('right');
      if (dy <= -STICK.upAt) buttons.push('up');
      if (dy >= STICK.downAt) buttons.push('down');
    }
    const length = Math.hypot(dx, dy) || 1;
    const reach = Math.min(length, STICK.knobTravel);
    const box = stickZone.getBoundingClientRect();
    knob.style.left = `${p.ox - box.left + (dx / length) * reach}px`;
    knob.style.top = `${p.oy - box.top + (dy / length) * reach}px`;
    return buttons;
  }

  function down(event) {
    event.preventDefault();
    if (pointers.has(event.pointerId)) return;
    const key = event.target.closest ? event.target.closest('.key') : null;
    if (key && root.contains(key)) {
      pointers.set(event.pointerId, { kind: 'key', buttons: [key.dataset.b], group: key.parentElement === dpad ? 'dpad' : 'action' });
    } else if (mode === 'stick' && stickZone.contains(event.target)) {
      // The joystick appears where the thumb lands. Only one finger steers.
      if ([...pointers.values()].some((p) => p.kind === 'stick')) return;
      const box = stickZone.getBoundingClientRect();
      const p = { kind: 'stick', buttons: [], ox: event.clientX, oy: event.clientY };
      pointers.set(event.pointerId, p);
      ring.hidden = false;
      knob.hidden = false;
      ring.style.left = `${p.ox - box.left}px`;
      ring.style.top = `${p.oy - box.top}px`;
      stickButtons(p, event.clientX, event.clientY);
    } else {
      return;
    }
    try {
      root.setPointerCapture(event.pointerId); // keep getting this finger's moves, wherever it goes
    } catch { /* not supported: moves still arrive while the finger is over the pad */ }
    publish();
  }

  function move(event) {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    event.preventDefault();
    if (p.kind === 'stick') {
      p.buttons = stickButtons(p, event.clientX, event.clientY);
    } else if (p.group === 'dpad') {
      // Sliding the thumb from one arrow to the next changes direction without lifting it.
      const key = keyAt(event.clientX, event.clientY);
      if (key && key.parentElement === dpad) p.buttons = [key.dataset.b];
    }
    publish();
  }

  function up(event) {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    pointers.delete(event.pointerId);
    if (p.kind === 'stick') {
      ring.hidden = true;
      knob.hidden = true;
    }
    publish();
  }

  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(type, up);
  // No long-press menu, no text selection, no pinch zoom, no double-tap zoom on the pad.
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'dblclick']) {
    root.addEventListener(type, (e) => e.preventDefault());
  }
  for (const type of ['touchstart', 'touchmove', 'touchend']) root.addEventListener(type, (e) => e.preventDefault(), { passive: false });

  function releaseAll() {
    pointers.clear();
    ring.hidden = true;
    knob.hidden = true;
    publish();
  }
  // A finger that is still down when the page goes to the background would stick otherwise.
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  return {
    get state() { return { ...state }; },
    get mode() { return mode; },
    setMode(next) {
      mode = next === 'stick' ? 'stick' : 'dpad';
      dpad.hidden = mode !== 'dpad';
      stickZone.hidden = mode !== 'stick';
      releaseAll();
    },
    releaseAll,
  };
}
