// Bots (GAME_SPEC §5a, D-163): a computer player that turns the match state into the
// same input a phone sends. The rules cannot tell a bot from a phone, so step() needs
// no change: the host page asks botInput() for a bot's input every step.
//
// Pure like the rest of src/game/: no DOM, no clock, no Math.random. A bot has its own
// random numbers (rng.js), seeded from the match seed and its slot, so a match with
// bots replays exactly. botInput() only reads the state, it never changes it.
//
// Human limits (D-163): the bot sees the other fighters, the items and the hazards as
// they were `reactionFrames` ago (it keeps a short history), misjudges distances by a
// random amount, and holds every button press for a few frames with a gap before the
// same button is pressed again, like a thumb on a phone. It knows its own fighter as it
// is now (a player knows what their thumbs are doing).
//
// Hazards: the bot only reads what players are shown (the announced hazard, its zone,
// the visible train, wave or crowd). It never reads the hidden timers (when the next
// hazard comes, the late train's delay). Now and then it misses a warning, as a player
// looking at their phone does, and reacts only once the hazard is active (D-184).
import { CONFIG, SPECIAL_TUNING } from './config.js';
import { getFighter } from './fighters.js';
import { hazardRect } from './hazards.js';
import { nextRandom } from './rng.js';

export const BOT_NAMES = ['Freshman', 'Intern', 'Erasmus'];
// The bot levels in order, easiest first (D-175); the server and the host page use this list.
export const BOT_LEVELS = ['easy', 'medium', 'hard'];
const PRESS_KEYS = ['attack', 'jump', 'special', 'down'];
const GROUND_HAZARDS = ['train', 'wave', 'crowd', 'fireworks', 'sun'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// A new bot for one match. seed is the match seed; the slot makes each bot's numbers its own.
// The level only picks a number set (D-176); an unknown level plays as medium.
export function createBot({ slot, level = 'medium', seed = 1 }) {
  const cfg = CONFIG.bots[level] || CONFIG.bots.medium;
  return {
    slot, level, cfg,
    rng: { seed: ((seed | 0) ^ Math.imul(slot + 1, 0x9e3779b1)) | 0 },
    history: [], // what it saw, newest last
    keys: Object.fromEntries(PRESS_KEYS.map((k) => [k, { hold: 0, since: 99 }])),
    aimErr: 0, aimTimer: 0, hesitate: 0,
    // Slips of a person (D-184) draw from their own numbers, so the rest of the bot plays as before.
    slipRng: { seed: ((seed | 0) ^ Math.imul(slot + 7, 0x85ebca6b)) | 0 },
    tipsyAge: 0, fumble: 0, hazardSeen: false, hazardMissed: false,
    graph: null, graphStage: null,
  };
}

// ---- what the bot sees ----

// The part of a hazard a player can see or read. A late train and the idle wait are not shown.
function visibleHazard(state) {
  const hz = state.hazard;
  if (!state.settings.hazards || !hz || (hz.phase !== 'warn' && hz.phase !== 'active')) return null;
  const seen = { phase: hz.phase, id: hz.id, zone: hz.zone, platform: hz.platform ?? null };
  if (hz.phase === 'active') seen.rect = hazardRect(state);
  return seen;
}

function snapshot(state) {
  return {
    frame: state.frame,
    fighters: state.fighters.map((f) => ({
      slot: f.slot, x: f.x, y: f.y, state: f.state, lives: f.lives, percent: f.percent, onGround: f.onGround,
      invincible: f.invincible > 0, held: f.held ? f.held.type : null,
    })),
    items: state.items.map((i) => ({ type: i.type, x: i.x, y: i.y, ready: i.age >= CONFIG.items.spawnInFrames })),
    hazard: visibleHazard(state),
  };
}

// ---- the stage as a map of platforms ----

// The platform a fighter at (x, y) would land on: the highest one at or below the feet.
function supportIndex(stage, x, y) {
  let best = -1;
  stage.platforms.forEach((p, i) => {
    if (x >= p.x && x <= p.x + p.w && p.y >= y - 1 && (best < 0 || p.y < stage.platforms[best].y)) best = i;
  });
  return best;
}

// How far to the side a platform may be for the routes that go round (D-181): a jump at an
// angle to a higher one, and walking off an edge onto a lower one.
const UP_REACH = 120;
const UP_RISE = 170;
const WALK_OFF_REACH = 80;

// Which platform can be reached from which, and how many hops apart they are.
function buildGraph(stage) {
  const P = stage.platforms;
  const n = P.length;
  const next = [...Array(n)].map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = P[i];
      const b = P[j];
      const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w); // < 0: they overlap by that much
      if (b.y < a.y) {
        const rise = a.y - b.y;
        // up: a jump (and the double jump) straight up, or at an angle from the edge to a
        // platform beside this one. A jump reaches about 160 px, both together about 290 px;
        // at an angle only as high as one jump, the double jump is the reserve for the side.
        if (!b.solid && ((rise <= 280 && gap <= 40) || (rise <= UP_RISE && gap <= UP_REACH))) next[i].push(j);
      } else if (b.y > a.y) {
        if (!a.solid && -gap >= 60) next[i].push(j); // down: drop through
        else if (gap <= WALK_OFF_REACH) next[i].push(j); // down: walk off the edge onto the one beside
      } else if (gap <= 160) {
        next[i].push(j); // across a gap at the same height
      }
    }
  }
  // Hops between every pair (breadth-first), and the first hop of a shortest way.
  const hop = [...Array(n)].map(() => Array(n).fill(-1));
  const dist = [];
  for (let from = 0; from < n; from++) {
    dist[from] = Array(n).fill(Infinity);
    dist[from][from] = 0;
    const queue = [from];
    while (queue.length) {
      const i = queue.shift();
      for (const j of next[i]) {
        if (dist[from][j] !== Infinity) continue;
        dist[from][j] = dist[from][i] + 1;
        hop[from][j] = i === from ? j : hop[from][i];
        queue.push(j);
      }
    }
  }
  return { hop, dist };
}

