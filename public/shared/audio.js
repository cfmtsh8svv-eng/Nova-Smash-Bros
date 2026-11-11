// All sound is made in the browser with the Web Audio API: short tones and bursts
// of noise for the effects, and a tiny step sequencer for the music. There are no
// sound files, so there is nothing to license.
//
// Browsers only allow sound after the user has tapped or clicked once. unlock()
// is called from that first tap. Every function is safe to call before that, or
// in a browser without Web Audio: it then simply does nothing.

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// One bar = 16 steps. null = silence. Lead and bass notes are MIDI numbers.
const TRACKS = {
  lobby: {
    bpm: 104, wave: 'triangle',
    bars: [
      { bass: 48, lead: [72, null, 76, null, 79, null, 76, null, 72, null, 76, null, 79, 81, 79, null] },
      { bass: 45, lead: [69, null, 72, null, 76, null, 72, null, 69, null, 72, null, 76, 77, 76, null] },
      { bass: 41, lead: [65, null, 69, null, 72, null, 69, null, 65, null, 69, null, 72, 74, 72, null] },
      { bass: 43, lead: [67, null, 71, null, 74, null, 71, null, 67, null, 71, 74, 79, null, 74, null] },
    ],
    kick: [0, 8], snare: [], hat: [4, 12],
  },
  campus: {
    bpm: 132, wave: 'square',
    bars: [
      { bass: 48, lead: [76, null, 76, 79, null, 76, null, 72, 74, null, 76, null, 79, null, 84, null] },
      { bass: 43, lead: [74, null, 74, 79, null, 74, null, 71, 72, null, 74, null, 79, null, 83, null] },
      { bass: 45, lead: [72, null, 72, 76, null, 72, null, 69, 72, null, 76, null, 81, null, 84, null] },
      { bass: 41, lead: [72, null, 77, null, 81, null, 77, null, 76, null, 74, null, 72, 74, 76, null] },
    ],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
  },
  beach: {
    bpm: 116, wave: 'triangle',
    bars: [
      { bass: 41, lead: [77, null, null, 81, null, 84, null, null, 81, null, 77, null, 79, null, 81, null] },
      { bass: 46, lead: [74, null, null, 77, null, 82, null, null, 77, null, 74, null, 77, null, 79, null] },
      { bass: 48, lead: [76, null, null, 79, null, 84, null, null, 79, null, 76, null, 79, null, 81, null] },
      { bass: 41, lead: [77, null, 81, null, 84, null, 86, null, 84, null, 81, null, 77, null, null, null] },
    ],
    kick: [0, 7, 8], snare: [4, 12], hat: [2, 6, 10, 14, 15],
  },
  bairro: {
    bpm: 98, wave: 'sawtooth',
    bars: [
      { bass: 45, lead: [69, null, 72, null, 76, null, null, 74, 72, null, 69, null, null, null, 67, null] },
      { bass: 41, lead: [69, null, 72, null, 77, null, null, 76, 72, null, 69, null, null, null, 65, null] },
      { bass: 48, lead: [67, null, 72, null, 76, null, null, 79, 76, null, 72, null, null, null, 67, null] },
      { bass: 40, lead: [68, null, 71, null, 76, null, null, 74, 71, null, 68, null, 71, null, 74, null] },
    ],
    kick: [0, 6, 8], snare: [4, 12], hat: [2, 10, 14],
  },
};

