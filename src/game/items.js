// The nine items (GAME_SPEC §7.3, D-140 to D-142). A new one appears on a random
// platform every 6 to 10 seconds, never more than four at once. Three are used at
// once on touch (Pastel de Nata, Bifana, Lucky Rooster); the others are held, one at
// a time, and change the next attacks. The Group Project is forced on whoever
// touches it and explodes when its fuse runs out.
import { CONFIG, seconds } from './config.js';
import { applyHit, effectiveWeight, feedback, hurtbox, rectsOverlap } from './combat.js';
import { nextRandom, pick, randomBetween } from './rng.js';

export { effectiveWeight };
export const ITEM_TYPES = ['nata', 'sardine', 'book', 'project', 'bifana', 'megaphone', 'cork', 'azulejo', 'rooster'];
export const ITEM_NAMES = {
  nata: 'Pastel de Nata', sardine: 'Sardine', book: 'Book', project: 'Group Project', bifana: 'Bifana',
  megaphone: 'Megaphone', cork: 'Cork Shield', azulejo: 'Azulejo', rooster: 'Lucky Rooster',
};
export const ITEM_WEIGHTS = CONFIG.items.weights;
const ON_TOUCH = ['nata', 'bifana', 'rooster'];
export const PICKUP_TEXT = {
  nata: 'Pastel de nata! 20 % healed.',
  sardine: 'Sardine! Your next 5 attacks hit hard.',
  book: 'Book! Your next attack throws it.',
  project: 'Group project! Pass it on before the deadline!',
  bifana: 'Bifana! You are heavier for 10 s.',
  megaphone: 'Megaphone! Your next 3 attacks are a sound blast.',
  cork: 'Cork shield! It blocks the next hit.',
  azulejo: 'Azulejo! Your next attack throws the tile.',
  rooster: 'Lucky rooster! Invincible for 5 s.',
};
const FLASH = { nata: '#22a36b', project: '#e63946', rooster: '#f6c343' };

export const nextItemDelay = (state) => seconds(randomBetween(state, CONFIG.items.spawnMinS, CONFIG.items.spawnMaxS));
export const itemBox = (item) => ({ x: item.x - CONFIG.items.size / 2, y: item.y - CONFIG.items.size, w: CONFIG.items.size, h: CONFIG.items.size });

// A kind of item, by the weighted chances (from the match's seeded random numbers).
export function pickItemType(state) {
  let r = nextRandom(state) * ITEM_TYPES.reduce((sum, t) => sum + ITEM_WEIGHTS[t], 0);
  for (const type of ITEM_TYPES) {
    r -= ITEM_WEIGHTS[type];
    if (r < 0) return type;
  }
  return ITEM_TYPES[ITEM_TYPES.length - 1];
}

// `held` keeps the state of a held item that was dropped (its uses), so it is the same item when taken again.
export function spawnItem(state, type, x, y, { held = null, force = false } = {}) {
  if (!force && state.items.length >= CONFIG.items.max) return null;
  state.nextId += 1;
  const item = { id: state.nextId, type, x, y, age: 0, held };
  state.items.push(item);
  state.events.push({ type: 'itemSpawn', id: item.id, item: type, x, y });
  return item;
}

function spawnRandomItem(state) {
  const platform = pick(state, state.stage.platforms);
  const x = platform.x + 30 + randomBetween(state, 0, Math.max(1, platform.w - 60));
  return spawnItem(state, pickItemType(state), Math.round(x), platform.y);
}

// What a held item looks like in the hands when it is taken from the ground.
function freshHeld(type) {
  const I = CONFIG.items;
  if (type === 'sardine') return { type, uses: I.sardineSwings };
  if (type === 'megaphone') return { type, uses: I.megaphone.uses };
  if (type === 'project') return { type, fuse: I.project.fuseFrames, from: null };
  return { type, uses: 1 };
}

