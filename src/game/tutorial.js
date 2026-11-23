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

// Specials are ready when free practice starts. A special that is still running then
// (often the one that just finished the last step) plays out: everyone is protected anyway.
function resetCooldowns(state) {
  for (const f of state.fighters) f.cooldown = 0;
}

// A protected fighter who falls out goes back to their spawn point without losing a life.
export function returnToSpawn(state, f) {
  const spawn = state.stage.spawns[state.fighters.indexOf(f)];
  Object.assign(f, { x: spawn.x, y: spawn.y, vx: 0, vy: 0, onGround: true, groundId: 0, jumpsLeft: 1, attack: null, special: null, pull: null, hang: null, ledgeUsed: false });
}

// Below the top of the main ground and beside it: this fighter is on the way out.
function fallingOut(state, f) {
  const ground = state.stage.platforms.find((p) => p.solid);
  return Boolean(ground) && f.state === 'alive' && f.y > ground.y && (f.x < ground.x || f.x > ground.x + ground.w);
}

// When protection ends, nothing from practice may carry into the fight: no attack, special
// or projectile that could still hit, and no fall that began while falls were safe.
function endPractice(state) {
  state.projectiles = [];
  for (const f of state.fighters) {
    clearFighterEffects(f);
    f.cooldown = 0;
    if (fallingOut(state, f)) returnToSpawn(state, f);
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
      endPractice(state);
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
    if (t.step === 4) resetCooldowns(state);
  }
}

export const tutorialSeconds = (t) => t.step === 4 ? Math.max(0, Math.ceil((CONFIG.match.tutorialPracticeFrames - t.practiceFrames) / FPS)) : 0;
