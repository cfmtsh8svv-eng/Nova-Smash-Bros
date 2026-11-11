// Keyboard controls for up to two players on the host page, so the game can be
// developed and shown without phones. Keys are read by position (event.code),
// so they sit in the same place on every keyboard layout.
import { neutralInput } from '/game/input.js';

export const KEYMAPS = [
  { name: 'KEY 1', hint: 'W A S D · F attack · G jump · H special', keys: { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'attack', KeyG: 'jump', KeyH: 'special' } },
  { name: 'KEY 2', hint: 'Arrows · I attack · O jump · P special', keys: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyI: 'attack', KeyO: 'jump', KeyP: 'special' } },
];

export function createKeyboard() {
  const held = [neutralInput(), neutralInput()];
  const tapped = [neutralInput(), neutralInput()]; // pressed since the last frame, even if released again
  let enabled = false;

  function onKey(event, down) {
    if (!enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    for (let i = 0; i < KEYMAPS.length; i++) {
      const button = KEYMAPS[i].keys[event.code];
      if (!button) continue;
      event.preventDefault();
      if (down && !held[i][button]) tapped[i][button] = true;
      held[i][button] = down;
    }
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => held.forEach((h, i) => { held[i] = neutralInput(); }));

  return {
    setEnabled(value) {
      enabled = value;
      if (!value) for (let i = 0; i < held.length; i++) { held[i] = neutralInput(); tapped[i] = neutralInput(); }
    },
    // The input of keyboard player i for this frame.
    read(i) {
      const out = {};
      for (const key of Object.keys(held[i])) out[key] = held[i][key] || tapped[i][key];
      tapped[i] = neutralInput();
      return out;
    },
  };
}