// The held item falls to the ground at the fighter's feet: on the platform below them, if there is one.
function dropHeld(state, f) {
  const held = f.held;
  f.held = null;
  if (!held) return;
  const below = state.stage.platforms
    .filter((p) => f.x >= p.x && f.x <= p.x + p.w && p.y >= f.y - 1)
    .sort((a, b) => a.y - b.y)[0];
  state.events.push({ type: 'itemDrop', slot: f.slot, item: held.type, x: f.x, y: below ? below.y : f.y });
  if (below) spawnItem(state, held.type, Math.round(f.x), below.y, { held, force: true });
}

// What happens when fighter f touches an item. Returns true if it was taken.
export function pickUp(state, f, item) {
  const I = CONFIG.items;
  const type = item.type;
  if (type === 'nata') {
    f.percent = Math.max(0, f.percent - I.nataHeal); // never heals below 0 %
  } else if (type === 'bifana') {
    f.bifana = I.bifana.frames;
  } else if (type === 'rooster') {
    f.rooster = I.rooster.frames;
  } else if (type === 'project') {
    // Forced: taken even with full hands. Whatever was held before drops to the ground.
    if (f.held) dropHeld(state, f);
    // The fuse starts at the first pick-up and never resets.
    f.held = item.held && item.held.type === 'project' ? item.held : freshHeld(type);
  } else if (f.held) {
    return false; // hands are full: the item stays on the ground
  } else {
    f.held = item.held && item.held.type === type ? item.held : freshHeld(type);
  }
  state.events.push({ type: 'itemPickup', slot: f.slot, item: type, x: item.x, y: item.y });
  feedback(state, f.slot, 'good', PICKUP_TEXT[type], FLASH[type] || '#22a36b', { item: type });
  return ON_TOUCH.includes(type) || Boolean(f.held);
}

// A normal attack (or a stomp) that hit `target` passes a Group Project on (D-140).
export function passProject(state, from, target) {
  if (!from.held || from.held.type !== 'project' || target.state !== 'alive') return false;
  const project = from.held;
  from.held = null;
  if (target.held) dropHeld(state, target);
  project.from = from.slot;
  target.held = project;
  state.events.push({ type: 'itemPass', item: 'project', from: from.slot, to: target.slot, x: target.x, y: target.y });
  feedback(state, target.slot, 'hazard', PICKUP_TEXT.project, '#e63946', { item: 'project' });
  return true;
}

// The fuse of a held Group Project burns down; at zero it explodes on the holder.
export function burnFuse(state, f) {
  const held = f.held;
  if (!held || held.type !== 'project') return;
  held.fuse -= 1;
  if (held.fuse > 0) return;
  f.held = null;
  const P = CONFIG.items.project;
  state.events.push({ type: 'fx', fx: 'project', x: f.x, y: f.y - CONFIG.body.h / 2, slot: f.slot });
  const result = applyHit(state, f, {
    by: held.from ?? null, kind: 'item', source: 'project', damage: P.damage, baseKb: P.baseKb, kbGrowth: P.kbGrowth, angleDeg: P.angleDeg, dirX: f.facing,
  });
  if (result === 1) feedback(state, f.slot, 'hazard', 'Deadline missed! The group project blew up.', '#e63946', { item: 'project' });
}

export function updateItems(state) {
  if (state.settings.items) {
    state.itemTimer -= 1;
    if (state.itemTimer <= 0) {
      spawnRandomItem(state); // with four items lying there already, this turn is skipped
      state.itemTimer = nextItemDelay(state);
    }
  }
  const kept = [];
  const before = [...state.items];
  for (const item of before) {
    item.age += 1;
    let taken = item.age > CONFIG.items.lifetime;
    if (!taken && item.age >= CONFIG.items.spawnInFrames) {
      const box = itemBox(item);
      for (const f of state.fighters) {
        if (f.state !== 'alive' || !rectsOverlap(box, hurtbox(f))) continue;
        if (pickUp(state, f, item)) {
          taken = true;
          break;
        }
      }
    }
    if (!taken) kept.push(item);
  }
  // An item dropped in this frame (a Group Project forced on someone) stays too.
  state.items = [...kept, ...state.items.filter((item) => !before.includes(item))];
}
