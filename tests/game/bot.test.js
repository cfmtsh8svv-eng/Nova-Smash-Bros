// The bots (GAME_SPEC §5a, D-163): they play with the real rules, replay exactly,
// stay on the stage, get back to it, win against a standing opponent, end a match
// against each other, react late like a person and never read hidden hazard timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, step } from '../../src/game/match.js';
import { createBot, botInput, BOT_NAMES, BOT_LEVELS } from '../../src/game/bot.js';
import { CONFIG } from '../../src/game/config.js';
import { neutralInput } from '../../src/game/input.js';
import { beginWarning, WARN_FRAMES } from '../../src/game/hazards.js';
import { STAGE_IDS, getStage } from '../../src/game/stages.js';
import { botMatch, simpleHuman } from '../helpers/bots.js';

const M = CONFIG.bots.medium;
const SECOND = 60;

// The numbers that matter of a match, to compare two runs.
const fingerprint = (state) => JSON.stringify({
  frame: state.frame, seed: state.seed, phase: state.phase,
  fighters: state.fighters.map((f) => [f.x, f.y, f.vx, f.vy, f.percent, f.lives, f.state, f.held && f.held.type]),
  items: state.items.map((i) => [i.type, i.x, i.y]), hazard: [state.hazard.phase, state.hazard.id],
});

function fresh({ stage = 'campus', fighters = ['finance_bro', 'house_dj'], settings = {}, seed = 3 } = {}) {
  const players = fighters.map((fighterId, i) => ({ slot: i, name: `P${i + 1}`, fighterId }));
  const state = createMatch({ stageId: stage, players, settings: { items: false, hazards: false, ...settings }, seed });
  while (state.phase === 'countdown') step(state, {});
  return state;
}

test('bot names and the medium numbers are there', () => {
  assert.deepEqual(BOT_NAMES, ['Freshman', 'Intern', 'Erasmus']);
  for (const key of ['reactionFrames', 'aimError', 'attackChance', 'specialChance', 'stompChance', 'leaderBias', 'itemReach', 'pressHold', 'pressGap']) {
    assert.equal(typeof M[key], 'number', key);
  }
});

test('same seed, same match: two runs with bots give identical states after 3,000 frames', () => {
  const run = () => botMatch({ stage: 'beach', fighters: ['surfer_girl', 'lisboa_og', 'house_dj'], bots: [0, 1, 2], seed: 11, frames: 3000, settings: { items: true, hazards: true, lives: 3 } });
  assert.equal(fingerprint(run()), fingerprint(run()));
});

test('alone on each stage, a bot does not fall off by itself in 60 s', () => {
  for (const stage of STAGE_IDS) {
    for (const corner of ['left', 'right']) {
      const state = fresh({ stage });
      const ground = state.stage.platforms[0];
      const foe = state.fighters[1];
      const bot = createBot({ slot: 0, seed: 3 });
      let falls = 0;
      for (let i = 0; i < 60 * SECOND; i++) {
        // The opponent stands still in a far corner and cannot be hit, so the bot keeps trying.
        Object.assign(foe, { x: corner === 'left' ? ground.x + 12 : ground.x + ground.w - 12, y: ground.y, vx: 0, vy: 0, onGround: true, groundId: 0, invincible: 99 });
        for (const e of step(state, { 0: botInput(bot, state) })) if (e.type === 'ko' && e.slot === 0) falls += 1;
      }
      assert.equal(falls, 0, `${stage}, ${corner} corner`);
    }
  }
});

test('recovery: a bot beside the main ground and below its level gets back onto the stage', () => {
  for (const stage of STAGE_IDS) {
    for (const side of [-1, 1]) {
      const state = fresh({ stage });
      const ground = state.stage.platforms[0];
      const me = state.fighters[0];
      Object.assign(state.fighters[1], { x: 640 });
      const x = side < 0 ? ground.x - 70 : ground.x + ground.w + 70;
      Object.assign(me, { x, y: ground.y + 50, vx: 0, vy: 0, onGround: false, groundId: -1, jumpsLeft: 1, facing: -side });
      const bot = createBot({ slot: 0, seed: 9 });
      let back = false;
      for (let i = 0; i < 4 * SECOND && me.state === 'alive'; i++) {
        step(state, { 0: botInput(bot, state) });
        if (me.onGround && me.x >= ground.x && me.x <= ground.x + ground.w) back = true;
      }
      assert.ok(back && me.state === 'alive' && me.stats.falls === 0, `${stage}, ${side < 0 ? 'left' : 'right'}`);
    }
  }
});

