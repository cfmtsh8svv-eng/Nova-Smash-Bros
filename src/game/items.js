// The four items. They appear on a random platform every 12 to 20 seconds,
// never more than three at once, and are picked up by touching them.
import { CONFIG, seconds } from './config.js';
import { feedback, hurtbox, rectsOverlap } from './combat.js';
import { pick, randomBetween } from './rng.js';

export const ITEM_TYPES = ['tart', 'espresso', 'sardine', 'book'];
export const ITEM_NAMES = { tart: 'Custard Tart', espresso: 'Espresso', sardine: 'Sardine', book: 'Book' };
const PICKUP_TEXT = {
  tart: 'Custard tart! 20 % healed.',
  espresso: 'Espresso! 30 % faster for 8 s.',
  sardine: 'Sardine! Your next 5 attacks hit hard.',
  book: 'Book! Your next attack throws it.',
};

export const nextItemDelay = (state) => seconds(randomBetween(state, CONFIG.items.spawnMinS, CONFIG.items.spawnMaxS));
export const itemBox = (item) => ({ x: item.x - CONFIG.items.size / 2, y: item.y - CONFIG.items.size, w: CONFIG.items.size, h: CONFIG.items.size });

export function spawnItem(state, type, x, y) {
  if (state.items.length >= CONFIG.items.max) return null;
  state.nextId += 1;
  const item = { id: state.nextId, type, x, y, age: 0 };
  state.items.push(item);
  state.events.push({ type: 'itemSpawn', id: item.id, item: type, x, y });
  return item;
}

function spawnRandomItem(state) {
  const platform = pick(state, state.stage.platforms);
  const x = platform.x + 30 + randomBetween(state, 0, Math.max(1, platform.w - 60));
  return spawnItem(state, pick(state, ITEM_TYPES), Math.round(x), platform.y);
}

// What happens when fighter f touches an item. Returns true if it was taken.
export function pickUp(state, f, item) {
  const I = CONFIG.items;
  if (item.type === 'tart') {
    f.percent = Math.max(0, f.percent - I.tartHeal); // never heals below 0 %
  } else if (item.type === 'espresso') {
    f.speedBoost = I.espressoFrames;
  } else if (f.held) {
    return false; // hands are full: the sardine or book stays on the ground
  } else if (item.type === 'sardine') {
    f.held = { type: 'sardine', uses: I.sardineSwings };
  } else {
    f.held = { type: 'book', uses: 1 };
  }
  state.events.push({ type: 'itemPickup', slot: f.slot, item: item.type, x: item.x, y: item.y });
  feedback(state, f.slot, 'good', PICKUP_TEXT[item.type], '#22a36b', { item: item.type });
  return true;
}

export function updateItems(state) {
  if (state.settings.items) {
    state.itemTimer -= 1;
    if (state.itemTimer <= 0) {
      spawnRandomItem(state);
      state.itemTimer = nextItemDelay(state);
    }
  }
  const kept = [];
  for (const item of state.items) {
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
  state.items = kept;
}
