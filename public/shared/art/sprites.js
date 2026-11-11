// Turns the SVG drawings into pixel sprites and stage pictures, once, and keeps them.
//
// A fighter sprite goes through the same pipeline as in the design: draw the SVG
// small, snap every pixel to a fixed palette (three tones per colour), then add a
// one-pixel dark outline. Every pose of every fighter in a match is prepared
// before the match starts, so drawing a frame is only copying finished images.
import { buildSvg, INK, LOOKS, POSES, SPRITE } from './characters.js';
import { stageSvg } from './stages.js';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const cache = new Map(); // key -> canvas (ready) or Promise (still rendering)

function loadImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The drawing could not be turned into an image'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

async function renderSprite(fighterId, mainColour, poseName) {
  const look = LOOKS[fighterId];
  const { svg, pal } = buildSvg(look.cfg, mainColour || look.color, POSES[poseName] || POSES.idle);
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE.w;
  canvas.height = SPRITE.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(await loadImage(svg), 1, 1, SPRITE.w - 2, SPRITE.h - 2);
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = data.data;
    const W = canvas.width;
    const H = canvas.height;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 120) { p[i + 3] = 0; continue; }
      let best = 0;
      let bestDistance = 1e9;
      for (let k = 0; k < pal.length; k++) {
        const q = pal[k];
        const d = (p[i] - q[0]) ** 2 + (p[i + 1] - q[1]) ** 2 + (p[i + 2] - q[2]) ** 2;
        if (d < bestDistance) { bestDistance = d; best = k; }
      }
      p[i] = pal[best][0]; p[i + 1] = pal[best][1]; p[i + 2] = pal[best][2]; p[i + 3] = 255;
    }
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) solid[i] = p[i * 4 + 3] ? 1 : 0;
    const ink = hex(INK);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (solid[i]) continue;
        if ((x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < H - 1 && solid[i + W])) {
          p[i * 4] = ink[0]; p[i * 4 + 1] = ink[1]; p[i * 4 + 2] = ink[2]; p[i * 4 + 3] = 255;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    // A browser that does not let us read the pixels back still shows the smooth drawing.
  }
  return canvas;
}

const spriteKey = (fighterId, mainColour, pose) => `${fighterId}|${mainColour || ''}|${pose}`;

// Returns a promise for the finished sprite canvas.
export function loadSprite(fighterId, mainColour = null, pose = 'idle') {
  const key = spriteKey(fighterId, mainColour, pose);
  if (!cache.has(key)) {
    const job = renderSprite(fighterId, mainColour, pose).then((canvas) => {
      cache.set(key, canvas);
      return canvas;
    }, (err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, job);
  }
  return Promise.resolve(cache.get(key));
}

// Returns the sprite if it is ready, otherwise null (and starts preparing it).
export function getSprite(fighterId, mainColour = null, pose = 'idle') {
  const hit = cache.get(spriteKey(fighterId, mainColour, pose));
  if (hit instanceof HTMLCanvasElement) return hit;
  if (!hit) loadSprite(fighterId, mainColour, pose).catch(() => {});
  return null;
}

// Prepare every pose of one fighter.
export const loadAllPoses = (fighterId, mainColour = null) => Promise.all(Object.keys(POSES).map((pose) => loadSprite(fighterId, mainColour, pose)));

// Draw a fighter sprite into a small canvas element of the page (lobby cards, fighter select, podium).
export async function paintSprite(target, fighterId, { mainColour = null, pose = 'idle', silhouette = false, flip = false } = {}) {
  const sprite = await loadSprite(fighterId, mainColour, pose);
  target.width = SPRITE.w;
  target.height = SPRITE.h;
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.save();
  if (flip) { ctx.translate(target.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(sprite, 0, 0);
  ctx.restore();
  if (silhouette) {
    // Until a player has picked, only the grey shape is shown.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#5b5670';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---- stages ----

let fontCssJob = null;
// An SVG used as an image cannot see the page's fonts, so they are embedded as data URLs.
function fontCss() {
  if (!fontCssJob) {
    const embed = async (family, weight, file) => {
      const bytes = new Uint8Array(await (await fetch(`/shared/fonts/${file}`)).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2")}`;
    };
    fontCssJob = Promise.all([embed('Bungee', 400, 'bungee-400.woff2'), embed('Nunito', 800, 'nunito-800.woff2')])
      .then((parts) => parts.join(''))
      .catch(() => ''); // without the fonts the signs fall back to a system font
  }
  return fontCssJob;
}

const stageCache = new Map();

// Draw a stage once into a canvas of the given pixel size and keep it.
export function loadStage(stageId, width = 1280, height = 720) {
  const key = `${stageId}|${width}x${height}`;
  if (!stageCache.has(key)) {
    const job = (async () => {
      const img = await loadImage(stageSvg(stageId, await fontCss()));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      stageCache.set(key, canvas);
      return canvas;
    })().catch((err) => {
      stageCache.delete(key);
      throw err;
    });
    stageCache.set(key, job);
  }
  return Promise.resolve(stageCache.get(key));
}

export function getStageImage(stageId, width = 1280, height = 720) {
  const hit = stageCache.get(`${stageId}|${width}x${height}`);
  return hit instanceof HTMLCanvasElement ? hit : null;
}