test('a bot beats a standing opponent (1 life) within 30 s on each stage', () => {
  for (const stage of STAGE_IDS) {
    const state = botMatch({ stage, fighters: ['bairro_chad', 'lisboa_og'], bots: [0], seed: 21, settings: { lives: 1 }, frames: 30 * SECOND + 200 });
    assert.ok(state.phase === 'finalKo' || state.phase === 'ended', stage);
    assert.equal(state.winner, 0, stage);
  }
});

test('two medium bots, 1 life, items and hazards on, end the match within 3 minutes on each stage', () => {
  for (const stage of STAGE_IDS) {
    const state = botMatch({ stage, fighters: ['finance_bro', 'wannabe_influencer'], bots: [0, 1], seed: 8, settings: { lives: 1, items: true, hazards: true }, frames: 180 * SECOND });
    assert.ok(state.phase === 'finalKo' || state.phase === 'ended', `${stage}: still running after 3 minutes`);
  }
});

// A bot standing on platform `from` (at x, or its middle) and a standing opponent on platform
// `to`. Returns the frame the bot first stands on `to`, or -1 if it does not within `seconds`.
function reachPlatform({ stage, from, to, x = null, level = 'medium', seconds = 8 }) {
  const state = fresh({ stage, seed: 4 });
  const P = state.stage.platforms;
  const place = (f, i, at) => Object.assign(f, { x: at ?? P[i].x + P[i].w / 2, y: P[i].y, vx: 0, vy: 0, onGround: true, groundId: i, invincible: 0 });
  place(state.fighters[0], from, x);
  place(state.fighters[1], to, null);
  const bot = createBot({ slot: 0, level, seed: 4 });
  for (let i = 0; i < seconds * SECOND; i++) {
    step(state, { 0: botInput(bot, state), 1: neutralInput() });
    const me = state.fighters[0];
    if (me.state !== 'alive') return -1;
    if (me.onGround && me.groundId === to) return i;
  }
  return -1;
}

test('ways: on each stage a bot gets from every platform to every other one within 8 s', () => {
  for (const stage of STAGE_IDS) {
    const n = getStage(stage).platforms.length;
    for (let from = 0; from < n; from++) {
      for (let to = 0; to < n; to++) {
        if (from !== to) assert.ok(reachPlatform({ stage, from, to }) >= 0, `${stage}: platform ${from} to ${to}`);
      }
    }
  }
});

test('ways (D-181): a bot standing still at the drop point of a balcony gets to the other balcony', () => {
  // It used to drop, count as on the street at once and double-jump straight back up towards
  // the far balcony, landing where it started, again and again.
  const P = getStage('bairro').platforms;
  const from = P.findIndex((p) => p.id === 'balcony-left');
  const to = P.findIndex((p) => p.id === 'balcony-right');
  for (const level of BOT_LEVELS) {
    assert.ok(reachPlatform({ stage: 'bairro', from, to, x: 350, level, seconds: 5 }) >= 0, level);
  }
});

test('reaction delay: the first move towards a target comes no sooner than reactionFrames', () => {
  const state = fresh();
  const [me, foe] = state.fighters;
  Object.assign(me, { x: 640 });
  Object.assign(foe, { x: 200 });
  const bot = createBot({ slot: 0, seed: 4 });
  for (let i = 0; i < 30; i++) {
    Object.assign(foe, { x: 200, vx: 0 });
    step(state, { 0: botInput(bot, state) });
  }
  // The target appears on the other side.
  let firstRight = -1;
  for (let i = 0; i < 60; i++) {
    Object.assign(foe, { x: 1100, vx: 0 });
    const inp = botInput(bot, state);
    if (inp.right && firstRight < 0) firstRight = i;
    step(state, { 0: inp });
  }
  assert.ok(firstRight >= M.reactionFrames, `first move right after ${firstRight} frames`);
  assert.ok(firstRight < M.reactionFrames + 30, 'it does turn round');
});

