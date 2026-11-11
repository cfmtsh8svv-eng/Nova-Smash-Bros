// Stage art: the three stages drawn in code as SVG, ported unchanged from design/final/stages.js.
// The platform positions are imported from the game rules (src/game/stages.js), so the
// picture and the physics always agree. Every playable surface carries the stage's striped trim.
import { getStage } from '/game/stages.js';

const platformsOf = (id) => getStage(id).platforms;

const R = (x, y, w, h, f, ex = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${ex}/>`;
const seq = (n, fn) => [...Array(n)].map((_, i) => fn(i)).join('');
const grain = (x, y, w, h, o = 0.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" filter="url(#grain)" opacity="${o}"/>`;
const shadow = (x, y, w) => `<ellipse cx="${x + w / 2}" cy="${y + 26}" rx="${w / 2}" ry="7" fill="#0c1420" opacity=".3" filter="url(#b8)"/>`;
const DEFS = `
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfaf6"/><stop offset="1" stop-color="#dcdad2"/></linearGradient>
<linearGradient id="wallS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ccd0"/><stop offset="1" stop-color="#a9adb4"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a5a78"/><stop offset="1" stop-color="#1f3348"/></linearGradient>
<linearGradient id="refl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe0f7"/><stop offset=".35" stop-color="#bfe0f7" stop-opacity="0"/><stop offset=".6" stop-color="#9fd0f0" stop-opacity=".6"/><stop offset="1" stop-color="#9fd0f0" stop-opacity="0"/></linearGradient>
<linearGradient id="conc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f5f1"/><stop offset="1" stop-color="#cfcdc6"/></linearGradient>
<linearGradient id="pave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ddd0"/><stop offset="1" stop-color="#a9a393"/></linearGradient>
<linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fae5c"/><stop offset="1" stop-color="#4f8444"/></linearGradient>
<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2b4"/><stop offset=".5" stop-color="#e2c488"/><stop offset="1" stop-color="#a88a5a"/></linearGradient>
<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98a58"/><stop offset="1" stop-color="#7a5636"/></linearGradient>
<linearGradient id="rock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a8478"/><stop offset="1" stop-color="#3f3a36"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".8" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".45" r=".78"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
<radialGradient id="sun" cx=".82" cy=".06" r=".9"><stop offset="0" stop-color="#fff2c8" stop-opacity=".38"/><stop offset=".5" stop-color="#fff2c8" stop-opacity="0"/></radialGradient>
<radialGradient id="lamp"><stop offset="0" stop-color="#ffd98a" stop-opacity=".85"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
<mask id="cm"><rect width="1280" height="400" fill="url(#fade)"/></mask>
<pattern id="az" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#e9eef5"/><path d="M12,2 L22,12 L12,22 L2,12z" fill="#2f6fb8"/><circle cx="12" cy="12" r="3.2" fill="#e9eef5"/><circle cx="0" cy="0" r="3" fill="#f0b83a"/><circle cx="24" cy="0" r="3" fill="#f0b83a"/><circle cx="0" cy="24" r="3" fill="#f0b83a"/><circle cx="24" cy="24" r="3" fill="#f0b83a"/></pattern>
<pattern id="cobble" width="28" height="16" patternUnits="userSpaceOnUse"><rect width="28" height="16" fill="#4a4660"/><rect x="1" y="1" width="12" height="6" rx="2" fill="#6a6684"/><rect x="15" y="1" width="12" height="6" rx="2" fill="#5c5876"/><rect x="-6" y="9" width="12" height="6" rx="2" fill="#5c5876"/><rect x="8" y="9" width="12" height="6" rx="2" fill="#6a6684"/><rect x="22" y="9" width="12" height="6" rx="2" fill="#625e7c"/></pattern>
<filter id="clouds" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0045 0.015" numOctaves="5" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.4 0 0 0 -1.25"/><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="water" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.12" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.8 0 0 0 -0.9"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .2  0 0 0 .5 -.14"/></filter>
<filter id="b8"><feGaussianBlur stdDeviation="8"/></filter><filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>`;

const glass = (x, y, w, h, step) => R(x, y, w, h, 'url(#glass)') + R(x, y, w, h, 'url(#refl)', 'opacity=".55"') +
  seq(Math.max(0, Math.ceil(w / step) - 1), i => R(x + (i + 1) * step - 1, y, 2, h, '#39424f')) + R(x, y, w, 3, '#1c232d', 'opacity=".7"');
function pine(x, y, s) {
  let o = `<path d="M${x - 3 * s},${y} q${2 * s},${-40 * s} ${-1 * s},${-78 * s} h${7 * s} q${-2 * s},${40 * s} ${3 * s},${78 * s}z" fill="#5a4636"/>`;
  [[-34, -92, 30, 13], [0, -104, 40, 17], [36, -92, 30, 13], [-16, -84, 26, 10], [20, -82, 28, 10]].forEach(([dx, dy, rx, ry], i) => { o += `<ellipse cx="${x + dx * s}" cy="${y + dy * s}" rx="${rx * s}" ry="${ry * s}" fill="${i < 3 ? '#2f5a3a' : '#274a30'}"/>`; });
  [[-30, -98, 20, 6], [2, -112, 28, 7], [38, -98, 20, 6]].forEach(([dx, dy, rx, ry]) => { o += `<ellipse cx="${x + dx * s}" cy="${y + dy * s}" rx="${rx * s}" ry="${ry * s}" fill="#6f9a5a" opacity=".7"/>`; });
  return o;
}
function palm(x, y, h, dark) {
  let o = `<path d="M${x - 4},${y} q6,${-h / 2} 0,${-h} h7 q6,${h / 2} 1,${h}z" fill="${dark ? '#2a2238' : '#6b5540'}"/>`;
  for (let a = -160; a <= -20; a += 20) { const r = a * Math.PI / 180; o += `<path d="M${x + 3},${y - h} Q${x + 3 + Math.cos(r) * 40},${y - h - 26} ${x + 3 + Math.cos(r) * 62},${y - h + Math.sin(r) * 30 + 24}" stroke="${dark ? '#231c30' : a % 40 ? '#2f6a3f' : '#3f8050'}" stroke-width="7" fill="none" stroke-linecap="round"/>`; }
  return o;
}
// Trim: the visual cue on every playable surface. kind: 'tile' | 'life' | 'tram'
function trim(kind, x, y, w) {
  const n = Math.floor(w / 20), pad = (w - n * 20) / 2;
  const cols = { tile: ['#1f6fb2', '#f1f5fa'], life: ['#e63946', '#f7f3ea'], tram: ['#f6c343', '#2a2340'] }[kind];
  return R(x, y, w, 4, '#ffffff', 'opacity=".95"') + seq(n, i => R(x + pad + i * 20, y + 4, 20, 9, cols[i % 2])) + R(x, y + 13, w, 2, '#0c1420', 'opacity=".35"');
}
const sky = (stops) => `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
// Wraps a stage drawing into a complete SVG document. It is turned into an image and
// drawn to a canvas once, so it needs its own size and its own copy of the fonts.
const wrap = (label, skyStops, seaStops, body, night) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720"><defs><style>__FONTS__</style>${DEFS}${sky(skyStops)}<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">${seaStops.map((c, i) => `<stop offset="${(i / (seaStops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>${R(0, 0, 1280, 720, 'url(#sky)')}${body}${night ? '' : R(0, 0, 1280, 720, 'url(#sun)')}${R(0, 0, 1280, 720, 'url(#vig)')}</svg>`;
const fort = (x, y) => `<path d="M${x},${y + 14} q30,-16 80,-14 v-10 h10 v8 h44 v-8 h10 v12 q50,2 86,14 v12 h-230z" fill="#b9a487"/><path d="M${x},${y + 20} h240 v8 h-240z" fill="#8f7c62" opacity=".6"/><rect x="${x + 156}" y="${y - 34}" width="7" height="30" fill="#e8e4d8"/><rect x="${x + 154}" y="${y - 40}" width="11" height="7" fill="#c84a3a"/>`;

// Nova SBE logo, redrawn from the official mark (N, raised O over a bar, V, inverted V). H = height of the N.
function novaLogo(x, y, H, c) {
  const k = H / 144;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="${c}"><path d="M0,144 V0 H36 L107,86 V0 H142 V144 H107 L35,58 V144z"/><circle cx="303" cy="4" r="60" fill="none" stroke="${c}" stroke-width="36"/><rect x="182" y="107" width="245" height="35"/><path d="M460,0 H498 L521,86 L544,0 H582 L540,144 H502z"/><path d="M565,144 H603 L644,60 L685,144 H722 L664,0 H624z"/></g>`;
}
// Ponte 25 de Abril: red suspension bridge with two braced towers and a truss deck
function bridge(x, y, w) {
  const t1 = x + w * 0.27, t2 = x + w * 0.73, th = w * 0.26, dy = y - 16, red = '#c2452f', dark = '#8a2f1f';
  const q = (a, b, t, c) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
  let o = '';
  [t1, t2].forEach(t => { o += R(t - 7, dy, 14, y - dy + 6, '#9aa0a8') + R(t - 9, y - 2, 18, 6, '#7c838c'); });
  o += `<path d="M${x},${dy - 4} Q${(x + t1) / 2},${dy - 8} ${t1},${dy - th} Q${(t1 + t2) / 2},${dy + 16} ${t2},${dy - th} Q${(t2 + x + w) / 2},${dy - 8} ${x + w},${dy - 4}" stroke="${red}" stroke-width="2.6" fill="none"/>`;
  for (let i = 1; i < 22; i++) { const t = i / 22; o += `<path d="M${t1 + (t2 - t1) * t},${q(dy - th, dy - th, t, dy + 16)} V${dy}" stroke="${red}" stroke-width=".9"/>`; }
  for (let i = 1; i < 7; i++) { const t = i / 7; o += `<path d="M${x + (t1 - x) * t},${q(dy - 4, dy - th, t, dy - 8)} V${dy}" stroke="${red}" stroke-width=".9"/><path d="M${t2 + (x + w - t2) * t},${q(dy - th, dy - 4, t, dy - 8)} V${dy}" stroke="${red}" stroke-width=".9"/>`; }
  [t1, t2].forEach(t => {
    o += R(t - 7, dy - th - 5, 4, th + 5, red) + R(t + 3, dy - th - 5, 4, th + 5, red) + R(t - 8, dy - th - 8, 16, 4, dark);
    o += seq(5, i => `<path d="M${t - 5},${dy - th + i * th / 5} l10,${th / 5 - 3} m-10,0 l10,${-(th / 5 - 3)}" stroke="${red}" stroke-width="1.3" fill="none"/>` + R(t - 6, dy - th + i * th / 5 - 1.5, 12, 2.2, dark));
  });
  o += R(x, dy, w, 3.5, red) + R(x, dy + 9, w, 2.5, dark) + seq(Math.floor(w / 9), i => `<path d="M${x + i * 9},${dy + 3.5} l4.5,5.5 l4.5,-5.5" stroke="${red}" stroke-width="1" fill="none"/>`);
  return o;
}
// Cristo Rei: tall four-pillar pedestal with an arch, statue with open arms
function cristo(cx, by, k) {
  const st = '#efe8d8', sh = '#cfc6b2';
  return R(cx - 8 * k, by - 62 * k, 5 * k, 62 * k, st) + R(cx + 3 * k, by - 62 * k, 5 * k, 62 * k, sh) + R(cx - 3 * k, by - 62 * k, 6 * k, 62 * k, '#000', 'opacity=".12"')
    + seq(3, i => R(cx - 8 * k, by - (16 + i * 16) * k, 16 * k, 1.6 * k, sh)) + `<path d="M${cx - 8 * k},${by - 62 * k} q${8 * k},${-9 * k} ${16 * k},0z" fill="${st}"/>` + R(cx - 10 * k, by - 66 * k, 20 * k, 4 * k, st)
    + `<path d="M${cx - 3.4 * k},${by - 66 * k} L${cx - 2.4 * k},${by - 84 * k} h${4.8 * k} L${cx + 3.4 * k},${by - 66 * k}z" fill="${st}"/>` + R(cx - 12 * k, by - 84.5 * k, 24 * k, 2.8 * k, st) + `<path d="M${cx - 12 * k},${by - 82 * k} l${9.6 * k},${5 * k} v${-5 * k}z M${cx + 12 * k},${by - 82 * k} l${-9.6 * k},${5 * k} v${-5 * k}z" fill="${sh}"/><circle cx="${cx}" cy="${by - 87.5 * k}" r="${2.6 * k}" fill="${st}"/>`;
}
// Forte de São Julião da Barra: low bastioned stone fort on a rocky point, white lighthouse with a red dome
function fortBig() {
  const guard = (x, y) => R(x - 4, y - 11, 8, 11, '#d8c7a0') + `<path d="M${x - 5},${y - 11} q5,-8 10,0z" fill="#b9a67e"/>` + R(x - 1, y - 8, 2, 4, '#3a3026');
  const house = (x, y, w, h) => R(x, y, w, h, '#f4efe2') + `<path d="M${x - 3},${y} l${w / 2 + 3},-9 l${w / 2 + 3},9z" fill="#b8564a"/>` + seq(Math.floor(w / 14), i => R(x + 6 + i * 14, y + 6, 5, 7, '#4a5560'));
  return `<path d="M0,424 L0,404 q70,-10 160,-8 q130,2 210,14 l14,14z" fill="#5f5142"/><path d="M0,424 L0,404 q70,-10 160,-8 q130,2 210,14 l14,14z" filter="url(#grain)" opacity=".9"/>
${house(18, 330, 62, 22)}${house(92, 322, 52, 28)}${house(150, 336, 84, 20)}
${R(58, 296, 2, 36, '#5a5048')}${R(60, 296, 7, 11, '#1f9d55')}${R(67, 296, 12, 11, '#e63946')}<circle cx="67" cy="301.5" r="2.6" fill="#f6c343"/>
${R(197, 286, 16, 54, '#f4efe2')}${R(207, 286, 6, 54, '#d9d3c4')}${R(201, 300, 4, 7, '#4a5560')}${R(201, 318, 4, 7, '#4a5560')}${R(193, 282, 24, 4, '#3a3f48')}${R(199, 270, 12, 12, '#dfeaf2')}${R(204, 270, 2, 12, '#3a3f48')}<path d="M197,270 q8,-13 16,0z" fill="#c8392e"/>${R(204, 254, 1.5, 6, '#3a3f48')}
<path d="M0,406 L0,352 L122,347 L150,360 L252,357 L300,372 L352,406z" fill="#cdb88f"/><path d="M0,406 L0,384 L140,380 L300,390 L352,406z" fill="#a8916c" opacity=".75"/>
<path d="M250,406 L262,364 L332,380 L364,408z" fill="#d9c8a2"/><path d="M262,364 L250,406 L226,406 L246,362z" fill="#9c8662"/>
<path d="M0,352 L122,347 L150,360 L252,357" stroke="#efe3c4" stroke-width="2.5" fill="none"/><path d="M262,364 L332,380 L364,408" stroke="#efe3c4" stroke-width="2.5" fill="none"/>
${seq(7, i => R(10 + i * 16, 352.5 - i * 0.7, 6, 6, '#6a5a44'))}${seq(5, i => R(160 + i * 18, 360.5 - i * 0.6, 6, 6, '#6a5a44'))}
${seq(11, i => `<path d="M${8 + i * 31},${366 + (i % 3) * 5} v${22 - (i % 3) * 4}" stroke="#8a7656" stroke-width="1" opacity=".55"/>`)}
<path d="M0,406 L0,352 L122,347 L150,360 L252,357 L300,372 L352,406z" filter="url(#grain)" opacity=".8"/>
${guard(122, 347)}${guard(252, 357)}${guard(332, 380)}
<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M330,424 q16,-8 32,0 t32,0"/><path d="M6,426 q14,-6 28,0"/></g>`;
}
const farShore = () => `<path d="M380,402 L380,370 Q470,336 560,344 Q640,354 706,402z" fill="#6f8a70"/><path d="M380,402 L380,386 Q490,360 600,374 Q660,384 706,402z" fill="#587260" opacity=".75"/>
${seq(13, i => R(408 + i * 18 + (i % 3) * 4, 372 + (i % 4) * 5, 7, 5, '#f1ece0') + R(408 + i * 18 + (i % 3) * 4, 370 + (i % 4) * 5, 7, 2, '#b8564a'))}
${cristo(566, 344, 1.25)}${bridge(214, 398, 310)}${fortBig()}`;

// ---------- Stage 1: Nova SBE Campus (day) ----------
function campus() {
  const T = (p) => trim('tile', p.x, p.y, p.w);
  const P = Object.fromEntries(platformsOf('campus').map(p => [p.id, p]));
  return wrap('Nova SBE campus in Carcavelos, daylight', ['#2f7fd0', '#8fc4ee', '#e6f3fb'], ['#2a6aa0', '#3fa0b8'], `
<rect width="1280" height="400" filter="url(#clouds)" mask="url(#cm)" opacity=".9"/>
${R(0, 392, 1280, 70, 'url(#sea)')}<rect x="0" y="392" width="1280" height="70" filter="url(#water)" opacity=".5"/>${R(0, 391, 1280, 2, '#dff0fa', 'opacity=".8"')}
${fort(10, 384)}
${R(0, 452, 1280, 26, '#5f6a72')}<path d="M0,465 h1280" stroke="#f1eee4" stroke-width="2" stroke-dasharray="26 22"/>
${[60, 210, 1090, 1230].map(x => R(x, 408, 3, 46, '#4a525a') + R(x - 12, 408, 15, 3, '#4a525a')).join('')}
${R(0, 476, 1280, 130, 'url(#lawn)')}${grain(0, 476, 1280, 130, 0.6)}
${pine(70, 600, 1.0)}${pine(1235, 600, 1.15)}${palm(232, 600, 100)}
<!-- tower (stair core) on the roof: top platform -->
${R(560, 220, 180, 118, 'url(#wall)')}${glass(576, 240, 148, 80, 26)}
${shadow(P['tower-roof'].x, 206, 220)}${R(540, 206, 220, 16, 'url(#conc)')}${T(P['tower-roof'])}
<!-- rooftop sign -->
${seq(5, i => R(310 + i * 46, 312, 3, 26, '#4a525a', 'opacity=".6"'))}${novaLogo(302, 286, 46, '#111111')}
<!-- main building -->
${R(280, 596, 720, 18, '#0c1420', 'opacity=".3" filter="url(#b8)"')}
${R(300, 352, 680, 248, 'url(#wall)')}
${glass(318, 380, 644, 50, 28)}
${R(300, 430, 680, 40, 'url(#wall)')}
<text x="640" y="459" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="20" letter-spacing="7" fill="#0b3c5d">NOVA SCHOOL OF BUSINESS &amp; ECONOMICS</text>
${R(300, 470, 680, 130, '#2a3644')}${glass(312, 474, 656, 126, 41)}
${seq(8, i => R(310 + i * 93, 470, 12, 130, 'url(#wall)'))}
${R(596, 510, 88, 90, '#16202c')}${R(600, 514, 38, 86, 'url(#glass)')}${R(642, 514, 38, 86, 'url(#glass)')}
${grain(300, 352, 680, 248, 0.35)}
${shadow(270, 336, 740)}${R(270, 336, 740, 18, 'url(#conc)')}${R(270, 354, 740, 10, '#0c1420', 'opacity=".28" filter="url(#b3)"')}${T(P.roof)}
<!-- entrance canopy (left): platform -->
${R(140, 494, 170, 106, 'url(#wallS)')}${glass(148, 522, 154, 78, 31)}${seq(4, i => R(160 + i * 36, 566, 22, 4, '#d9b98a') + `<circle cx="${171 + i * 36}" cy="556" r="6" fill="#16202c" opacity=".7"/>`)}${R(140, 494, 170, 24, '#d8232a')}<text x="225" y="511" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="12.5" letter-spacing="1" fill="#fff">CTT STUDENT HALL</text>
${R(130, 470, 190, 16, 'url(#conc)')}${R(130, 486, 190, 8, '#0c1420', 'opacity=".25" filter="url(#b3)"')}${T(P.canopy)}
<!-- side wing (right): its roof is a platform -->
${R(980, 486, 200, 114, 'url(#wall)')}${glass(994, 522, 172, 78, 34)}${seq(3, i => R(1000 + i * 34, 548, 26, 3, '#e9eef5', 'opacity=".7"') + R(1000 + i * 34, 566, 26, 3, '#e9eef5', 'opacity=".7"') + seq(4, j => R(1002 + i * 34 + j * 6, 540, 4, 8, ['#e63946', '#f6c343', '#22a36b', '#ff7a3d'][j])))}${R(980, 492, 200, 28, '#5aa832')}<text x="1080" y="512" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="16" fill="#fff">pingo doce &amp; Go</text>${grain(980, 486, 200, 114, 0.35)}
${R(960, 470, 240, 16, 'url(#conc)')}${R(960, 486, 240, 8, '#0c1420', 'opacity=".25" filter="url(#b3)"')}${T(P['wing-roof'])}
<!-- terrace: main ground -->
<ellipse cx="640" cy="672" rx="540" ry="12" fill="#0c1420" opacity=".35" filter="url(#b8)"/>
${R(120, 600, 1040, 66, 'url(#pave)', 'rx="4"')}${seq(26, i => R(120 + i * 40, 615, 1.5, 51, '#8f8a7c', 'opacity=".45"'))}${R(120, 640, 1040, 2, '#8f8a7c', 'opacity=".5"')}${grain(120, 600, 1040, 66, 0.6)}${T(P.terrace)}
<!-- Cascais line -->
${R(0, 678, 1280, 42, '#6b655c')}${grain(0, 678, 1280, 42, 0.9)}${seq(44, i => R(i * 30, 692, 18, 22, '#4a4036'))}${R(0, 696, 1280, 3, '#c9ccd0')}${R(0, 709, 1280, 3, '#c9ccd0')}`);
}

// ---------- Stage 2: Carcavelos Beach (day) ----------
function beach() {
  const T = (p) => trim('life', p.x, p.y, p.w);
  const P = Object.fromEntries(platformsOf('beach').map(p => [p.id, p]));
  const umbrella = (x, c) => `${R(x - 2, 540, 4, 60, '#7a6a58')}<path d="M${x - 46},544 q46,-46 92,0z" fill="${c}"/><path d="M${x - 15},544 q15,-42 30,0z" fill="#fff" opacity=".9"/><path d="M${x - 46},544 q46,-46 92,0" fill="none" stroke="#0c1420" stroke-width="1.5" opacity=".3"/>${R(x + 30, 590, 60, 8, c, 'rx="3" opacity=".9"')}`;
  const board = (x, c) => `<g transform="rotate(8 ${x} 540)"><ellipse cx="${x}" cy="540" rx="11" ry="60" fill="${c}"/><path d="M${x},484 v112" stroke="#fff" stroke-width="3"/></g>`;
  return wrap('Carcavelos beach with the fort, daylight', ['#1f7fd6', '#7cc2f0', '#dff3fc'], ['#2a78b0', '#38a8c0', '#6fd0c8', '#3f9ab0'], `
<rect width="1280" height="400" filter="url(#clouds)" mask="url(#cm)" opacity=".8"/>
${R(0, 400, 1280, 320, 'url(#sea)')}<rect x="0" y="400" width="1280" height="320" filter="url(#water)" opacity=".45"/>${R(0, 399, 1280, 2, '#e6f6fd', 'opacity=".9"')}
${farShore()}
<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".85"><path d="M0,560 q50,-18 100,0 t100,0"/><path d="M1090,566 q50,-18 100,0 t100,0"/><path d="M-20,640 q60,-16 120,0 t120,0" opacity=".6"/><path d="M1060,650 q60,-16 120,0 t120,0" opacity=".6"/><path d="M300,700 q60,-14 120,0 t120,0 t120,0 t120,0 t120,0" opacity=".5"/></g>
<g transform="translate(130 0)">
<!-- lifeguard tower: deck and cabin roof are platforms -->
<g stroke="#f7f3ea" stroke-width="9" stroke-linecap="round"><path d="M566,600 L592,364"/><path d="M714,600 L688,364"/></g>
<g stroke="#d9d3c4" stroke-width="5" stroke-linecap="round"><path d="M574,540 L704,440"/><path d="M706,540 L576,440"/><path d="M580,480 h120"/></g>
${R(586, 262, 108, 90, '#f7f3ea')}${R(586, 300, 108, 16, '#e63946')}${R(606, 272, 30, 24, 'url(#glass)')}${R(650, 272, 30, 80, '#d9d3c4')}${grain(586, 262, 108, 90, 0.4)}
${R(560, 240, 160, 14, '#f7f3ea')}${R(560, 254, 160, 8, '#0c1420', 'opacity=".25" filter="url(#b3)"')}${T({ ...P['tower-roof'], x: 560 })}
${R(716, 150, 3, 92, '#7a6a58')}<path d="M719,152 h46 v15 h-46z" fill="#e63946"/><path d="M719,167 h46 v15 h-46z" fill="#f6c343"/>
${R(530, 350, 220, 14, 'url(#wood)')}${R(530, 364, 220, 8, '#0c1420', 'opacity=".25" filter="url(#b3)"')}${T({ ...P['tower-deck'], x: 530 })}
</g>
<!-- sandbank: main ground -->
<path d="M70,720 q10,-96 60,-120 h1020 q50,24 60,120z" fill="url(#sand)"/>
<path d="M70,720 q10,-96 60,-120 h1020 q50,24 60,120z" filter="url(#grain)" opacity=".8"/>
<path d="M82,690 q14,-66 52,-86 M1198,690 q-14,-66 -52,-86" stroke="#fff" stroke-width="5" fill="none" opacity=".7" stroke-linecap="round"/>
<g fill="#8a6a40" opacity=".22">${seq(18, i => `<ellipse cx="${170 + i * 56 + (i % 3) * 9}" cy="${640 + (i % 4) * 16}" rx="${14 + (i % 3) * 5}" ry="3"/>`)}</g>
${umbrella(480, '#2f7fe0')}${umbrella(600, '#ff7a3d')}
<!-- surf bar: its roof is a platform -->
${R(168, 596, 230, 12, '#0c1420', 'opacity=".25" filter="url(#b8)"')}
${R(170, 486, 220, 114, 'url(#wood)')}${seq(11, i => R(170 + i * 20, 486, 1.5, 114, '#5a3e26', 'opacity=".6"'))}
${R(190, 512, 120, 46, '#2a1c12')}${R(184, 556, 132, 8, '#d9b98a')}${seq(4, i => R(204 + i * 26, 522, 8, 20, ['#e63946', '#f6c343', '#22a36b', '#2f7fe0'][i], 'rx="3"'))}
${R(326, 520, 50, 80, '#5a3e26')}<text x="250" y="506" text-anchor="middle" font-family="Bungee,'Arial Black',sans-serif" font-size="15" fill="#fff3d0">SURF BAR</text>
${board(424, '#22a36b')}${board(446, '#e85d9c')}
${R(150, 470, 260, 16, 'url(#wood)')}${R(150, 486, 260, 8, '#0c1420', 'opacity=".28" filter="url(#b3)"')}${T(P['bar-roof'])}
<!-- acai kiosk: its roof is a platform -->
${R(908, 596, 216, 12, '#0c1420', 'opacity=".25" filter="url(#b8)"')}
${R(910, 494, 210, 106, '#5a2a82')}${seq(10, i => R(910 + i * 21, 494, 1.5, 106, '#3f1c5c', 'opacity=".6"'))}
${R(910, 494, 210, 30, '#3f1c5c')}<text x="1015" y="517" text-anchor="middle" font-family="Bungee,'Arial Black',sans-serif" font-size="20" fill="#f6e2b4">AÇAÍ</text>
<path d="M918,524 h194 l8,16 h-210z" fill="#f7f3ea"/>${seq(5, i => `<path d="M${918 + i * 40 + 20},524 h20 l1,16 h-22z" fill="#8e5cc8"/>`)}
${R(930, 546, 120, 34, '#1c0f2a')}${R(924, 578, 132, 8, '#d9b98a')}
${seq(3, i => `<path d="M${944 + i * 34},572 h22 q-1,-12 -11,-12 q-10,0 -11,12z" fill="#f7f3ea"/><ellipse cx="${955 + i * 34}" cy="561" rx="9" ry="4" fill="#4a1c6a"/><circle cx="${952 + i * 34}" cy="559" r="2" fill="#f6c343"/><circle cx="${958 + i * 34}" cy="560" r="2" fill="#e63946"/>`)}
${R(1066, 540, 44, 60, '#1c0f2a')}${R(1070, 546, 36, 30, '#2a2340')}<text x="1088" y="558" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="7.5" fill="#f7f3ea">BOWL 5,50</text><text x="1088" y="570" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="7.5" fill="#f7f3ea">SMOOTHIE 4</text>
${grain(910, 494, 210, 106, 0.4)}${palm(1140, 600, 84)}
${R(900, 480, 230, 16, 'url(#wood)')}${R(900, 496, 230, 8, '#0c1420', 'opacity=".28" filter="url(#b3)"')}${T(P['acai-roof'])}
${T(P.sand)}`);
}

// ---------- Stage 3: Bairro Alto (night) ----------
function bairro() {
  const T = (p) => trim('tram', p.x, p.y, p.w);
  const P = Object.fromEntries(platformsOf('bairro').map(p => [p.id, p]));
  const win = (x, y, lit, sh) => `${R(x - 4, y - 4, 44, 68, '#e9e2d0', 'opacity=".5"')}${R(x, y, 36, 60, lit ? '#ffd98a' : '#1a1630')}${lit ? R(x, y, 36, 60, 'url(#lamp)') : ''}${R(x + 17, y, 2, 60, '#3a2f4a')}${R(x, y + 28, 36, 2, '#3a2f4a')}${R(x - 14, y, 12, 60, sh, 'opacity=".9"')}${R(x + 38, y, 12, 60, sh, 'opacity=".9"')}`;
  const lampPost = (x) => `<circle cx="${x}" cy="508" r="70" fill="url(#lamp)"/>${R(x - 2, 512, 4, 88, '#1a1630')}<path d="M${x - 9},512 h18 l-4,-16 h-10z" fill="#ffd98a"/>${R(x - 11, 494, 22, 3, '#1a1630')}`;
  const string = (x1, y1, x2, y2, n) => { const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + 34; let s = `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" stroke="#1a1630" stroke-width="1.5" fill="none"/>`; for (let i = 1; i < n; i++) { const t = i / n, x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2; s += `<circle cx="${x}" cy="${y + 3}" r="11" fill="url(#lamp)"/><circle cx="${x}" cy="${y + 3}" r="3" fill="#ffe9b0"/>`; } return s; };
  const neon = (x, y, w, t, c) => `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="38" rx="8" fill="${c}" opacity=".35" filter="url(#b8)"/><rect x="${x}" y="${y}" width="${w}" height="26" rx="5" fill="#1a1630" stroke="${c}" stroke-width="2.5"/><text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" font-family="Bungee,'Arial Black',sans-serif" font-size="15" fill="${c}">${t}</text>`;
  return wrap('Bairro Alto street at night', ['#0b0a24', '#231a4a', '#4a2a6a', '#7a3f7a'], ['#000', '#000'], `
<g fill="#fff" opacity=".85">${[[60, 40], [180, 90], [300, 30], [470, 70], [600, 26], [700, 96], [820, 44], [960, 80], [1100, 30], [1220, 70], [540, 140], [1040, 150]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.3 : 2}"/>`).join('')}</g>
<circle cx="700" cy="110" r="120" fill="url(#lamp)" opacity=".35"/><circle cx="700" cy="110" r="30" fill="#f4f0e0"/><circle cx="690" cy="102" r="6" fill="#d9d3c0" opacity=".6"/><circle cx="712" cy="120" r="4" fill="#d9d3c0" opacity=".6"/>
<!-- distant hill with castle -->
<path d="M430,330 q100,-70 220,-60 l0,-18 h12 v10 h30 v-10 h12 v10 h30 v-10 h12 v22 q90,6 110,56z" fill="#2a2050"/>
<g fill="#ffd98a" opacity=".7">${seq(26, i => R(450 + i * 15 + (i % 3) * 3, 300 + (i % 5) * 6, 3, 4, '#ffd98a'))}</g>
<!-- left building: balcony + roof are platforms -->
${R(40, 228, 380, 372, '#8a4f6a')}${R(40, 484, 380, 116, 'url(#az)')}${R(40, 484, 380, 116, '#231a4a', 'opacity=".45"')}
${win(90, 256, true, '#2f6a5a')}${win(210, 256, false, '#2f6a5a')}${win(330, 256, true, '#2f6a5a')}
${win(90, 380, false, '#2f6a5a')}${win(210, 380, true, '#2f6a5a')}${win(330, 380, true, '#2f6a5a')}
${R(80, 500, 90, 100, '#1a1630')}${R(86, 506, 78, 94, '#ffd98a', 'opacity=".55"')}${R(310, 534, 70, 66, '#3a2f4a')}${neon(184, 496, 196, 'ERASMUS CORNER', '#ff4fa0')}${seq(7, i => `<path d="M${84 + i * 13},502 h11 l-5.5,11z" fill="${['#e63946', '#f6c343', '#22a36b', '#2f7fe0', '#f7f3ea', '#ff7a3d', '#8e5cc8'][i]}"/>`)}<path d="M214,600 l12,-58 h44 l12,58z" fill="#16122a"/><path d="M222,594 l9,-46 h34 l9,46z" fill="#2a2340"/><text x="248" y="566" text-anchor="middle" font-family="Bungee,'Arial Black',sans-serif" font-size="11" fill="#f7f3ea">BEER</text><text x="248" y="584" text-anchor="middle" font-family="Bungee,'Arial Black',sans-serif" font-size="14" fill="#f6c343">€1.50</text>
${grain(40, 228, 380, 372, 0.5)}
${R(30, 214, 400, 16, '#b8564a')}${R(30, 230, 400, 8, '#0c0a1c', 'opacity=".4" filter="url(#b3)"')}${T(P['roof-left'])}
${seq(8, i => `<path d="M${116 + i * 36},486 q0,22 14,26" stroke="#1a1630" stroke-width="3" fill="none"/>`)}
${R(100, 470, 280, 14, '#d9d3c4')}${R(100, 484, 280, 6, '#0c0a1c', 'opacity=".4" filter="url(#b3)"')}${T(P['balcony-left'])}
<!-- centre bar: roof terrace is a platform -->
${R(480, 350, 320, 250, '#c9a24a')}${R(480, 500, 320, 100, 'url(#az)')}${R(480, 500, 320, 100, '#231a4a', 'opacity=".4"')}
${win(520, 392, true, '#7a2f3a')}${win(622, 392, true, '#7a2f3a')}${win(724, 392, false, '#7a2f3a')}
<path d="M500,500 h280 l14,34 h-308z" fill="#e63946"/>${seq(7, i => `<path d="M${500 + i * 40 + 20},500 h20 l1,34 h-22z" fill="#f7f3ea" transform="skewX(${(i - 3) * 1.2})"/>`)}
${R(600, 540, 80, 60, '#1a1630')}${R(606, 546, 68, 54, '#ffd98a', 'opacity=".5"')}${neon(492, 546, 104, 'THE SPOT', '#3fd0e0')}
${grain(480, 350, 320, 250, 0.5)}
${R(460, 336, 360, 16, '#d9d3c4')}${R(460, 352, 360, 8, '#0c0a1c', 'opacity=".4" filter="url(#b3)"')}${T(P['bar-terrace'])}
${string(470, 250, 810, 250, 12)}${R(468, 250, 3, 86, '#1a1630')}${R(809, 250, 3, 86, '#1a1630')}
<!-- right building: balcony + roof are platforms -->
${R(860, 350, 380, 250, '#4a6a9a')}${R(860, 484, 380, 116, 'url(#az)')}${R(860, 484, 380, 116, '#231a4a', 'opacity=".45"')}
${win(910, 384, true, '#e9e2d0')}${win(1030, 384, true, '#e9e2d0')}${win(1150, 384, false, '#e9e2d0')}
${R(940, 510, 80, 90, '#1a1630')}${R(1060, 516, 130, 60, '#1a1630')}${R(1066, 522, 118, 48, '#ffd98a', 'opacity=".5"')}
${grain(860, 350, 380, 250, 0.5)}
${R(850, 336, 400, 16, '#b8564a')}${R(850, 352, 400, 8, '#0c0a1c', 'opacity=".4" filter="url(#b3)"')}${T(P['roof-right'])}
${seq(8, i => `<path d="M${916 + i * 36},486 q0,22 14,26" stroke="#1a1630" stroke-width="3" fill="none"/>`)}
${R(900, 470, 280, 14, '#d9d3c4')}${R(900, 484, 280, 6, '#0c0a1c', 'opacity=".4" filter="url(#b3)"')}${T(P['balcony-right'])}
${lampPost(440)}${lampPost(840)}
<!-- street: main ground, dark alleys left and right -->
${R(0, 600, 1280, 120, '#0c0a1c')}
<path d="M0,640 h120 v80 h-120z M1160,640 h120 v80 h-120z" fill="#1a1630"/>${seq(4, i => R(0, 640 + i * 20, 120 - i * 10, 3, '#2a2340') + R(1160 + i * 10, 640 + i * 20, 120 - i * 10, 3, '#2a2340'))}
${R(120, 600, 1040, 70, 'url(#cobble)', 'rx="4"')}${R(120, 600, 1040, 70, '#231a4a', 'opacity=".25"')}
${T(P.street)}
<ellipse cx="640" cy="682" rx="540" ry="10" fill="#000" opacity=".5" filter="url(#b8)"/>`, true);
}

const DRAW = { campus, beach, bairro };

// Returns the SVG text of a stage. `fontCss` is the @font-face CSS with the fonts
// embedded as data URLs (an SVG used as an image cannot load the page's fonts).
export function stageSvg(stageId, fontCss = '') {
  return DRAW[stageId]().replace('__FONTS__', fontCss);
}
