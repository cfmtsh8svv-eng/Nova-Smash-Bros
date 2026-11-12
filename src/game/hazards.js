// Stage hazards: three per stage, one at a time, the next one 10 to 15 seconds after
// the last one ended. Each hazard goes through the same steps:
//   idle -> warn (its name, then 3, 2, 1) -> active -> idle
// (a late train goes warn -> late -> active, without a second warning).
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
  return { phase: 'idle', timer: nextHazardDelay(state), id: null, name: '', t: 0, count: 0, zone: null, dir: 1, pos: 0, hit: [], drinks: [], spots: [], rockets: [], burnt: {}, text: '' };
}

const groundY = (state) => state.stage.platforms[0].y;
const onGroundLevel = (f) => f.y > CONFIG.levels.groundAbove;

// Is this fighter inside the zone the current hazard was announced for?
export function inZone(zone, f) {
  if (zone === 'ground') return f.y > CONFIG.levels.roofBelow;
  if (zone === 'roof') return f.y <= CONFIG.levels.roofBelow;
  if (zone === 'sand') return f.y > CONFIG.levels.groundAbove;
  if (zone === 'roofs') return f.y <= CONFIG.levels.groundAbove;
  if (zone === 'all') return true;
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
  Object.assign(hz, { phase: 'warn', id, t: 0, count: 0, zone: null, dir: nextRandom(state) < 0.5 ? 1 : -1, pos: 0, hit: [], drinks: [], spots: [], rockets: [], burnt: {}, text: '', stolen: false });
  if (forced.dir) hz.dir = forced.dir;
  let name = HAZARDS[id].name;
  if (id === 'train' || id === 'wave' || id === 'crowd' || id === 'fireworks') hz.zone = 'groundLevel';
  if (id === 'rain') hz.zone = 'all';
  if (id === 'sun') hz.zone = 'sand';
  if (id === 'wave') {
    // It rises at a random point in one half of the sandbank and rolls towards the far edge:
    // rising in the left half, it rolls right (D-146).
    const sand = state.stage.platforms[0];
    const room = sand.w / 2 - H.wave.width;
    const from = hz.dir > 0 ? sand.x : sand.x + sand.w / 2;
    hz.pos = Math.round(forced.pos ?? from + nextRandom(state) * room);
  }
  if (id === 'fireworks') {
    // One spot in each fifth of the street, near its middle (D-152), so two
    // neighbouring rockets always leave a gap a fighter can stand in.
    const street = state.stage.platforms[0];
    const part = street.w / H.fireworks.spots;
    const jitter = part / 2 - 60;
    hz.spots = forced.spots || [...Array(H.fireworks.spots)].map((_, i) => Math.round(street.x + (i + 0.5) * part + (nextRandom(state) * 2 - 1) * jitter));
  }
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
  if (hz.id === 'train' && nextRandom(state) < H.train.lateChance) {
    // A late train (D-144): after the 3, 2, 1 nothing happens and nothing is shown,
    // and 5 s later it comes without any warning.
    hz.phase = 'late';
    hz.timer = H.train.lateFrames;
    hz.name = '';
    state.events.push({ type: 'hazardLate', hazard: hz.id });
    return;
  }
  if (hz.id === 'train') hz.pos = hz.dir > 0 ? -H.train.length : SCREEN.w;
  if (hz.id === 'crowd') hz.pos = hz.dir > 0 ? -H.crowd.width : SCREEN.w;
  if (hz.id === 'gulls') hz.pos = hz.dir > 0 ? -60 : SCREEN.w + 60;
  if (hz.id === 'fireworks') hz.rockets = hz.spots.map((x) => ({ x, y: groundY(state), t: 0, riders: [], done: false }));
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
  Object.assign(hz, { phase: 'idle', timer: nextHazardDelay(state), id: null, name: '', zone: null, hit: [], drinks: [], spots: [], rockets: [], burnt: {}, text: '', count: 0 });
}