test('hazards: before the announcement the input is the same with and without the hazard queued', () => {
  const settings = { lives: 3, items: true, hazardMinS: 6, hazardMaxS: 6 };
  const a = fresh({ stage: 'campus', settings: { ...settings, hazards: true }, seed: 12 });
  const b = fresh({ stage: 'campus', settings: { ...settings, hazards: false }, seed: 12 });
  const bots = [a, b].map(() => [createBot({ slot: 0, seed: 12 }), createBot({ slot: 1, seed: 12 })]);
  let warned = false;
  for (let i = 0; i < 20 * SECOND && !warned; i++) {
    const ia = { 0: botInput(bots[0][0], a), 1: botInput(bots[0][1], a) };
    const ib = { 0: botInput(bots[1][0], b), 1: botInput(bots[1][1], b) };
    assert.deepEqual(ia, ib, `frame ${a.frame}`);
    warned = step(a, ia).some((e) => e.type === 'hazardWarn');
    step(b, ib);
  }
  assert.ok(warned, 'the hazard was announced');
});

test('hazards: once announced, a bot on the hazard level leaves it', () => {
  const cases = [['campus', 'train'], ['beach', 'wave'], ['beach', 'sun'], ['bairro', 'crowd'], ['bairro', 'fireworks']];
  for (const [stage, id] of cases) {
    const state = fresh({ stage, settings: { hazards: true, hazardMinS: 600, hazardMaxS: 600 } });
    const [me, foe] = state.fighters;
    const bot = createBot({ slot: 0, seed: 2 });
    for (let i = 0; i < SECOND; i++) step(state, { 0: botInput(bot, state) });
    Object.assign(me, { x: 640, y: 600, vx: 0, vy: 0, onGround: true, groundId: 0 });
    Object.assign(foe, { x: 1100, y: 600 });
    beginWarning(state, { id });
    let left = false;
    for (let i = 0; i < WARN_FRAMES; i++) {
      step(state, { 0: botInput(bot, state) });
      if (i >= M.reactionFrames && me.onGround && me.y <= CONFIG.levels.groundAbove) left = true;
    }
    assert.ok(left, `${stage} ${id}: still on the ground level when it starts`);
  }
});

test('tipsy (D-185): a bot first steers the wrong way, then steers around the swap', () => {
  const state = fresh();
  const [me, foe] = state.fighters;
  const bot = createBot({ slot: 0, seed: 5 });
  bot.cfg = { ...bot.cfg, tipsySlipChance: 0, hesitateChance: 0 };
  const presses = [];
  for (let i = 0; i < 40 + M.tipsyAdaptFrames; i++) {
    // The target stands far to the right; the bot is held in place and stays tipsy.
    Object.assign(me, { x: 400, vx: 0, tipsy: 99 });
    Object.assign(foe, { x: 1100, vx: 0, invincible: 99 });
    const inp = botInput(bot, state);
    presses.push(inp.right ? 'right' : inp.left ? 'left' : '-');
    step(state, { 0: inp });
  }
  const early = presses.slice(0, M.tipsyAdaptFrames);
  const late = presses.slice(M.tipsyAdaptFrames + 1);
  assert.ok(early.includes('right') && !early.includes('left'), `first ${M.tipsyAdaptFrames} frames: ${early.join(' ')}`);
  assert.ok(late.includes('left') && !late.includes('right'), `after that: ${late.join(' ')}`);
});