// ---- the press manager: a thumb, not a machine ----

// Tipsy (D-184): at first the bot steers the wrong way, then it steers around the swap,
// but now and then it gets it wrong again for a moment. Called once per step while tipsy.
function steersAround(bot) {
  const cfg = bot.cfg;
  bot.tipsyAge += 1;
  if (bot.tipsyAge <= cfg.tipsyAdaptFrames) return false;
  if (bot.fumble > 0) {
    bot.fumble -= 1;
    return false;
  }
  if (nextRandom(bot.slipRng) < cfg.tipsySlipChance) {
    bot.fumble = cfg.tipsySlipFrames - 1;
    return false;
  }
  return true;
}

function toButtons(bot, me, intent) {
  const cfg = bot.cfg;
  let dir = intent.dir || 0;
  if (me.tipsy > 0 && steersAround(bot)) dir = -dir; // the phone says "you're drunk": a player learns to steer the other way
  const out = { left: dir < 0, right: dir > 0, up: Boolean(intent.up), down: false, attack: false, jump: false, special: false, attackP: false, jumpP: false, specialP: false };
  for (const key of PRESS_KEYS) {
    const k = bot.keys[key];
    if (k.hold > 0) {
      out[key] = true;
      k.hold -= 1;
      if (k.hold === 0) k.since = 0;
      continue;
    }
    k.since += 1;
    if (intent[key] && k.since >= cfg.pressGap) {
      out[key] = true;
      if (key !== 'down') out[key + 'P'] = true;
      k.hold = cfg.pressHold - 1;
      if (k.hold === 0) k.since = 0;
    }
  }
  return out;
}

// ---- deciding ----

const NEUTRAL = Object.freeze({ dir: 0 });

// Is a fighter at height y in the zone of the visible hazard? (true: get out of it)
function dangerAt(hz, stage, y, platformIndex) {
  if (!hz) return false;
  const L = CONFIG.levels;
  if (GROUND_HAZARDS.includes(hz.id)) return y > L.groundAbove;
  if (hz.id === 'gulls') return hz.zone === 'sand' ? y > L.groundAbove : y <= L.groundAbove;
  if (hz.id === 'wifi') return hz.zone === 'ground' ? y > L.roofBelow : y <= L.roofBelow;
  if (hz.id === 'drinks') return platformIndex === hz.platform;
  return false; // the rain covers everything and does no damage
}
const platformDanger = (hz, stage, i) => i >= 0 && dangerAt(hz, stage, stage.platforms[i].y, i);

