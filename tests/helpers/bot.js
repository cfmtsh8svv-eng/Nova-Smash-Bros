// A very simple scripted player, used only by the tests to play whole matches.
// It is not part of the game (the game has no bots). Its choices depend only on
// the match state, so a match played by bots is fully repeatable.
import { neutralInput } from '../../src/game/input.js';

export function botInput(state, slot) {
  const me = state.fighters.find((f) => f.slot === slot);
  const inp = neutralInput();
  if (!me || me.state !== 'alive') return inp;
  const others = state.fighters.filter((f) => f.slot !== slot && f.state === 'alive');
  if (!others.length) return inp;
  const target = others.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
  const main = state.stage.platforms[0];
  const offStage = me.x < main.x + 10 || me.x > main.x + main.w - 10;
  const goal = offStage ? main.x + main.w / 2 : target.x;
  const dx = goal - me.x;
  const dy = target.y - me.y;
  if (Math.abs(dx) > 60 || offStage) {
    inp.left = dx < 0;
    inp.right = dx > 0;
  }
  const beat = (state.frame + slot * 7) % 24;
  if (offStage && me.vy > 0 && beat % 6 === 0) inp.jump = true;
  if (!offStage && dy < -70 && beat % 12 === 0) inp.jump = true;
  if (!offStage && dy > 70 && me.onGround && beat === 3) inp.down = true;
  // Go around when the target is on another level and straight below or above.
  if (!offStage && Math.abs(dy) > 70 && Math.abs(target.x - me.x) <= 60) {
    inp.left = (state.frame >> 7) % 2 === 0;
    inp.right = !inp.left;
  }
  if (!offStage && Math.abs(target.x - me.x) < 100 && Math.abs(dy) < 70) {
    inp.attack = beat % 12 < 2;
    inp.special = beat === 13;
  } else if (!offStage && Math.abs(target.x - me.x) < 260 && Math.abs(dy) < 70 && beat === 5) {
    inp.special = true;
  }
  if (!offStage && dy < -90 && Math.abs(target.x - me.x) < 50) {
    inp.up = true;
    inp.attack = beat % 12 < 2;
  }
  return inp;
}

export function botInputs(state) {
  const inputs = {};
  for (const f of state.fighters) inputs[f.slot] = botInput(state, f.slot);
  return inputs;
}