test('tipsy (D-185): with tipsySlipChance 1 a bot that has adapted keeps getting it wrong', () => {
  const state = fresh();
  const [me, foe] = state.fighters;
  const bot = createBot({ slot: 0, seed: 5 });
  bot.cfg = { ...bot.cfg, tipsySlipChance: 1, hesitateChance: 0 };
  let left = 0;
  for (let i = 0; i < 40 + M.tipsyAdaptFrames; i++) {
    Object.assign(me, { x: 400, vx: 0, tipsy: 99 });
    Object.assign(foe, { x: 1100, vx: 0, invincible: 99 });
    const inp = botInput(bot, state);
    if (inp.left) left += 1;
    step(state, { 0: inp });
  }
  assert.equal(left, 0);
});

test('hazards (D-185): with hazardMissChance 1 a bot stays during the warning and leaves once the hazard is active', () => {
  const state = fresh({ stage: 'campus', settings: { hazards: true, hazardMinS: 600, hazardMaxS: 600 } });
  const [me, foe] = state.fighters;
  const bot = createBot({ slot: 0, seed: 2 });
  bot.cfg = { ...bot.cfg, hazardMissChance: 1 };
  for (let i = 0; i < SECOND; i++) step(state, { 0: botInput(bot, state) });
  Object.assign(me, { x: 640, y: 600, vx: 0, vy: 0, onGround: true, groundId: 0 });
  Object.assign(foe, { x: 1100, y: 600 });
  // A bot that saw the warning leaves the ground level in this time (test above).
  beginWarning(state, { id: 'train' });
  let upDuringWarning = false;
  for (let i = 0; i < WARN_FRAMES; i++) {
    step(state, { 0: botInput(bot, state) });
    if (me.onGround && me.y <= CONFIG.levels.groundAbove) upDuringWarning = true;
  }
  assert.equal(upDuringWarning, false, 'it left the ground level during the warning');
  assert.notEqual(state.hazard.phase, 'warn');
  let up = false;
  for (let i = 0; i < 3 * SECOND && !up; i++) {
    step(state, { 0: botInput(bot, state) });
    if (me.onGround && me.y <= CONFIG.levels.groundAbove) up = true;
  }
  assert.ok(up, 'still on the ground level 3 s after the hazard started');
});

test('botInput never changes the state it gets', () => {
  const state = fresh({ stage: 'bairro', settings: { items: true, hazards: true, hazardMinS: 1, hazardMaxS: 2 } });
  const bots = [createBot({ slot: 0, seed: 1 }), createBot({ slot: 1, seed: 1 })];
  for (let i = 0; i < 900; i++) {
    const before = JSON.stringify(state);
    const inputs = { 0: botInput(bots[0], state), 1: botInput(bots[1], state) };
    assert.equal(JSON.stringify(state), before);
    step(state, inputs);
  }
});

test('a bot presses like a thumb: every press is held at least pressHold frames, with pressGap before the next', () => {
  const state = botMatch({ stage: 'campus', bots: [0, 1], seed: 6, frames: 1 });
  const bot = createBot({ slot: 0, seed: 6 });
  const runs = { attack: [], jump: [], special: [] };
  const last = { attack: null, jump: null, special: null };
  let held = { attack: 0, jump: 0, special: 0 };
  for (let i = 0; i < 1500 && state.phase === 'fight'; i++) {
    const inp = botInput(bot, state);
    for (const key of Object.keys(runs)) {
      if (inp[key]) {
        if (held[key] === 0 && last[key] !== null) runs[key].push(i - last[key]);
        held[key] += 1;
      } else if (held[key] > 0) {
        assert.ok(held[key] >= M.pressHold, `${key} held ${held[key]} frames`);
        held = { ...held, [key]: 0 };
        last[key] = i;
      }
    }
    step(state, { 0: inp, 1: neutralInput() });
  }
  for (const key of Object.keys(runs)) for (const gap of runs[key]) assert.ok(gap >= M.pressGap, `${key} pressed again after ${gap} frames`);
});