// The way back to the stage: steer towards the main ground, double jump at its level,
// and let the ledge grab do the rest (pushing towards the wall faces it).
function recover(me, ground) {
  const intent = { dir: 0 };
  const left = ground.x;
  const right = ground.x + ground.w;
  const under = me.x > left - 20 && me.x < right + 20 && me.y > ground.y + 2;
  if (under) {
    // Under the main ground: first out to the side, or a jump only bumps the head.
    intent.dir = me.x < ground.x + ground.w / 2 ? -1 : 1;
    return intent;
  }
  intent.dir = sign(clamp(me.x, left + 40, right - 40) - me.x);
  const canAct = me.hitstun <= 0 && me.stun <= 0 && !me.pull;
  if (canAct && me.jumpsLeft > 0 && me.vy > -1 && me.y > ground.y - 25) intent.jump = true;
  return intent;
}

// The specials, as far as a bot needs to know them: where the target must be.
function specialFits(me, id, dx, dy, stage, ground) {
  const S = SPECIAL_TUNING[id];
  const dist = Math.hypot(dx, dy);
  const ahead = Math.abs(dx);
  switch (id) {
    case 'cash_rain': return dist <= S.radius - 20;
    case 'rounds_on_me': return dist <= S.radius - 20;
    case 'ring_light_flash': return dist <= S.radius - 30;
    case 'bass_drop': return dist <= S.radius - 20;
    case 'padel_smash': return ahead <= S.range - 40 && Math.abs(dy) <= 40;
    case 'spaghetti_lasso': return ahead <= S.range - 30 && ahead > 60 && Math.abs(dy) <= 50;
    case 'ding_ding': return ahead <= S.range - 80 && ahead > 60 && Math.abs(dy) <= 8;
    case 'wave_rider': {
      // It rides 360 px forward: only where the ride ends above the main ground.
      const end = me.x + sign(dx) * (S.range + 30);
      return ahead <= S.range - 30 && Math.abs(dy) <= 40 && end > ground.x + 30 && end < ground.x + ground.w - 30 && supportIndex(stage, end, me.y) >= 0;
    }
    default: return false;
  }
}

