import { TUTORIAL_STEPS, tutorialSeconds } from '/game/tutorial.js';
import { getFighter } from '/game/fighters.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function createTutorialView() {
  const root = el('section', 'tutorialScreen');
  root.id = 'tutorial';
  root.hidden = true;
  root.setAttribute('aria-label', 'Interactive controller tutorial');
  const badge = el('p', 'tutorialBadge', 'LEARN TO BRAWL · EVERYONE IS PROTECTED');
  const title = el('h1', 'tutorialTitle');
  const line = el('p', 'tutorialInstruction');
  line.setAttribute('aria-live', 'polite');
  const phone = el('div', 'tutorialPhone');
  const stick = el('div', 'guideControl guideStick', '◀  JOYSTICK  ▶');
  const special = el('div', 'guideControl guideSpecial', 'S · SPECIAL');
  const attack = el('div', 'guideControl guideAttack', 'A · ATTACK');
  const jump = el('div', 'guideControl guideJump', 'J · JUMP');
  phone.append(stick, special, attack, jump);
  const progress = el('p', 'tutorialProgress');
  const specials = el('div', 'tutorialSpecials');
  const footer = el('p', 'tutorialFooter');
  root.append(badge, title, line, phone, progress, specials, footer);
  document.body.append(root);
  let last = '';
  return {
    render(state, paused) {
      const t = state?.tutorial;
      // The regular pause menu stays usable above the practice guide.
      root.hidden = !t?.active || state.phase !== 'fight' || paused;
      if (root.hidden) return;
      const humans = state.fighters.filter((f) => !f.bot);
      const key = JSON.stringify([t.step, t.progress, humans.map((f) => f.connected), tutorialSeconds(t)]);
      if (key === last) return;
      last = key;
      const practising = t.step === 4;
      const seconds = tutorialSeconds(t);
      root.classList.toggle('practising', practising);
      for (const node of [badge, phone, progress, specials]) node.hidden = practising;
      root.dataset.step = String(t.step);
      title.textContent = practising ? `FREE PRACTICE · ${seconds}s` : TUTORIAL_STEPS[t.step].title;
      line.textContent = TUTORIAL_STEPS[t.step].text;
      [stick, jump, attack, special].forEach((node, i) => node.classList.toggle('guideSpotlight', i === t.step));
      progress.textContent = humans.map((f) => `${f.name}: ${!f.connected ? 'reconnecting…' : t.step === 4 || t.progress[f.slot] & (1 << t.step) ? '✓ Done' : 'your turn'}`).join('  ·  ');
      specials.replaceChildren();
      if (t.step === 3) for (const f of humans) {
        const def = getFighter(f.fighterId);
        const row = el('p', '');
        row.append(el('b', '', `${f.name} · ${def.special.name}: `), document.createTextNode(def.special.text));
        specials.append(row);
      }
      footer.textContent = practising ? 'Everyone is protected. Brawl starts automatically · P or Esc to pause'
        : `Step ${t.step + 1} / 4 · Everyone is protected · Then 10 seconds of free practice · P or Esc to pause`;
    },
  };
}