test('tuning: a scripted simple human with a quarter-second reaction wins some matches against a medium bot, but not all', () => {
  const fighters = ['finance_bro', 'maastricht_blondie', 'bairro_chad', 'surfer_girl', 'wannabe_influencer', 'house_dj', 'lisboa_og', 'carcavelos_gang_member'];
  let humanWins = 0;
  let played = 0;
  for (const stage of STAGE_IDS) {
    for (let s = 1; s <= 5; s++) {
      const state = botMatch({ stage, bots: [0], fighters: [fighters[s % 8], fighters[(s * 3 + 1) % 8]], seed: s * 13, settings: { lives: 2, items: true, hazards: true }, frames: 300 * SECOND, others: simpleHuman({ reaction: 15 }) });
      played += 1;
      if (state.winner === 1) humanWins += 1;
    }
  }
  assert.ok(humanWins >= 3 && humanWins <= played - 2, `the simple human won ${humanWins} of ${played}`);
});

// ---- the levels (GAME_SPEC §5a, D-175, D-176): the same tests for Easy, Medium and Hard ----

const LEVEL_TUNING_FIGHTERS = ['finance_bro', 'maastricht_blondie', 'bairro_chad', 'surfer_girl', 'wannabe_influencer', 'house_dj', 'lisboa_og', 'carcavelos_gang_member'];

test('levels: easy, medium and hard in order, each with the keys of medium and the human limits', () => {
  assert.deepEqual(BOT_LEVELS, ['easy', 'medium', 'hard']);
  const keys = Object.keys(M).sort();
  for (const level of BOT_LEVELS) {
    const cfg = CONFIG.bots[level];
    assert.deepEqual(Object.keys(cfg).sort(), keys, level);
    for (const key of keys) assert.equal(typeof cfg[key], 'number', `${level}.${key}`);
    assert.ok(cfg.reactionFrames >= 6, `${level}: reactionFrames ${cfg.reactionFrames}`);
    assert.equal(cfg.pressHold, 2, level);
    assert.equal(cfg.pressGap, 8, level);
  }
  // Easy reacts later and attacks less than Medium, Hard sooner and more.
  assert.ok(CONFIG.bots.easy.reactionFrames > M.reactionFrames && M.reactionFrames > CONFIG.bots.hard.reactionFrames);
  assert.ok(CONFIG.bots.easy.attackChance < M.attackChance && M.attackChance < CONFIG.bots.hard.attackChance);
});

test('levels: a bot takes the numbers of its level, an unknown level plays as medium', () => {
  for (const level of BOT_LEVELS) {
    const bot = createBot({ slot: 0, level, seed: 1 });
    assert.equal(bot.level, level);
    assert.equal(bot.cfg, CONFIG.bots[level]);
  }
  assert.equal(createBot({ slot: 0, level: 'god', seed: 1 }).cfg, M);
  assert.equal(createBot({ slot: 0, seed: 1 }).cfg, M);
});

