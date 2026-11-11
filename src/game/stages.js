// The three stages as the rules see them: platforms, start positions and hazards.
// The art in public/shared/art/stages.js draws exactly these platforms.
// A platform is a line you can stand on. "solid" platforms are the main ground:
// they have a body (h) that cannot be passed from any side. All others can be
// jumped through from below and dropped through with Down.

export const STAGES = [
  {
    id: 'campus', name: 'Nova SBE Campus', time: 'day', trim: 'tile',
    platforms: [
      { id: 'terrace', label: 'the terrace', x: 120, y: 600, w: 1040, h: 66, solid: true },
      { id: 'canopy', label: 'the Student Hall canopy', x: 130, y: 470, w: 190 },
      { id: 'wing-roof', label: 'the shop roof', x: 960, y: 470, w: 240 },
      { id: 'roof', label: 'the main roof', x: 270, y: 336, w: 740 },
      { id: 'tower-roof', label: 'the tower roof', x: 540, y: 206, w: 220 },
    ],
    spawns: [{ x: 330, y: 600 }, { x: 950, y: 600 }, { x: 540, y: 600 }, { x: 740, y: 600 }],
    respawn: { x: 640, y: 60 },
    hazards: ['train', 'wifi'],
  },
  {
    id: 'beach', name: 'Carcavelos Beach', time: 'day', trim: 'life',
    platforms: [
      { id: 'sand', label: 'the sand', x: 120, y: 600, w: 1040, h: 120, solid: true },
      { id: 'bar-roof', label: 'the surf bar roof', x: 150, y: 470, w: 260 },
      { id: 'acai-roof', label: 'the kiosk roof', x: 900, y: 480, w: 230 },
      { id: 'tower-deck', label: 'the lifeguard deck', x: 660, y: 350, w: 220 },
      { id: 'tower-roof', label: 'the lifeguard roof', x: 690, y: 240, w: 160 },
    ],
    spawns: [{ x: 330, y: 600 }, { x: 950, y: 600 }, { x: 540, y: 600 }, { x: 740, y: 600 }],
    respawn: { x: 640, y: 60 },
    hazards: ['wave', 'gulls'],
  },
  {
    id: 'bairro', name: 'Bairro Alto', time: 'night', trim: 'tram',
    platforms: [
      { id: 'street', label: 'the street', x: 120, y: 600, w: 1040, h: 70, solid: true },
      { id: 'balcony-left', label: 'the left balcony', x: 100, y: 470, w: 280 },
      { id: 'balcony-right', label: 'the right balcony', x: 900, y: 470, w: 280 },
      { id: 'bar-terrace', label: "The Spot's terrace", x: 460, y: 336, w: 360 },
      { id: 'roof-right', label: 'the right roof', x: 850, y: 336, w: 400 },
      { id: 'roof-left', label: 'the left roof', x: 30, y: 214, w: 400 },
    ],
    spawns: [{ x: 330, y: 600 }, { x: 950, y: 600 }, { x: 540, y: 600 }, { x: 740, y: 600 }],
    respawn: { x: 640, y: 60 },
    hazards: ['crowd', 'drinks'],
  },
];

export const STAGE_IDS = STAGES.map((s) => s.id);
const BY_ID = new Map(STAGES.map((s) => [s.id, s]));
export const getStage = (id) => BY_ID.get(id) || null;

// Names shown in the hazard announcement and on the phone vote.
export const HAZARDS = {
  train: { id: 'train', name: 'CASCAIS LINE TRAIN', short: 'Train' },
  wifi: { id: 'wifi', name: 'BAD WI-FI', short: 'Bad Wi-Fi' },
  wave: { id: 'wave', name: 'BIG WAVE', short: 'Big Wave' },
  gulls: { id: 'gulls', name: 'SEAGULLS', short: 'Seagulls' },
  crowd: { id: 'crowd', name: 'DRUNK CROWD', short: 'Drunk Crowd' },
  drinks: { id: 'drinks', name: 'DRINKS', short: 'Drinks' },
};
export const HAZARD_IDS = Object.keys(HAZARDS);
