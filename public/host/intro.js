// The intro before every match (GAME_SPEC §10b, D-153): for 20 s the big screen shows
// the nine items and the three hazards of the stage over the dimmed stage. It ends early
// once every connected player of the match has pressed Skip on the phone. This module
// only draws the screen; main.js decides when it opens and closes.
import { PLAYER_COLORS } from '/game/config.js';
import { ITEM_NAMES, ITEM_TYPES } from '/game/items.js';
import { STAGES } from '/game/stages.js';
import { drawHazardIcon, drawItemShape } from './icons.js';

export const INTRO_MS = 20_000;

// One line per item and per hazard, in plain words for the players.
const ITEM_TEXT = {
  nata: 'Eat it: heals 20 %.',
  sardine: 'Next 5 hits launch hard. Powers your stomp.',
  book: 'Your next attack throws it: 14 %.',
  project: 'Hot potato! Hit someone to pass it before the 5 s deadline.',
  bifana: 'Heavier for 10 s: much harder to launch.',
  megaphone: 'Next 3 attacks: a wide sound blast that pushes.',
  cork: 'Blocks the next hit completely.',
  azulejo: 'Throw it: it shatters into 3 shards.',
  rooster: 'Invincible for 5 s.',
};
const HAZARD_TEXT = { // colour behind the picture, name, what it does
  train: ['#f6c343', 'Cascais Line Train', 'Rolls across the terrace: 20 %. Get up high.'],
  wifi: ['#8fb4d9', 'Bad Wi-Fi', 'One zone gets 200 ms input lag for 6 s.'],
  rain: ['#5fa8e8', 'Sudden Rain', 'Everything is slippery for 6 s.'],
  wave: ['#5fc8e8', 'Big Wave', 'Rolls over the sand and drags you off. Jump!'],
  gulls: ['#5fa8e8', 'Seagulls', 'They steal the item in your hand.'],
  sun: ['#ff9a3d', 'Midday Sun', 'Burns everyone on the sand. Get in the shade.'],
  crowd: ['#c58af0', 'Drunk Crowd', 'Pushes along the street and drags you with it.'],
  drinks: ['#f6c343', 'Drinks', 'Left and right swapped for 8 s.'],
  fireworks: ['#e85d9c', 'Fireworks', 'Five rockets launch anyone in the street sky-high.'],
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function createIntro($) {
  let icons = []; // [canvas, draw]
  let tick = 0;
  let raf = 0;
  let endsAt = 0;
  let players = [];

  function card(icon, name, text, delay, extra = '') {
    const box = el('div', `card ${extra}`.trim());
    box.style.animationDelay = `${delay}s`;
    const words = el('div');
    const title = el('div', 'n', name);
    if (extra.includes('rare')) title.append(el('span', 'rareTag', 'RARE'));
    words.append(title, el('div', 't', text));
    box.append(icon, words);
    return box;
  }

  function icon(draw) {
    const canvas = el('canvas');
    canvas.width = 104;
    canvas.height = 104;
    icons.push([canvas, draw]);
    return canvas;
  }

  function drawIcons() {
    tick += 1;
    for (const [canvas, draw] of icons) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw(ctx);
    }
    const left = Math.max(0, endsAt - performance.now());
    $('introBar').style.transform = `scaleX(${left / INTRO_MS})`;
    $('introSecs').textContent = String(Math.ceil(left / 1000));
    raf = requestAnimationFrame(drawIcons);
  }

  // players: [{ slot, connected, skipped }]
  function renderPips(list = players) {
    players = list;
    $('introPips').replaceChildren(...players.map((p) => {
      const pip = el('div', `pip${p.connected ? '' : ' gone'}${p.skipped ? ' yes' : ''}`, String(p.slot + 1));
      pip.style.setProperty('--p', PLAYER_COLORS[p.slot]);
      pip.title = `P${p.slot + 1}`;
      return pip;
    }));
  }

  function open(stageId, list) {
    const stage = STAGES.find((s) => s.id === stageId);
    icons = [];
    $('introStage').replaceChildren('Next stage: ', el('b', '', stage.name), ` · ${stage.time === 'night' ? 'Night' : 'Day'}`);
    $('introItems').replaceChildren(...ITEM_TYPES.map((type, i) => card(
      icon((ctx) => {
        ctx.translate(54, 92 + Math.sin(tick / 18 + i) * 2);
        ctx.scale(2, 2);
        drawItemShape(ctx, type, tick);
      }),
      ITEM_NAMES[type], ITEM_TEXT[type], 0.15 + i * 0.12, type === 'rooster' ? 'rare' : '',
    )));
    $('introHazards').replaceChildren(...stage.hazards.map((id, i) => {
      const canvas = icon((ctx) => {
        ctx.translate(52, 52);
        ctx.scale(1.12, 1.12);
        drawHazardIcon(ctx, id, tick);
      });
      canvas.style.setProperty('--hz', HAZARD_TEXT[id][0]);
      return card(canvas, HAZARD_TEXT[id][1], HAZARD_TEXT[id][2], 1.35 + i * 0.15);
    }));
    renderPips(list);
    endsAt = performance.now() + INTRO_MS;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawIcons);
  }

  function close() {
    cancelAnimationFrame(raf);
    raf = 0;
    icons = [];
  }

  return {
    open, close, renderPips,
    get secondsLeft() { return Math.max(0, Math.ceil((endsAt - performance.now()) / 1000)); },
    get over() { return performance.now() >= endsAt; },
  };
}