for (const level of BOT_LEVELS) {
  const L = CONFIG.bots[level];

  test(`${level}: alone on each stage, the bot does not fall off by itself in 60 s`, () => {
    for (const stage of STAGE_IDS) {
      for (const corner of ['left', 'right']) {
        const state = fresh({ stage });
        const ground = state.stage.platforms[0];
        const foe = state.fighters[1];
        const bot = createBot({ slot: 0, level, seed: 3 });
        let falls = 0;
        for (let i = 0; i < 60 * SECOND; i++) {
          Object.assign(foe, { x: corner === 'left' ? ground.x + 12 : ground.x + ground.w - 12, y: ground.y, vx: 0, vy: 0, onGround: true, groundId: 0, invincible: 99 });
          for (const e of step(state, { 0: botInput(bot, state) })) if (e.type === 'ko' && e.slot === 0) falls += 1;
        }
        assert.equal(falls, 0, `${level}, ${stage}, ${corner} corner`);
      }
    }
  });

  test(`${level}: recovery from beside the main ground and below its level, on each stage`, () => {
    for (const stage of STAGE_IDS) {
      for (const side of [-1, 1]) {
        const state = fresh({ stage });
        const ground = state.stage.platforms[0];
        const me = state.fighters[0];
        Object.assign(state.fighters[1], { x: 640 });
        const x = side < 0 ? ground.x - 70 : ground.x + ground.w + 70;
        Object.assign(me, { x, y: ground.y + 50, vx: 0, vy: 0, onGround: false, groundId: -1, jumpsLeft: 1, facing: -side });
        const bot = createBot({ slot: 0, level, seed: 9 });
        let back = false;
        for (let i = 0; i < 4 * SECOND && me.state === 'alive'; i++) {
          step(state, { 0: botInput(bot, state) });
          if (me.onGround && me.x >= ground.x && me.x <= ground.x + ground.w) back = true;
        }
        assert.ok(back && me.state === 'alive' && me.stats.falls === 0, `${level}, ${stage}, ${side < 0 ? 'left' : 'right'}`);
      }
    }
  });

  const beatSeconds = level === 'easy' ? 60 : 30;
  test(`${level}: the bot beats a standing opponent (1 life) within ${beatSeconds} s on each stage`, () => {
    for (const stage of STAGE_IDS) {
      const state = botMatch({ stage, level, fighters: ['bairro_chad', 'lisboa_og'], bots: [0], seed: 21, settings: { lives: 1 }, frames: beatSeconds * SECOND + 200 });
      assert.ok(state.phase === 'finalKo' || state.phase === 'ended', `${level}, ${stage}`);
      assert.equal(state.winner, 0, `${level}, ${stage}`);
    }
  });

  const endMinutes = level === 'easy' ? 4 : 3;
  test(`${level}: two bots, 1 life, items and hazards on, end the match within ${endMinutes} minutes on each stage`, () => {
    for (const stage of STAGE_IDS) {
      const state = botMatch({ stage, level, fighters: ['finance_bro', 'wannabe_influencer'], bots: [0, 1], seed: 8, settings: { lives: 1, items: true, hazards: true }, frames: endMinutes * 60 * SECOND });
      assert.ok(state.phase === 'finalKo' || state.phase === 'ended', `${level}, ${stage}: still running after ${endMinutes} minutes`);
    }
  });

  test(`${level}: the first move towards a target comes no sooner than ${L.reactionFrames} frames`, () => {
    const state = fresh();
    const [me, foe] = state.fighters;
    Object.assign(me, { x: 640 });
    Object.assign(foe, { x: 200 });
    const bot = createBot({ slot: 0, level, seed: 4 });
    for (let i = 0; i < 30; i++) {
      Object.assign(foe, { x: 200, vx: 0 });
      step(state, { 0: botInput(bot, state) });
    }
    let firstRight = -1;
    for (let i = 0; i < 90; i++) {
      Object.assign(foe, { x: 1100, vx: 0 });
      const inp = botInput(bot, state);
      if (inp.right && firstRight < 0) firstRight = i;
      step(state, { 0: inp });
    }
    assert.ok(firstRight >= L.reactionFrames, `${level}: first move right after ${firstRight} frames`);
    assert.ok(firstRight < L.reactionFrames + L.hesitateFrames + 30, `${level}: it does turn round`);
  });
}

test('tuning (D-176): the simple human wins most against Easy, some against Medium, few against Hard, on the same seeds', () => {
  const wins = {};
  for (const level of BOT_LEVELS) {
    wins[level] = 0;
    for (const stage of STAGE_IDS) {
      for (let s = 1; s <= 5; s++) {
        const F = LEVEL_TUNING_FIGHTERS;
        const state = botMatch({ stage, level, bots: [0], fighters: [F[s % 8], F[(s * 3 + 1) % 8]], seed: s * 13, settings: { lives: 2, items: true, hazards: true }, frames: 300 * SECOND, others: simpleHuman({ reaction: 15 }) });
        if (state.winner === 1) wins[level] += 1;
      }
    }
  }
  const msg = `the simple human won ${wins.easy} (easy), ${wins.medium} (medium), ${wins.hard} (hard) of 15`;
  assert.ok(wins.easy >= 11, msg);
  assert.ok(wins.medium >= 3 && wins.medium <= 13, msg);
  assert.ok(wins.hard >= 1 && wins.hard <= 8, msg);
  assert.ok(wins.easy > wins.medium && wins.medium > wins.hard, msg);
});
