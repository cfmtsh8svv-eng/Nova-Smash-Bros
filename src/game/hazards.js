// Stage hazards. One at a time, every 25 to 40 seconds.
// Each hazard goes through the same steps:
//   idle -> warn (its name, then 3, 2, 1) -> active -> idle
// and each one only touches one level or zone of the stage, so a player who
// reads the warning can always get out of the way.
import { CONFIG, SCREEN, seconds } from './config.js';
import { HAZARDS, tallyVote } from './stages.js';
import { applyHit, canBeHit, feedback, HIT, hurtbox, rectsOverlap, stunFighter } from './combat.js';
import { nextRandom, pick, randomBetween } from './rng.js';
import { ITEM_NAMES } from './items.js';

const H = CONFIG.hazards;
export const WARN_FRAMES = H.nameFrames + 3 * H.countFrames;
export const nextHazardDelay = (state) => seconds(randomBetween(state, state.settings.hazardMinS, state.settings.hazardMaxS));

export function newHazardState(state) {
  return { phase: 'idle', timer: nextHazardDelay(state), id: null, name: '', t: 0, count: 0, zone: null, dir: 1, pos: 0, hit: [], drinks: [], text: '' };
}

const groundY = (state) => state.stage.platforms[0].y;
const onGroundLevel = (f) => f.y > CONFIG.levels.groundAbove;

// Is this fighter inside the zone the current hazard was announced for?
export function inZone(zone, f) {
  if (zone === 'ground') return f.y > CONFIG.levels.roofBelow;
  if (zone === 'roof') return f.y <= CONFIG.levels.roofBelow;
  if (zone === 'sand') return f.y > CONFIG.levels.groundAbove;
  if (zone === 'roofs') return f.y <= CONFIG.levels.groundAbove;
  return false;
}

// A knocked-out player may vote for the next hazard of the stage.
export function voteHazard(state, slot, hazardId) {
  const f = state.fighters.find((x) => x.slot === slot);
  if (!f || f.state !== 'out' || !state.stage.hazards.includes(hazardId)) return false;
  state.hazardVotes[slot] = hazardId;
  return true;
}

function chooseHazard(state) {
  const votes = Object.values(state.hazardVotes);
  state.hazardVotes = {};
  return tallyVote(state.stage.hazards, votes, () => nextRandom(state));
}

// Start the warning for a hazard. Normally the game picks it (votes first, then chance).
// `forced` lets tests choose the hazard and where it strikes: { id, zone, dir, platform }.
export function beginWarning(state, forced = {}) {
  const hz = state.hazard;
  const id = forced.id || chooseHazard(state);
  Object.assign(hz, { phase: 'warn', id, t: 0, count: 0, zone: null, dir: nextRandom(state) < 0.5 ? 1 : -1, pos: 0, hit: [], drinks: [], text: '', stolen: false });
  if (forced.dir) hz.dir = forced.dir;
  let name = HAZARDS[id].name;
  if (id === 'train' || id === 'wave' || id === 'crowd') hz.zone = 'groundLevel';
  if (id === 'wifi') {
    hz.zone = forced.zone || pick(state, ['roof', 'ground']);
    name += hz.zone === 'roof' ? ' ON THE ROOFS' : ' ON THE GROUND FLOOR';
  }
  if (id === 'gulls') {
    hz.zone = forced.zone || pick(state, ['sand', 'roofs']);
    name += hz.zone === 'sand' ? ' OVER THE SAND' : ' OVER THE ROOFS';
  }
  if (id === 'drinks') {
    hz.platform = forced.platform ?? Math.floor(nextRandom(state) * state.stage.platforms.length);
    name += ' ON ' + state.stage.platforms[hz.platform].label.toUpperCase();
  }
  hz.name = name;
  state.events.push({ type: 'hazardWarn', hazard: id, name, zone: hz.zone, dir: hz.dir });
}

