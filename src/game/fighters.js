// The eight fighters: stats, attack names and the numbers of each special.
// Their numbers (weight, speed, damage, ranges, cooldowns) are tuning values and live in config.js.
// How a fighter looks is defined in public/shared/art/characters.js.
import { FIGHTER_STATS, SPECIAL_TUNING } from './config.js';

export const FIGHTERS = [
  {
    id: 'finance_bro', name: 'Finance Bro', color: '#2f7fe0',
    normal: 'Laptop Swing', normalStyle: 'swing',
    special: {
      id: 'cash_rain', name: 'Cash Rain', item: 'banknotes',
      text: 'Banknotes rain in a radius around him. Opponents inside slip and slide away.',
      phone: 'You slipped on cash!', flash: '#3fbf6f',
    },
  },
  {
    id: 'maastricht_blondie', name: 'Maastricht Blondie', color: '#e85d9c',
    normal: 'Tote Bag Swing', normalStyle: 'swing',
    special: {
      id: 'padel_smash', name: 'Padel Smash', item: 'racket',
      text: 'Hits a padel ball forward. Heavy damage on the first opponent it hits.',
      phone: 'Smashed!', flash: '#e63946',
    },
  },
  {
    id: 'bairro_chad', name: 'Bairro Chad', color: '#e63946',
    normal: 'Beer Throw', normalStyle: 'throw',
    special: {
      id: 'rounds_on_me', name: "Round's On Me", item: 'beer',
      text: 'Slams his cup down. Everyone in a radius is tipsy for 3 s.',
      phone: "You're drunk! Drink water!", flash: '#f0a81e',
    },
  },
  {
    id: 'surfer_girl', name: 'Surfer Girl', color: '#1aa6a6',
    normal: 'Board Swipe', normalStyle: 'swing',
    special: {
      id: 'wave_rider', name: 'Wave Rider', item: 'board',
      text: 'Surfs forward on a small wave and pushes opponents along.',
      phone: 'Wipeout!', flash: '#3fd0e0',
    },
  },
  {
    id: 'wannabe_influencer', name: 'Wannabe Influencer', color: '#e0457b',
    normal: 'Selfie Stick Poke', normalStyle: 'poke',
    special: {
      id: 'ring_light_flash', name: 'Ring Light Flash', item: 'ringlight',
      text: 'Pulls out a ring light. Only the nearest opponent is hit: stunned for 1 s, their phone flashes white.',
      phone: 'Blinded! No filter can save you.', flash: '#ffffff',
    },
  },
  {
    id: 'house_dj', name: 'House DJ', color: '#ff7a3d',
    normal: 'Vinyl Throw', normalStyle: 'throw',
    special: {
      id: 'bass_drop', name: 'Bass Drop', item: 'speaker',
      text: 'Jumps and slams down. The shockwave launches everyone in a radius upward.',
      phone: 'BASS DROP!', flash: '#ff7a3d',
    },
  },
  {
    id: 'lisboa_og', name: 'Lisboa OG', color: '#22a36b',
    normal: 'Sardine Slap', normalStyle: 'swing',
    special: {
      id: 'ding_ding', name: 'Ding-Ding', item: 'minitram',
      text: 'Sends a mini Tram 28 rolling along the ground in the direction he faces.',
      phone: 'Run over by the 28!', flash: '#f6c343',
    },
  },
  {
    id: 'carcavelos_gang_member', name: 'Carcavelos Gang Member', color: '#e0a81e',
    normal: 'Pizza Throw', normalStyle: 'throw',
    special: {
      id: 'spaghetti_lasso', name: 'Spaghetti Lasso', item: 'pasta',
      text: 'Throws a spaghetti lasso forward and pulls the first opponent it hits towards him.',
      phone: 'Caught in the pasta!', flash: '#f6c343',
    },
  },
];

// Merge in the numbers from config.js, so each fighter object is complete.
for (const f of FIGHTERS) {
  Object.assign(f, FIGHTER_STATS[f.id]);
  Object.assign(f.special, SPECIAL_TUNING[f.special.id]);
}

export const FIGHTER_IDS = FIGHTERS.map((f) => f.id);
const BY_ID = new Map(FIGHTERS.map((f) => [f.id, f]));
export const getFighter = (id) => BY_ID.get(id) || null;
