import { TUTORIAL_STEPS } from '/game/tutorial.js';

export function updateTutorialHint($, status, def) {
  const step = status?.tutorialStep;
  const active = Number.isInteger(step) && step >= 0 && step <= 4;
  $('tutorialHint').hidden = !active;
  $('pad').classList.toggle('learning', active);
  $('pad').classList.toggle('practising', active && step === 4);
  for (const node of [$('stickZone'), ...$('controls').querySelectorAll('.key')]) {
    node.classList.toggle('tutorialFocus', active && (node.id === TUTORIAL_STEPS[step].target || node.dataset.b === TUTORIAL_STEPS[step].target));
  }
  if (!active) return;
  if (step === 4) {
    $('tutorialHint').textContent = `FREE PRACTICE · ${status.tutorialLeft}s — ${TUTORIAL_STEPS[step].text} Brawl starts automatically.`;
    return;
  }
  const action = status.tutorialDone && step < 4 ? '✓ Done! Waiting for the other players.' : TUTORIAL_STEPS[step].text;
  const special = step === 3 ? ` ${def.special.name}: ${def.special.text}` : '';
  $('tutorialHint').textContent = `${TUTORIAL_STEPS[step].title} — ${action}${special} Everyone is protected.`;
}