function beginActive(state) {
  const hz = state.hazard;
  hz.phase = 'active';
  hz.t = 0;
  hz.count = 0;
  if (hz.id === 'train' && nextRandom(state) < H.train.strikeChance) {
    hz.phase = 'cancelled';
    hz.timer = H.cancelledFrames;
    hz.text = 'STRIKE! Train cancelled.';
    state.events.push({ type: 'hazardCancel', hazard: hz.id, text: hz.text });
    return;
  }
  if (hz.id === 'train') hz.pos = hz.dir > 0 ? -H.train.length : SCREEN.w;
  if (hz.id === 'wave') hz.pos = hz.dir > 0 ? -H.wave.width : SCREEN.w;
  if (hz.id === 'crowd') hz.pos = hz.dir > 0 ? -H.crowd.width : SCREEN.w;
  if (hz.id === 'gulls') hz.pos = hz.dir > 0 ? -60 : SCREEN.w + 60;
  if (hz.id === 'drinks') {
    const p = state.stage.platforms[hz.platform];
    const n = H.drinks.count;
    hz.drinks = [...Array(n)].map((_, i) => ({ x: Math.round(p.x + (p.w * (i + 1)) / (n + 1)), y: p.y, taken: false }));
  }
  state.events.push({ type: 'hazardStart', hazard: hz.id, name: hz.name, zone: hz.zone, dir: hz.dir });
}

function endHazard(state) {
  const hz = state.hazard;
  state.events.push({ type: 'hazardEnd', hazard: hz.id });
  Object.assign(hz, { phase: 'idle', timer: nextHazardDelay(state), id: null, name: '', zone: null, hit: [], drinks: [], text: '', count: 0 });
}

// The rectangle a moving hazard (train, wave, crowd) covers right now.
export function hazardRect(state) {
  const hz = state.hazard;
  if (hz.phase !== 'active') return null;
  const size = { train: [H.train.length, H.train.height], wave: [H.wave.width, H.wave.height], crowd: [H.crowd.width, H.crowd.height] }[hz.id];
  if (!size) return null;
  return { x: hz.pos, y: groundY(state) - size[1], w: size[0], h: size[1] + 30 };
}

// Bad Wi-Fi: how many frames of input delay this fighter has right now.
export function wifiDelayFor(state, f) {
  const hz = state.hazard;
  if (hz.phase !== 'active' || hz.id !== 'wifi' || f.state !== 'alive') return 0;
  return inZone(hz.zone, f) ? H.wifi.delayFrames : 0;
}

function sweep(state, cfg, text, flash) {
  const hz = state.hazard;
  hz.pos += cfg.speed * hz.dir;
  const rect = hazardRect(state);
  for (const f of state.fighters) {
    if (hz.hit.includes(f.slot) || !canBeHit(f) || !rectsOverlap(rect, hurtbox(f))) continue;
    hz.hit.push(f.slot);
    const landed = applyHit(state, f, { by: null, kind: 'hazard', source: hz.id, damage: cfg.damage, baseKb: cfg.baseKb, kbGrowth: cfg.kbGrowth, angleDeg: cfg.angleDeg, dirX: hz.dir });
    if (landed === HIT) feedback(state, f.slot, 'hazard', text, flash, { hazard: hz.id });
  }
  if ((hz.dir > 0 && hz.pos > SCREEN.w) || (hz.dir < 0 && hz.pos + rect.w < 0)) endHazard(state);
}

