// The tuning values of the rules live in this file: physics, attacks, specials, items, hazards.
// (The few that belong to the phone or the screen sit where they are used: the joystick
// thresholds in public/play/controls.js, the server's limits in server/config.js.)
// Units: positions in pixels of a 1280x720 space, speeds in pixels per frame,
// times in frames at 60 frames per second (so 60 = one second).

export const SCREEN = { w: 1280, h: 720 };
export const FPS = 60;
export const seconds = (s) => Math.round(s * FPS);

// Player colours P1..P4. Always shown together with the "P1".."P4" label.
export const PLAYER_COLORS = ['#e63946', '#2f7fe0', '#22a36b', '#f6c343'];

export const CONFIG = {
  physics: {
    gravity: 0.6,
    maxFall: 14,
    fastFallExtra: 0.7, // extra gravity while Down is held in the air
    fastFallMax: 20,
    jumpSpeed: 14.15, // reaches about 160 px (gravity is applied before each move)
    doubleJumpSpeed: 12.6,
    runBase: 3.2, // run speed = runBase + runPerSpeed * speed stat (2..5)
    runPerSpeed: 0.6,
    groundAccel: 0.9,
    airAccel: 0.45,
    groundFriction: 0.72, // speed kept per frame when no direction is held
    airFriction: 0.985,
    slipFriction: 0.99, // on banknotes there is almost no grip
    slipControl: 0.12, // share of normal acceleration while slipping
    launchDrag: 0.992, // speed kept per frame while flying in hitstun
    bounceSpeed: 6, // a launched fighter hitting the floor faster than this bounces
    bounceKeep: 0.45,
    dropThroughFrames: 14,
    coyoteFrames: 5, // a jump still counts this long after walking off an edge
    inputBufferFrames: 6, // a press this long before it becomes possible still counts
    pushApart: 0.5, // two fighters standing in each other drift apart
    hitstunGroundFriction: 0.9,
    hitstunMaxFall: 40,
  },
  // The box that can be hit. x is the centre, y is the feet.
  body: { w: 44, h: 96 },
  // Leaving this rectangle is a KO ("LAUNCHED!").
  blast: { left: -170, right: 1450, top: -230, bottom: 900 },
  match: {
    countdownFrames: seconds(3), // 3, 2, 1 ... then BRAWL!
    respawnFrames: seconds(2),
    invincibleFrames: seconds(2),
    burnoutPercent: 200,
    koCreditFrames: seconds(8), // a KO counts for the last attacker this long
    finalKoRealSeconds: 2, // length of the slow motion, in real time
    finalKoTimeScale: 0.25, // simulation speed during it
    hitstunFactor: 2.5, // hitstun frames = launch speed * this
    strongHitSpeed: 11, // a launch at least this fast shakes the screen
    hitPauseMs: { normal: 30, strong: 85, ko: 120 }, // how long the game freezes on a hit (real milliseconds)
    upAngleDeg: 80, // launch angle of a hit that was aimed upward
  },
  // Normal attack: the same numbers for every fighter.
  attack: {
    damage: 8,
    range: 90,
    baseKb: 4,
    kbGrowth: 9,
    angleDeg: 38, // launch angle above the horizon
    startup: 5, // frames before it can hit
    active: 4, // frames in which it hits
    total: 20, // frames until the fighter can act again
    thickness: 76, // height of a sideways swing, width of an upward one
  },
  items: {
    spawnMinS: 12,
    spawnMaxS: 20,
    max: 3,
    size: 36,
    lifetime: seconds(25),
    spawnInFrames: 20, // an item cannot be taken while it is still popping in
    tartHeal: 20,
    espressoBoost: 1.3,
    espressoFrames: seconds(8),
    sardineSwings: 5,
    sardine: { damage: 6, baseKb: 9, kbGrowth: 15 },
    book: { damage: 14, baseKb: 5, kbGrowth: 9, angleDeg: 38, speed: 13, life: 46, size: 30 },
  },
  hazards: {
    minS: 25,
    maxS: 40,
    nameFrames: seconds(1), // the name alone, before the numbers
    countFrames: seconds(1), // each of 3, 2, 1
    cancelledFrames: seconds(2), // how long "STRIKE!" stays
    train: { strikeChance: 0.25, speed: 20, length: 560, height: 104, damage: 20, baseKb: 9, kbGrowth: 10, angleDeg: 30 },
    wifi: { delayFrames: 12, frames: seconds(6) }, // 12 frames = 200 ms
    wave: { speed: 14, width: 200, height: 110, damage: 12, baseKb: 7, kbGrowth: 8, angleDeg: 45 },
    gulls: { frames: seconds(2), reach: 70, peckDamage: 3, peckStun: 14 },
    crowd: { speed: 5, width: 300, height: 100, damage: 5, grip: 0.3 },
    drinks: { count: 3, frames: seconds(8), tipsyFrames: seconds(8), size: 34 },
  },
  // Height bands used by hazards: a fighter is "on the ground level" when the feet are below this line.
  levels: { groundAbove: 520, roofBelow: 400 },
};

