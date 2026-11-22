// Shared practice phase. Progress comes from the real inputs, never a client-side timer.
import { CONFIG, FPS } from './config.js';
import { clearFighterEffects } from './combat.js';

export const TUTORIAL_STEPS = [
  { key: 'move', title: 'Try the joystick', text: 'Put your thumb on the left side. Drag left, then right.', target: 'stickZone' },
  { key: 'jump', title: 'Press J to jump', text: 'Tap J on your phone. Tap again in the air for a double jump.', target: 'jump' },
  { key: 'attack', title: 'Press A to attack', text: 'Tap A to attack. In the air, A stomps; hold the joystick up to attack upward.', target: 'attack' },
  { key: 'special', title: 'Press S for your special', text: 'Tap S to try your fighter’s special. The yellow bar shows when it is ready again.', target: 'special' },
  { key: 'practice', title: 'Free practice', text: 'Try moving, jumping, A and S. No one can deal or take damage.', target: null },
];

export function createTutorial(players, enabled) {
  return enabled ? { step: 0, frames: 0, practiceFrames: 0, active: true, progress: Object.fromEntries(players.filter((p) => !p.bot).map((p) => [p.slot, 0])), left: [], right: [] } : null;
}

// Trial attacks must not survive the transition into practice or the real fight.
function clearTrialAttacks(state) {
  state.projectiles = [];
  for (const f of state.fighters) {
    clearFighterEffects(f);
    f.cooldown = 0;
  }
}

export function updateTutorial(state) {
  const t = state.tutorial;
  if (!t?.active) return;
  t.frames += 1;
  const humans = state.fighters.filter((f) => !f.bot && f.connected);
  if (t.step === 4) {
    t.practiceFrames += 1;
    if (t.practiceFrames >= CONFIG.match.tutorialPracticeFrames) {
      clearTrialAttacks(state);
      t.active = false;
      for (const f of state.fighters) f.tutorialProtected = false;
      // Only accounts that actually performed every step count as having finished.
      state.events.push({ type: 'tutorialEnd', slots: humans.filter((f) => t.progress[f.slot] === 15).map((f) => f.slot) });
    }
    return;
  }
  for (const f of humans) {
    const inp = f.lastInput;
    if (t.step === 0) {
      if (inp.left && !inp.right && !t.left.includes(f.slot)) t.left.push(f.slot);
      if (inp.right && !inp.left && !t.right.includes(f.slot)) t.right.push(f.slot);
      if (t.left.includes(f.slot) && t.right.includes(f.slot)) t.progress[f.slot] |= 1;
    } else if (t.step < 4 && inp[TUTORIAL_STEPS[t.step].key + 'P']) t.progress[f.slot] |= 1 << t.step;
  }
  if (humans.length && humans.every((f) => t.progress[f.slot] & (1 << t.step))) {
    t.step += 1;
    if (t.step === 4) clearTrialAttacks(state);
  }
}

export const tutorialSeconds = (t) => t.step === 4 ? Math.max(0, Math.ceil((CONFIG.match.tutorialPracticeFrames - t.practiceFrames) / FPS)) : 0;