export function createAudio({ music = 0.45, effects = 0.8 } = {}) {
  let ctx = null;
  let sfxGain = null;
  let musicGain = null;
  let noiseBuffer = null;
  let track = null; // name of the track that should be playing
  let step = 0;
  let nextTime = 0;
  let timer = null;
  const volume = { music, effects };

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        sfxGain = ctx.createGain();
        musicGain = ctx.createGain();
        sfxGain.gain.value = volume.effects;
        musicGain.gain.value = volume.music;
        sfxGain.connect(ctx.destination);
        musicGain.connect(ctx.destination);
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {}); // 'suspended', or 'interrupted' after a call on an iPhone
      if (track && !timer) startSequencer();
      return true;
    } catch {
      return false;
    }
  }

  // At most this many effect sounds at once: more would only be noise, and a flood of
  // events must not be able to pile up thousands of them.
  const MAX_VOICES = 24;
  let voices = 0;
  function voice(node, out) {
    if (out !== sfxGain) return true; // the music keeps its own time
    if (voices >= MAX_VOICES) return false;
    voices += 1;
    node.onended = () => { voices -= 1; };
    return true;
  }

  // A single note that slides from one pitch to another and fades out.
  function tone({ type = 'square', from, to = from, dur = 0.12, gain = 0.2, at = 0, out = sfxGain }) {
    if (!ctx) return;
    try {
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      if (!voice(osc, out)) return;
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, from), t);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* the sound is skipped */ }
  }

  // A burst of filtered noise: thumps, swooshes, cymbals.
  function noise({ dur = 0.15, gain = 0.25, at = 0, from = 1200, to = from, kind = 'lowpass', out = sfxGain }) {
    if (!ctx) return;
    try {
      const t = ctx.currentTime + at;
      const src = ctx.createBufferSource();
      if (!voice(src, out)) return;
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noiseBuffer;
      filter.type = kind;
      filter.frequency.setValueAtTime(from, t);
      if (to !== from) filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(g).connect(out);
      src.start(t, Math.random() * 0.5, dur + 0.05);
    } catch { /* the sound is skipped */ }
  }

  const SFX = {
    hit: () => { noise({ dur: 0.09, gain: 0.35, from: 2400, to: 500 }); tone({ type: 'triangle', from: 220, to: 90, dur: 0.1, gain: 0.3 }); },
    bigHit: () => { noise({ dur: 0.22, gain: 0.5, from: 3000, to: 200 }); tone({ type: 'sawtooth', from: 180, to: 45, dur: 0.28, gain: 0.4 }); },
    swing: () => noise({ dur: 0.08, gain: 0.12, from: 900, to: 3200, kind: 'bandpass' }),
    jump: () => tone({ type: 'square', from: 320, to: 620, dur: 0.11, gain: 0.12 }),
    doubleJump: () => tone({ type: 'square', from: 480, to: 940, dur: 0.12, gain: 0.12 }),
    land: () => noise({ dur: 0.06, gain: 0.16, from: 500, to: 150 }),
    ko: () => { tone({ type: 'sawtooth', from: 900, to: 60, dur: 0.6, gain: 0.35 }); noise({ dur: 0.5, gain: 0.4, from: 4000, to: 120 }); },
    finalKo: () => { tone({ type: 'sawtooth', from: 1200, to: 40, dur: 1.4, gain: 0.45 }); noise({ dur: 1.2, gain: 0.5, from: 6000, to: 80 }); [0, 0.5, 1].forEach((at, i) => tone({ type: 'square', from: midi(60 + i * 7), dur: 0.5, gain: 0.2, at: at + 0.2 })); },
    respawn: () => [0, 0.07, 0.14].forEach((at, i) => tone({ type: 'triangle', from: midi(72 + i * 4), dur: 0.12, gain: 0.15, at })),
    item: () => { tone({ type: 'square', from: midi(79), dur: 0.08, gain: 0.14 }); tone({ type: 'square', from: midi(86), dur: 0.12, gain: 0.14, at: 0.08 }); },
    itemSpawn: () => tone({ type: 'triangle', from: midi(91), to: midi(96), dur: 0.1, gain: 0.08 }),
    itemBreak: () => noise({ dur: 0.15, gain: 0.25, from: 5000, to: 900, kind: 'highpass' }),
    count: () => tone({ type: 'square', from: midi(69), dur: 0.14, gain: 0.2 }),
    go: () => [60, 64, 67, 72].forEach((n) => tone({ type: 'square', from: midi(n), dur: 0.5, gain: 0.12 })),
    join: () => { tone({ type: 'triangle', from: midi(72), to: midi(84), dur: 0.14, gain: 0.2 }); noise({ dur: 0.05, gain: 0.1, from: 5000, kind: 'highpass' }); },
    ready: () => [76, 83].forEach((n, i) => tone({ type: 'triangle', from: midi(n), dur: 0.12, gain: 0.16, at: i * 0.09 })),
    click: () => tone({ type: 'square', from: 660, dur: 0.04, gain: 0.08 }),
    warn: () => [0, 0.22].forEach((at) => tone({ type: 'sawtooth', from: 392, to: 370, dur: 0.2, gain: 0.2, at })),
    warnCount: () => tone({ type: 'square', from: midi(81), dur: 0.1, gain: 0.16 }),
    strike: () => [67, 66, 65, 60].forEach((n, i) => tone({ type: 'sawtooth', from: midi(n), dur: 0.3, gain: 0.16, at: i * 0.26 })),
    train: () => { tone({ type: 'sawtooth', from: 311, dur: 0.9, gain: 0.3 }); tone({ type: 'sawtooth', from: 370, dur: 0.9, gain: 0.25 }); noise({ dur: 1.4, gain: 0.3, from: 300, to: 900 }); },
    wave: () => noise({ dur: 1.6, gain: 0.45, from: 300, to: 2400 }),
    gulls: () => [0, 0.25, 0.55].forEach((at) => tone({ type: 'sawtooth', from: 1500, to: 900, dur: 0.18, gain: 0.12, at })),
    crowd: () => noise({ dur: 2.2, gain: 0.25, from: 500, to: 1100, kind: 'bandpass' }),
    drinks: () => [88, 91, 95].forEach((n, i) => tone({ type: 'triangle', from: midi(n), dur: 0.1, gain: 0.12, at: i * 0.06 })),
    wifi: () => [0, 0.12, 0.3].forEach((at, i) => tone({ type: 'square', from: 900 - i * 250, dur: 0.07, gain: 0.12, at })),
    // one signature per special
    cash_rain: () => [0, 0.05, 0.1, 0.15, 0.2].forEach((at, i) => tone({ type: 'square', from: midi(88 + (i % 3) * 4), dur: 0.06, gain: 0.1, at })),
    padel_smash: () => { tone({ type: 'triangle', from: 700, to: 300, dur: 0.07, gain: 0.3 }); noise({ dur: 0.05, gain: 0.2, from: 4000, kind: 'highpass' }); },
    rounds_on_me: () => [84, 88, 84].forEach((n, i) => tone({ type: 'triangle', from: midi(n), dur: 0.12, gain: 0.16, at: i * 0.1 })),
    wave_rider: () => noise({ dur: 0.6, gain: 0.3, from: 500, to: 3000, kind: 'bandpass' }),
    ring_light_flash: () => tone({ type: 'sine', from: 2400, to: 3200, dur: 0.3, gain: 0.2 }),
    bass_drop: () => { tone({ type: 'sine', from: 160, to: 36, dur: 0.7, gain: 0.6 }); noise({ dur: 0.3, gain: 0.3, from: 2000, to: 100 }); },
    ding_ding: () => [0, 0.2].forEach((at) => { tone({ type: 'sine', from: 1568, dur: 0.35, gain: 0.25, at }); tone({ type: 'sine', from: 3136, dur: 0.2, gain: 0.08, at }); }),
    spaghetti_lasso: () => tone({ type: 'sawtooth', from: 300, to: 1400, dur: 0.16, gain: 0.14 }),
  };

  function play(name) {
    if (ctx && SFX[name]) SFX[name]();
  }

  // ---- music ----
  function scheduleStep(t, name, index) {
    const T = TRACKS[name];
    const stepLen = 60 / T.bpm / 4;
    const bar = T.bars[Math.floor(index / 16) % T.bars.length];
    const s = index % 16;
    const at = Math.max(0, t - ctx.currentTime);
    const lead = bar.lead[s];
    if (lead !== null) tone({ type: T.wave, from: midi(lead), dur: stepLen * 1.8, gain: T.wave === 'triangle' ? 0.16 : 0.07, at, out: musicGain });
    if (s % 4 === 0 || s === 10) tone({ type: 'triangle', from: midi(bar.bass - (s === 10 ? 0 : 12) + (s === 8 ? 7 : 0)), dur: stepLen * 2.4, gain: 0.22, at, out: musicGain });
    if (T.kick.includes(s)) tone({ type: 'sine', from: 140, to: 42, dur: 0.16, gain: 0.5, at, out: musicGain });
    if (T.snare.includes(s)) noise({ dur: 0.1, gain: 0.16, from: 1800, kind: 'highpass', at, out: musicGain });
    if (T.hat.includes(s)) noise({ dur: 0.03, gain: 0.07, from: 7000, kind: 'highpass', at, out: musicGain });
  }

  function startSequencer() {
    if (!ctx || timer) return;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    // Notes are scheduled a little ahead of time, so the rhythm stays even when the page is busy.
    timer = setInterval(() => {
      if (!track || !ctx) return;
      const stepLen = 60 / TRACKS[track].bpm / 4;
      if (nextTime < ctx.currentTime - 0.3) nextTime = ctx.currentTime + 0.05; // the tab was asleep
      while (nextTime < ctx.currentTime + 0.25) {
        scheduleStep(nextTime, track, step);
        step += 1;
        nextTime += stepLen;
      }
    }, 60);
  }

  function setMusic(name) {
    const next = TRACKS[name] ? name : null;
    if (next === track) return;
    track = next;
    step = 0;
    if (!track) {
      clearInterval(timer);
      timer = null;
    } else if (ctx) {
      if (!timer) startSequencer();
      else nextTime = ctx.currentTime + 0.1;
    }
  }

  function setVolume(kind, value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    volume[kind] = v;
    const node = kind === 'music' ? musicGain : sfxGain;
    if (node && ctx) node.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }

  return { unlock, play, setMusic, setVolume, volume, get ready() { return Boolean(ctx); } };
}