const ACTIVE = {
  train: (state) => sweep(state, H.train, 'Hit by the Cascais Line train!', '#f6c343'),
  wave: (state) => sweep(state, H.wave, 'Washed away by the big wave!', '#3fd0e0'),

  wifi(state) {
    const hz = state.hazard;
    for (const f of state.fighters) {
      if (hz.hit.includes(f.slot) || wifiDelayFor(state, f) === 0) continue;
      hz.hit.push(f.slot);
      feedback(state, f.slot, 'hazard', 'Bad Wi-Fi! Your buttons are lagging.', '#8a8f9c', { hazard: 'wifi' });
    }
    if (hz.t >= H.wifi.frames) endHazard(state);
  },

  // A flock crosses its zone once. It takes what a fighter holds (or pecks) and one item lying around.
  gulls(state) {
    const hz = state.hazard;
    const G = H.gulls;
    hz.pos += ((SCREEN.w + 120) / G.frames) * hz.dir;
    for (const f of state.fighters) {
      if (hz.hit.includes(f.slot) || !canBeHit(f) || !inZone(hz.zone, f) || Math.abs(f.x - hz.pos) > G.reach) continue;
      hz.hit.push(f.slot);
      if (f.held && f.held.type !== 'project') { // the Group Project cannot be stolen
        const item = f.held.type;
        f.held = null;
        if (f.attack && (f.attack.kind === 'book' || f.attack.kind === 'azulejo')) f.attack = null; // a stolen item is not thrown
        state.events.push({ type: 'itemStolen', slot: f.slot, item, x: f.x, y: f.y });
        feedback(state, f.slot, 'hazard', `A seagull stole your ${ITEM_NAMES[item].toLowerCase()}!`, '#eef3f8', { hazard: 'gulls' });
      } else if (applyHit(state, f, { by: null, kind: 'hazard', source: 'gulls', damage: G.peckDamage }) === HIT) {
        stunFighter(f, G.peckStun);
        feedback(state, f.slot, 'hazard', 'Pecked by a seagull!', '#eef3f8', { hazard: 'gulls' });
      }
    }
    if (!hz.stolen) {
      const index = state.items.findIndex((item) => inZone(hz.zone, item) && Math.abs(item.x - hz.pos) <= G.reach);
      if (index >= 0) {
        const [item] = state.items.splice(index, 1);
        hz.stolen = true;
        state.events.push({ type: 'itemStolen', slot: null, item: item.type, x: item.x, y: item.y });
      }
    }
    if (hz.t >= G.frames) endHazard(state);
  },

  // The crowd walks along the street and carries along whoever is in it.
  crowd(state) {
    const hz = state.hazard;
    const C = H.crowd;
    hz.pos += C.speed * hz.dir;
    const rect = hazardRect(state);
    for (const f of state.fighters) {
      if (!canBeHit(f) || !onGroundLevel(f) || !rectsOverlap(rect, hurtbox(f))) continue;
      if (!hz.hit.includes(f.slot)) {
        hz.hit.push(f.slot);
        if (applyHit(state, f, { by: null, kind: 'hazard', source: 'crowd', damage: C.damage }) === HIT) {
          feedback(state, f.slot, 'hazard', 'Swept away by the crowd!', '#f6c343', { hazard: 'crowd' });
        }
      }
      if (f.state === 'alive') f.dragVx = C.speed * hz.dir;
    }
    if ((hz.dir > 0 && hz.pos > SCREEN.w) || (hz.dir < 0 && hz.pos + C.width < 0)) endHazard(state);
  },

  // Drinks stand on one platform. Touching one makes you tipsy.
  drinks(state) {
    const hz = state.hazard;
    const D = H.drinks;
    for (const drink of hz.drinks) {
      if (drink.taken) continue;
      const box = { x: drink.x - D.size / 2, y: drink.y - D.size, w: D.size, h: D.size };
      const f = state.fighters.find((x) => canBeHit(x) && rectsOverlap(box, hurtbox(x)));
      if (!f) continue;
      drink.taken = true;
      f.tipsy = Math.max(f.tipsy, D.tipsyFrames);
      state.events.push({ type: 'drink', slot: f.slot, x: drink.x, y: drink.y });
      feedback(state, f.slot, 'hazard', "Cheers! You're tipsy for 8 s. Drink water!", '#8e5cc8', { hazard: 'drinks' });
    }
    if (hz.t >= D.frames) endHazard(state);
  },
};

export function updateHazards(state) {
  const hz = state.hazard;
  if (!state.settings.hazards) return;
  if (hz.phase === 'idle') {
    hz.timer -= 1;
    if (hz.timer <= 0) beginWarning(state);
  } else if (hz.phase === 'warn') {
    hz.t += 1;
    const sinceName = hz.t - H.nameFrames;
    if (sinceName >= 0 && sinceName % H.countFrames === 0 && sinceName < 3 * H.countFrames) {
      hz.count = 3 - sinceName / H.countFrames;
      state.events.push({ type: 'hazardCount', hazard: hz.id, name: hz.name, n: hz.count });
    }
    if (hz.t >= WARN_FRAMES) beginActive(state);
  } else if (hz.phase === 'active') {
    hz.t += 1;
    ACTIVE[hz.id](state);
  } else if (hz.phase === 'cancelled') {
    hz.timer -= 1;
    if (hz.timer <= 0) endHazard(state);
  }
}
