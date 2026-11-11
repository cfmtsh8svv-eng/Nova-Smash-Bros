// Feedback on the phone when something happens to its player.
// iPhone browsers have no vibration, so it is always three things together:
// a vibration where the phone can do it, a colour flash over the whole screen,
// and a short sound. Nothing in here may ever throw: a missing feature is skipped.
import { createAudio } from '/shared/audio.js';

const SOUND = { hit: 'hit', special: 'bigHit', hazard: 'bigHit', ko: 'ko', out: 'ko', good: 'item', finalKo: 'finalKo', hazardWarn: 'warn', hazardCount: 'warnCount', hazardCancel: 'strike', ready: 'ready', tap: 'click' };

export function createFeedback(flashElement) {
  const audio = createAudio({ music: 0, effects: 0.9 });

  // Sound is only allowed after a tap, so the first tap anywhere unlocks it.
  const unlock = () => audio.unlock();
  for (const type of ['pointerdown', 'touchend', 'click']) window.addEventListener(type, unlock, { passive: true });

  function vibrate(pattern) {
    try {
      if (typeof navigator.vibrate === 'function' && Array.isArray(pattern)) navigator.vibrate(pattern);
    } catch { /* no vibration on this phone */ }
  }

  function flash(color) {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return;
    try {
      flashElement.style.background = color;
      flashElement.classList.remove('go');
      void flashElement.offsetWidth; // restart the animation
      flashElement.classList.add('go');
    } catch { /* the flash is skipped */ }
  }

  return {
    fire({ kind, vibrate: pattern, flash: color }) {
      vibrate(pattern);
      flash(color);
      audio.play(SOUND[kind] || 'hit');
    },
    sound(kind) { audio.play(SOUND[kind] || kind); },
    vibrate,
  };
}