// Weight (heavier = flies less far) and speed (2..5) of each fighter.
export const FIGHTER_STATS = {
  finance_bro: { weight: 100, speed: 3 },
  maastricht_blondie: { weight: 85, speed: 4 },
  bairro_chad: { weight: 120, speed: 2 },
  surfer_girl: { weight: 85, speed: 5 },
  wannabe_influencer: { weight: 90, speed: 4 },
  house_dj: { weight: 100, speed: 3 },
  lisboa_og: { weight: 115, speed: 2 },
  carcavelos_gang_member: { weight: 100, speed: 3 },
};

// The numbers of each special. `at` is the frame on which it takes effect,
// `total` the frame on which the fighter can act again.
export const SPECIAL_TUNING = {
  cash_rain: { cooldown: seconds(7), radius: 220, damage: 6, slipFrames: seconds(1.5), push: 9, at: 10, total: 36 },
  padel_smash: { cooldown: seconds(7), range: 510, speed: 17, size: 18, damage: 18, baseKb: 7, kbGrowth: 12, angleDeg: 32, at: 8, total: 30 },
  rounds_on_me: { cooldown: seconds(8), radius: 200, damage: 4, tipsyFrames: seconds(4), at: 10, total: 36 },
  wave_rider: { cooldown: seconds(6), range: 360, speed: 12, damage: 10, reach: 22, endStun: 16, keepSpeed: 0.1, at: 4, total: 40 },
  ring_light_flash: { cooldown: seconds(7), radius: 320, damage: 5, stunFrames: seconds(1), at: 8, total: 30 },
  bass_drop: { cooldown: seconds(8), radius: 180, damage: 12, baseKb: 7, kbGrowth: 9, angleDeg: 80, hop: 11, hopKeepSpeed: 0.3, slam: 18, slamAt: 12, maxAir: 50, recovery: 14 },
  ding_ding: { cooldown: seconds(7), range: 600, speed: 8, w: 70, h: 44, damage: 12, baseKb: 6, kbGrowth: 9, angleDeg: 15, toss: 15, at: 10, total: 30 },
  spaghetti_lasso: { cooldown: seconds(6), range: 380, thickness: 64, damage: 6, stunFrames: seconds(0.4), pullFrames: 10, pullGap: 56, freeAt: 26, at: 8, total: 34 },
};

// Match settings chosen in the lobby. Everything a later "demo mode" needs to
// change is here, so it can be added without touching the rules.
export const DEFAULT_SETTINGS = {
  lives: 3, // 1, 2 or 3
  items: true,
  hazards: true,
  hazardMinS: CONFIG.hazards.minS,
  hazardMaxS: CONFIG.hazards.maxS,
  timeCapS: 0, // 0 = no time limit (the normal game)
};

export function makeSettings(overrides = {}) {
  const s = { ...DEFAULT_SETTINGS, ...overrides };
  // Values may come from a form as text ("2", "false"), so they are converted, not just checked.
  const flag = (v) => !(v === false || v === 0 || v === '0' || v === 'false' || v === 'off' || v === null);
  const seconds = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(3600, Number(v)) : fallback);
  s.lives = [1, 2, 3].includes(Number(s.lives)) && typeof s.lives !== 'boolean' ? Number(s.lives) : DEFAULT_SETTINGS.lives;
  s.items = flag(s.items);
  s.hazards = flag(s.hazards);
  s.hazardMinS = seconds(s.hazardMinS, DEFAULT_SETTINGS.hazardMinS);
  s.hazardMaxS = Math.max(s.hazardMinS, seconds(s.hazardMaxS, DEFAULT_SETTINGS.hazardMaxS));
  s.timeCapS = seconds(s.timeCapS, 0);
  return s;
}
