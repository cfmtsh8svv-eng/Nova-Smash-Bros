// The eight fighters: stats, attack names and the numbers of each special.
// How a fighter looks is defined in public/shared/art/characters.js.
import { seconds } from './config.js';

export const FIGHTERS = [
  {
    id: 'finance_bro', name: 'Finance Bro', color: '#2f7fe0', weight: 100, speed: 3,
    normal: 'Laptop Swing', normalStyle: 'swing',
    special: {
      id: 'cash_rain', name: 'Cash Rain', item: 'banknotes', cooldown: seconds(7),
      text: 'Banknotes rain in a radius around him. Opponents inside slip and slide away.',
      phone: 'You slipped on cash!', flash: '#3fbf6f',
      radius: 220, damage: 6, slipFrames: seconds(1.5), push: 9, at: 10, total: 36,
    },
  },
  {
    id: 'maastricht_blondie', name: 'Maastricht Blondie', color: '#e85d9c', weight: 85, speed: 4,
    normal: 'Tote Bag Swing', normalStyle: 'swing',
    special: {
      id: 'padel_smash', name: 'Padel Smash', item: 'racket', cooldown: seconds(7),
      text: 'Hits a padel ball forward. Heavy damage on the first opponent it hits.',
      phone: 'Smashed!', flash: '#e63946',
      range: 510, speed: 17, size: 18, damage: 18, baseKb: 7, kbGrowth: 12, angleDeg: 32, at: 8, total: 30,
    },
  },
  {
    id: 'bairro_chad', name: 'Bairro Chad', color: '#e63946', weight: 120, speed: 2,
    normal: 'Beer Throw', normalStyle: 'throw',
    special: {
      id: 'rounds_on_me', name: "Round's On Me", item: 'beer', cooldown: seconds(8),
      text: 'Slams his cup down. Everyone in a radius is tipsy for 4 s.',
      phone: "You're drunk! Drink water!", flash: '#f0a81e',
      radius: 200, damage: 4, tipsyFrames: seconds(4), at: 10, total: 36,
    },
  },
  {
    id: 'surfer_girl', name: 'Surfer Girl', color: '#1aa6a6', weight: 85, speed: 5,
    normal: 'Board Swipe', normalStyle: 'swing',
    special: {
      id: 'wave_rider', name: 'Wave Rider', item: 'board', cooldown: seconds(6),
      text: 'Surfs forward on a small wave and pushes opponents along.',
      phone: 'Wipeout!', flash: '#3fd0e0',
      range: 360, speed: 12, damage: 10, reach: 22, endStun: 16, at: 4, total: 40,
    },
  },
  {
    id: 'wannabe_influencer', name: 'Wannabe Influencer', color: '#e0457b', weight: 90, speed: 4,
    normal: 'Selfie Stick Poke', normalStyle: 'poke',
    special: {
      id: 'ring_light_flash', name: 'Ring Light Flash', item: 'ringlight', cooldown: seconds(7),
      text: 'Pulls out a ring light. Only the nearest opponent is hit: stunned for 1 s, their phone flashes white.',
      phone: 'Blinded! No filter can save you.', flash: '#ffffff',
      radius: 320, damage: 5, stunFrames: seconds(1), at: 8, total: 30,
    },
  },
  {
    id: 'house_dj', name: 'House DJ', color: '#ff7a3d', weight: 100, speed: 3,
    normal: 'Vinyl Throw', normalStyle: 'throw',
    special: {
      id: 'bass_drop', name: 'Bass Drop', item: 'speaker', cooldown: seconds(8),
      text: 'Jumps and slams down. The shockwave launches everyone in a radius upward.',
      phone: 'BASS DROP!', flash: '#ff7a3d',
      radius: 180, damage: 12, baseKb: 7, kbGrowth: 9, hop: 11, slam: 18, slamAt: 12, maxAir: 50, recovery: 14,
    },
  },
  {
    id: 'lisboa_og', name: 'Lisboa OG', color: '#22a36b', weight: 115, speed: 2,
    normal: 'Sardine Slap', normalStyle: 'swing',
    special: {
      id: 'ding_ding', name: 'Ding-Ding', item: 'minitram', cooldown: seconds(7),
      text: 'Sends a mini Tram 28 rolling along the ground in the direction he faces.',
      phone: 'Run over by the 28!', flash: '#f6c343',
      range: 760, speed: 8, w: 70, h: 44, damage: 12, baseKb: 6, kbGrowth: 9, angleDeg: 15, toss: 15, at: 10, total: 30,
    },
  },
  {
    id: 'carcavelos_gang_member', name: 'Carcavelos Gang Member', color: '#e0a81e', weight: 100, speed: 3,
    normal: 'Pizza Throw', normalStyle: 'throw',
    special: {
      id: 'spaghetti_lasso', name: 'Spaghetti Lasso', item: 'pasta', cooldown: seconds(6),
      text: 'Throws a spaghetti lasso forward and pulls the first opponent it hits towards him.',
      phone: 'Caught in the pasta!', flash: '#f6c343',
      range: 380, thickness: 64, damage: 6, stunFrames: seconds(0.4), pullFrames: 10, pullGap: 56, at: 8, total: 34,
    },
  },
];

export const FIGHTER_IDS = FIGHTERS.map((f) => f.id);
const BY_ID = new Map(FIGHTERS.map((f) => [f.id, f]));
export const getFighter = (id) => BY_ID.get(id) || null;