function decide(bot, state, me, seen) {
  const cfg = bot.cfg;
  const stage = state.stage;
  const ground = stage.platforms.find((p) => p.solid) || stage.platforms[0];
  if (bot.graphStage !== stage.id) {
    bot.graph = buildGraph(stage);
    bot.graphStage = stage.id;
  }

  if (me.hang) return me.hang.t >= cfg.climbDelay ? { dir: 0, jump: true } : NEUTRAL;
  const mine = me.onGround ? me.groundId : supportIndex(stage, me.x, me.y);
  if (mine < 0) return recover(me, ground);
  const canAct = me.hitstun <= 0 && me.stun <= 0 && !me.pull;
  if (!canAct) return NEUTRAL;

  // A new misjudgement now and then.
  bot.aimTimer -= 1;
  if (bot.aimTimer <= 0) {
    bot.aimErr = (nextRandom(bot.rng) * 2 - 1) * cfg.aimError;
    bot.aimTimer = cfg.aimEvery;
  }
  // Now and then it stops and thinks, as a person does.
  if (bot.hesitate > 0) {
    bot.hesitate -= 1;
    return NEUTRAL;
  }
  if (me.onGround && !me.attack && !me.special && nextRandom(bot.rng) < cfg.hesitateChance) {
    bot.hesitate = cfg.hesitateFrames;
    return NEUTRAL;
  }

  const hz = seen.hazard;
  const myPlatform = stage.platforms[mine];
  const inDanger = dangerAt(hz, stage, me.y, mine);
  const others = seen.fighters.filter((o) => o.slot !== bot.slot && o.state === 'alive');

  // The target: the nearest opponent; the leader counts as a bit nearer (D-163).
  let target = null;
  if (others.length) {
    const all = seen.fighters.filter((o) => o.state !== 'out');
    const leader = [...all].sort((a, b) => b.lives - a.lives || a.percent - b.percent || a.slot - b.slot)[0];
    const holdsProject = me.held && me.held.type === 'project';
    let best = Infinity;
    for (const o of others) {
      let d = Math.hypot(o.x - me.x, (o.y - me.y) * 1.5);
      if (!holdsProject && leader && o.slot === leader.slot) d *= 1 - cfg.leaderBias;
      if (d < best) {
        best = d;
        target = o;
      }
    }
  }

  // Where to go: a safe level while a hazard is announced, an item on the way, or the target.
  let goalPlatform = mine;
  let goalX = me.x;
  let stopAt = 8;
  if (inDanger) {
    let bestCost = Infinity;
    stage.platforms.forEach((p, i) => {
      if (platformDanger(hz, stage, i) || bot.graph.hop[mine][i] < 0) return;
      const cost = Math.abs(clamp(me.x, p.x, p.x + p.w) - me.x) + (p.y < myPlatform.y ? 0 : 200);
      if (cost < bestCost) {
        bestCost = cost;
        goalPlatform = i;
      }
    });
    const p = stage.platforms[goalPlatform];
    goalX = clamp(target ? target.x : me.x, p.x + 30, p.x + p.w - 30);
  } else {
    const handsFree = !me.held;
    const item = seen.items
      .filter((i) => i.ready && i.type !== 'project' && Math.abs(i.y - myPlatform.y) < 2 && i.x >= myPlatform.x && i.x <= myPlatform.x + myPlatform.w)
      .filter((i) => handsFree || ['nata', 'bifana', 'rooster'].includes(i.type))
      .filter((i) => Math.abs(i.x - me.x) <= cfg.itemReach && (!(me.held && me.held.type === 'project')))
      .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
    if (item) {
      goalX = item.x;
    } else if (target) {
      const tx = target.x + bot.aimErr;
      let tp = target.onGround ? supportIndex(stage, target.x, target.y) : supportIndex(stage, target.x, target.y);
      if (tp < 0) {
        // Off the stage: wait at the edge of the main ground, never follow.
        tp = stage.platforms.indexOf(ground);
      }
      // A hazard zone the bot is not in: stay out of it.
      if (platformDanger(hz, stage, tp)) tp = mine;
      goalPlatform = tp;
      const p = stage.platforms[tp];
      goalX = clamp(tx, p.x + 24, p.x + p.w - 24);
      stopAt = 58;
    }
  }

  // ---- moving there ----
  const intent = { dir: 0 };
  const P = stage.platforms;
  if (goalPlatform === mine || bot.graph.hop[mine][goalPlatform] < 0) {
    if (Math.abs(goalX - me.x) > stopAt) intent.dir = sign(goalX - me.x);
  } else {
    let nextIndex = bot.graph.hop[mine][goalPlatform];
    if (platformDanger(hz, stage, nextIndex) && !inDanger) {
      // The shortest way leads through a hazard zone: take a safe neighbouring platform from
      // which the goal can still be reached, if there is one (on Bairro Alto the roofs go round
      // the street). Without it two bots on safe levels waited out the whole hazard.
      const { hop, dist } = bot.graph;
      let best = Infinity;
      P.forEach((_, j) => {
        if (j === mine || hop[mine][j] !== j || platformDanger(hz, stage, j)) return;
        if (dist[j][goalPlatform] < best) {
          best = dist[j][goalPlatform];
          nextIndex = j;
        }
      });
    }
    const next = P[nextIndex];
    if (platformDanger(hz, stage, nextIndex) && !inDanger) {
      if (Math.abs(goalX - me.x) > stopAt) intent.dir = sign(clamp(goalX, myPlatform.x + 24, myPlatform.x + myPlatform.w - 24) - me.x);
    } else if (next.y < myPlatform.y) {
      const landX = clamp(goalX, next.x + 30, next.x + next.w - 30);
      if (me.onGround) {
        // Under the platform, or at the edge of this one nearest to it (a jump at an angle).
        const takeoff = clamp(clamp(me.x, next.x + 20, next.x + next.w - 20), myPlatform.x + 14, myPlatform.x + myPlatform.w - 14);
        if (Math.abs(takeoff - me.x) < 24) {
          intent.jump = true;
          intent.dir = sign(landX - me.x);
        } else {
          intent.dir = sign(takeoff - me.x);
        }
      } else {
        intent.dir = Math.abs(landX - me.x) > 10 ? sign(landX - me.x) : 0;
        // The double jump at the top of the first one, if the platform is still above the feet
        // and the bot is under it. Without the second check a bot that has just dropped off a
        // platform (and so counts as on the one below) jumped straight back up at once, towards
        // a platform far to the side, and landed where it started, again and again.
        const under = me.x >= next.x - UP_REACH - 10 && me.x <= next.x + next.w + UP_REACH + 10;
        if (under && me.jumpsLeft > 0 && me.vy > -1.5 && me.y > next.y - 4) intent.jump = true;
      }
    } else if (next.y > myPlatform.y) {
      const lo = Math.max(myPlatform.x, next.x) + 24;
      const hi = Math.min(myPlatform.x + myPlatform.w, next.x + next.w) - 24;
      if (!myPlatform.solid && hi - lo >= 12) {
        // Drop through where the two overlap.
        const dropX = clamp(goalX, lo, hi);
        if (me.onGround && Math.abs(dropX - me.x) < 18) intent.down = true;
        else intent.dir = sign(dropX - me.x);
      } else {
        // The platform below is beside this one: walk off the edge towards it.
        const landX = clamp(goalX, next.x + 30, next.x + next.w - 30);
        intent.dir = sign(landX - me.x);
      }
    } else {
      // The same height across a gap: run and jump at the edge.
      const towards = sign(next.x - myPlatform.x);
      intent.dir = towards;
      const edge = towards > 0 ? myPlatform.x + myPlatform.w : myPlatform.x;
      if (me.onGround && Math.abs(edge - me.x) < 40) intent.jump = true;
    }
  }

  // ---- fighting ----
  if (target && !inDanger) {
    const dx = target.x + bot.aimErr - me.x;
    const dy = target.y - me.y; // feet to feet; < 0 means the target is higher
    const busy = me.attack || me.special;
    const towards = sign(dx) || me.facing;
    const side = Math.abs(dx) <= CONFIG.attack.range + 14 && Math.abs(dy) <= 60;
    const above = Math.abs(dx) <= 50 && dy < -40 && dy > -CONFIG.attack.range - 80;
    if (!busy) {
      if (me.onGround) {
        if (above) {
          intent.up = true;
          if (nextRandom(bot.rng) < cfg.attackChance) intent.attack = true;
        } else if (side) {
          if (me.facing !== towards) intent.dir = towards; // turn round first
          else {
            if (Math.abs(dx) < 40) intent.dir = 0;
            if (nextRandom(bot.rng) < cfg.attackChance) intent.attack = true;
          }
        }
        const special = getFighter(me.fighterId).special.id;
        if (!intent.attack && me.cooldown <= 0 && specialFits(me, special, dx, dy, stage, ground)) {
          const radius = ['cash_rain', 'rounds_on_me', 'ring_light_flash', 'bass_drop'].includes(special);
          if (!radius && me.facing !== towards) intent.dir = towards;
          else if (nextRandom(bot.rng) < cfg.specialChance) {
            intent.special = true;
            intent.dir = 0;
          }
        }
      } else if (above) {
        intent.up = true;
        if (nextRandom(bot.rng) < cfg.attackChance) intent.attack = true;
      } else if (dy > 40 && Math.abs(dx) < 40 && supportIndex(stage, me.x, me.y) === supportIndex(stage, target.x, target.y) && nextRandom(bot.rng) < cfg.stompChance) {
        intent.attack = true; // the stomp: Attack in the air without Up
      }
    }
  }
  // Never let a press of Attack in the air turn into a stomp by accident.
  if (intent.attack && !me.onGround && !intent.up && !(target && target.y > me.y + 40)) intent.attack = false;

  // ---- never run off an edge by itself ----
  if (intent.dir && me.onGround) {
    const ahead = me.x + intent.dir * (30 + Math.abs(me.vx) * 4);
    if (supportIndex(stage, ahead, me.y) < 0) intent.dir = 0;
  }
  return intent;
}

