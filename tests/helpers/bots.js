// Helpers for the bot tests and for tuning the bots: whole matches between bots,
// a standing opponent, or a scripted "simple human".
import { createMatch, step } from '../../src/game/match.js';
import { createBot, botInput } from '../../src/game/bot.js';
import { neutralInput } from '../../src/game/input.js';

// A match where the listed slots are played by bots; `others(state, slot)` plays the rest
// (standing still if not given). Returns the state after `frames` steps or at the end.
export function botMatch({ stage = 'campus', fighters = ['finance_bro', 'house_dj'], bots = [0, 1], settings = {}, seed = 5, frames = 60 * 60, others = null, onStep = null } = {}) {
  const players = fighters.map((fighterId, i) => ({ slot: i, name: `P${i + 1}`, fighterId }));
  const state = createMatch({ stageId: stage, players, settings: { items: false, hazards: false, ...settings }, seed });
  const brains = new Map(bots.map((slot) => [slot, createBot({ slot, level: 'medium', seed })]));
  for (let i = 0; i < frames && state.phase !== 'ended'; i++) {
    const inputs = {};
    for (const f of state.fighters) inputs[f.slot] = brains.has(f.slot) ? botInput(brains.get(f.slot), state) : others ? others(state, f.slot) : neutralInput();
    if (onStep) onStep(state, inputs, i);
    step(state, inputs);
  }
  return state;
}

// A sensible first-time player, scripted: walks to the opponent, jumps to reach a higher
// one, attacks in reach, gets back to the stage, and sees everything a quarter second late.
export function simpleHuman({ reaction = 15 } = {}) {
  const seen = [];
  let beat = 0;
  return (state, slot) => {
    seen.push(state.fighters.map((f) => ({ slot: f.slot, x: f.x, y: f.y, state: f.state })));
    if (seen.length > reaction + 1) seen.shift();
    const inp = neutralInput();
    beat += 1;
    const me = state.fighters.find((f) => f.slot === slot);
    if (me.state !== 'alive') return inp;
    const target = seen[0].find((f) => f.slot !== slot && f.state === 'alive');
    const ground = state.stage.platforms[0];
    const off = me.x < ground.x + 5 || me.x > ground.x + ground.w - 5;
    if (off) {
      inp.right = me.x < ground.x;
      inp.left = !inp.right;
      inp.jump = me.vy > 0 && beat % 8 < 2;
      return inp;
    }
    if (!target) return inp;
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    if (Math.abs(dx) > 60) {
      inp.right = dx > 0;
      inp.left = dx < 0;
      // Never walk off the main ground on purpose.
      if (me.y >= ground.y - 1 && (me.x + Math.sign(dx) * 40 < ground.x || me.x + Math.sign(dx) * 40 > ground.x + ground.w)) inp.left = inp.right = false;
    } else if (Math.sign(dx) !== me.facing) {
      inp.right = dx > 0;
      inp.left = dx < 0;
    }
    if (dy < -80 && me.onGround && beat % 20 < 2) inp.jump = true;
    if (dy < -80 && !me.onGround && me.vy > 0 && beat % 20 < 2) inp.jump = true;
    if (dy > 80 && me.onGround && beat % 30 < 2) inp.down = true;
    if (Math.abs(dx) < 100 && Math.abs(dy) < 60 && beat % 12 < 2) inp.attack = true;
    if (Math.abs(dx) < 60 && dy < -60 && dy > -170) {
      inp.up = true;
      if (beat % 12 < 2) inp.attack = true;
    }
    if (Math.abs(dx) < 200 && Math.abs(dy) < 60 && beat % 90 === 7) inp.special = true;
    return inp;
  };
}