// The rectangle a moving hazard (train, wave, crowd) covers right now.
export function hazardRect(state) {
  const hz = state.hazard;
  if (hz.phase !== 'active') return null;
  const size = { train: [H.train.length, H.train.height], wave: [H.wave.width, H.wave.height], crowd: [H.crowd.width, H.crowd.height] }[hz.id];
  if (!size) return null;
  // The wave rises from below first, then rolls at full height.
  const height = hz.id === 'wave' ? Math.round(size[1] * Math.min(1, hz.t / H.wave.riseFrames)) : size[1];
  return { x: hz.pos, y: groundY(state) - height, w: size[0], h: height + 30 };
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

  // Big Wave (D-146): rises, then rolls to the far edge and drags whoever stands on the sand in it.
  wave(state) {
    const hz = state.hazard;
    const W = H.wave;
    const rolling = hz.t > W.riseFrames;
    if (rolling) hz.pos += W.speed * hz.dir;
    const rect = hazardRect(state);
    for (const f of state.fighters) {
      // Only fighters standing on the sand: a jump or a platform escapes it.
      if (!canBeHit(f) || !f.onGround || !onGroundLevel(f) || !rectsOverlap(rect, hurtbox(f))) continue;
      if (!hz.hit.includes(f.slot)) {
        hz.hit.push(f.slot);
        if (applyHit(state, f, { by: null, kind: 'hazard', source: 'wave', damage: W.damage }) === HIT) {
          feedback(state, f.slot, 'hazard', 'Washed away by the big wave!', '#3fd0e0', { hazard: 'wave' });
        }
      }
      // Carried with the wave, at its speed, as long as the fighter stands on the sand; past the
      // stage edge nothing drags any more and the fighter flies on and falls.
      if (rolling && f.state === 'alive') {
        f.dragVx = W.speed * hz.dir;
        f.dragGrip = 0;
        f.vx = W.speed * hz.dir;
      }
    }
    if ((hz.dir > 0 && hz.pos > SCREEN.w) || (hz.dir < 0 && hz.pos + W.width < 0)) endHazard(state);
  },

  // Sudden Rain (D-145): the whole map is slippery; no damage.
  rain(state) {
    const hz = state.hazard;
    for (const f of state.fighters) {
      if (f.state !== 'alive') continue;
      f.slip = Math.max(f.slip, 2);
      if (!hz.hit.includes(f.slot)) {
        hz.hit.push(f.slot);
        feedback(state, f.slot, 'hazard', "It's raining! Everything is slippery.", '#5a7fa8', { hazard: 'rain' });
      }
    }
    if (hz.t >= H.rain.frames) endHazard(state);
  },

  // Midday Sun (D-147): 2 % every 0.5 s on the sand level, at most 20 %.
  sun(state) {
    const hz = state.hazard;
    const S = H.sun;
    if (hz.t % S.every === 0) {
      for (const f of state.fighters) {
        if (!canBeHit(f) || !inZone('sand', f) || (hz.burnt[f.slot] || 0) >= S.max) continue;
        if (applyHit(state, f, { by: null, kind: 'hazard', source: 'sun', damage: S.damage }) !== HIT) continue;
        hz.burnt[f.slot] = (hz.burnt[f.slot] || 0) + S.damage;
        if (!hz.hit.includes(f.slot)) {
          hz.hit.push(f.slot);
          feedback(state, f.slot, 'hazard', 'Sunburn! Get in the shade.', '#ff7a3d', { hazard: 'sun' });
        }
      }
    }
    if (hz.t >= S.frames) endHazard(state);
  },

  // Fireworks (D-148): a rocket from each spot; a fighter in the street it touches rides up, then it explodes.
  fireworks(state) {
    const hz = state.hazard;
    const F = H.fireworks;
    for (const rocket of hz.rockets) {
      if (rocket.done) continue;
      rocket.t += 1;
      rocket.y -= F.speed;
      const box = { x: rocket.x - F.width / 2, y: rocket.y - F.height, w: F.width, h: F.height + F.speed };
      for (const f of state.fighters) {
        if (f.state !== 'alive' || f.invincible > 0 || rocket.riders.includes(f.slot) || !onGroundLevel(f) || !rectsOverlap(box, hurtbox(f))) continue;
        if (hz.rockets.some((r) => r.riders.includes(f.slot))) continue;
        rocket.riders.push(f.slot);
      }
      for (const slot of rocket.riders) {
        const f = state.fighters.find((x) => x.slot === slot);
        if (f.state !== 'alive') continue;
        // Carried up with the rocket: no way to act until it explodes.
        Object.assign(f, { x: rocket.x, y: rocket.y + 4, vx: 0, vy: -F.speed, onGround: false, groundId: -1, hang: null });
        stunFighter(f, 2);
      }
      if (rocket.t >= F.carryFrames) {
        rocket.done = true;
        state.events.push({ type: 'fx', fx: 'firework', x: rocket.x, y: rocket.y - F.height / 2 });
        for (const slot of rocket.riders) {
          const f = state.fighters.find((x) => x.slot === slot);
          const result = applyHit(state, f, {
            by: null, kind: 'hazard', source: 'fireworks', damage: F.damage, baseKb: F.baseKb, kbGrowth: F.kbGrowth, angleDeg: F.angleDeg,
            dirX: Math.sign(f.x - SCREEN.w / 2) || 1,
          });
          if (result === HIT) feedback(state, f.slot, 'hazard', 'Fireworks! Santos Populares came early.', '#e85d9c', { hazard: 'fireworks' });
        }
      }
    }
    if (hz.rockets.every((r) => r.done)) endHazard(state);
  },

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
  } else if (hz.phase === 'late') {
    hz.timer -= 1;
    if (hz.timer <= 0) {
      // The late train arrives, without a warning.
      hz.phase = 'active';
      hz.t = 0;
      hz.name = HAZARDS[hz.id].name;
      hz.pos = hz.dir > 0 ? -H.train.length : SCREEN.w;
      state.events.push({ type: 'hazardStart', hazard: hz.id, name: hz.name, zone: hz.zone, dir: hz.dir, late: true });
    }
  }
}