// Hazards (D-184): one roll per hazard when its warning is first seen. A missed warning
// is only noticed once the hazard is active.
function noticeHazard(bot, seen) {
  const hz = seen.hazard;
  if (!hz) {
    bot.hazardSeen = false;
    bot.hazardMissed = false;
    return seen;
  }
  if (!bot.hazardSeen) {
    bot.hazardSeen = true;
    bot.hazardMissed = hz.phase === 'warn' && nextRandom(bot.slipRng) < bot.cfg.hazardMissChance;
  }
  if (bot.hazardMissed && hz.phase === 'warn') return { ...seen, hazard: null };
  return seen;
}

// The bot's input for this step. Call it once per step, in order; it keeps its own history.
export function botInput(bot, state) {
  bot.history.push(snapshot(state));
  const delay = bot.cfg.reactionFrames;
  while (bot.history.length > delay + 1) bot.history.shift();
  const me = state.fighters.find((f) => f.slot === bot.slot);
  if (!me || !(me.tipsy > 0)) {
    bot.tipsyAge = 0;
    bot.fumble = 0;
  }
  const seen = noticeHazard(bot, bot.history[0]);
  let intent = NEUTRAL;
  if (me && me.state === 'alive' && state.phase === 'fight') intent = decide(bot, state, me, seen);
  return toButtons(bot, me || { tipsy: 0 }, intent);
}
