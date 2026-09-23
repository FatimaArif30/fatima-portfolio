// All sounds are made in code with the Web Audio API — no audio files to download.
// Includes NASA "Quindar tones": the real beeps heard before and after Apollo radio calls.
let ctx = null, master = null, noiseBuf = null, humNodes = null, chatterTimer = 0;
let enabled = false;

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}

function startHum() {
  if (humNodes || !ctx) return;
  const out = ctx.createGain(); out.gain.value = 0.05; out.connect(master);
  const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 110.4;
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  o1.connect(out); o2.connect(g2).connect(out);
  // air conditioning hiss
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  n.connect(lp).connect(ng).connect(out);
  // slow wobble
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 0.015;
  lfo.connect(lg).connect(out.gain);
  [o1, o2, n, lfo].forEach((s) => s.start());
  humNodes = { out };
}

function tone(freq, dur, { type = 'sine', vol = 0.1, at = 0, to = null } = {}) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// Radio chatter: quindar tone, a burst of band-passed "voice-like" static, closing tone.
function chatter() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  tone(2525, 0.25, { vol: 0.035 });
  const len = 0.9 + Math.random() * 1.2;
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.4;
  const g = ctx.createGain(); g.gain.value = 0;
  // syllable-like amplitude pattern
  let tt = t + 0.3;
  while (tt < t + 0.3 + len) { const d = 0.06 + Math.random() * 0.14; g.gain.setValueAtTime(0.02 + Math.random() * 0.03, tt); g.gain.setValueAtTime(0.0, tt + d); tt += d + Math.random() * 0.08; }
  n.connect(bp).connect(g).connect(master); n.start(t + 0.3); n.stop(t + 0.35 + len);
  tone(2475, 0.25, { vol: 0.035, at: 0.4 + len });
}

export const sound = {
  get on() { return enabled; },
  unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
  set(on, persist = true) {
    enabled = on && !!ensure();
    if (!ctx) return;
    if (enabled) { this.unlock(); startHum(); }
    master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.2);
    if (persist) { try { localStorage.setItem('mc_sound', enabled ? 'on' : 'off'); } catch { /* ignore */ } }
  },
  preferred() { try { return localStorage.getItem('mc_sound') !== 'off'; } catch { return true; } },
  click() { tone(1180, 0.07, { vol: 0.06, type: 'triangle', to: 1600 }); },
  hover() { tone(2200, 0.03, { vol: 0.015, type: 'square' }); },
  open() { tone(660, 0.1, { vol: 0.06 }); tone(990, 0.14, { vol: 0.05, at: 0.08 }); },
  close() { tone(880, 0.1, { vol: 0.05, to: 520 }); },
  count() { tone(1000, 0.12, { vol: 0.08, type: 'square' }); },
  go() { tone(1500, 0.5, { vol: 0.09, type: 'square' }); },
  rumble(sec = 4) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(120, t); lp.frequency.linearRampToValueAtTime(420, t + sec * 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.8); g.gain.setValueAtTime(0.7, t + sec * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    n.connect(lp).connect(g).connect(master); n.start(t); n.stop(t + sec + 0.1);
  },
  // call every frame; plays a radio call now and then
  tick(dt) {
    if (!enabled) return;
    chatterTimer -= dt;
    if (chatterTimer <= 0) { chatter(); chatterTimer = 14 + Math.random() * 18; }
  },
  quindar() { tone(2525, 0.25, { vol: 0.04 }); },
};
