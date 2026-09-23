// Stack to the Stars — one-tap rocket stacking. Plain canvas 2D, no libraries.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/js/config.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LB_ON = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ───────── tuning ───────── */
const START_W = 6;          // starting stage width (world units)
const BH = 1;               // stage height
const TRAVEL = 7.2;         // how far a stage slides from the centre
const PERFECT = 0.13;       // "perfect" tolerance
const GROW = 0.35;          // width you win back on a perfect streak

/* ───────── altitude milestones (level → km) ───────── */
const MILESTONES = [
  { lvl: 0, km: 0, name: 'Launch pad' },
  { lvl: 5, km: 12, name: 'Above the clouds' },
  { lvl: 10, km: 50, name: 'Stratosphere' },
  { lvl: 15, km: 100, name: 'Kármán line', sub: 'You are in space' },
  { lvl: 22, km: 408, name: 'ISS orbit' },
  { lvl: 30, km: 20200, name: 'GPS satellites' },
  { lvl: 38, km: 35786, name: 'Geostationary orbit' },
  { lvl: 50, km: 384400, name: 'The Moon' },
  { lvl: 65, km: 54.6e6, name: 'Mars' },
  { lvl: 85, km: 588e6, name: 'Jupiter' },
  { lvl: 110, km: 1.2e9, name: 'Saturn' },
  { lvl: 150, km: 24.9e9, name: 'Voyager 1', sub: 'Interstellar space' },
];
function kmAt(level) {
  if (level <= 0) return 0;
  for (let i = 1; i < MILESTONES.length; i++) {
    const a = MILESTONES[i - 1], b = MILESTONES[i];
    if (level <= b.lvl) {
      const t = (level - a.lvl) / (b.lvl - a.lvl);
      const ka = Math.max(a.km, 1), kb = b.km;
      return Math.exp(lerp(Math.log(ka), Math.log(kb), t));
    }
  }
  const last = MILESTONES[MILESTONES.length - 1];
  return last.km * Math.pow(1.08, level - last.lvl);
}
function fmtKm(km) {
  if (km < 1000) return `${Math.round(km).toLocaleString('en-US')} KM`;
  if (km < 1e6) return `${Math.round(km).toLocaleString('en-US')} KM`;
  if (km < 1e9) return `${(km / 1e6).toFixed(1)} MILLION KM`;
  return `${(km / 1e9).toFixed(2)} BILLION KM`;
}
const reachedAt = (level) => { let m = MILESTONES[0]; for (const x of MILESTONES) if (level >= x.lvl) m = x; return m; };
const nextAfter = (level) => MILESTONES.find((x) => x.lvl > level);

/* ───────── canvas sizing ───────── */
let W = 0, H = 0, DPR = 1, S = 30;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  S = Math.min(W / 11.5, H / 15);
}
addEventListener('resize', resize); resize();

/* ───────── audio (Web Audio, no files) ───────── */
const audio = {
  ctx: null, on: true, pad: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain(); this.out.gain.value = this.on ? 1 : 0; this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
      // soft space pad: two detuned sines through a lowpass, very quiet
      const g = this.ctx.createGain(); g.gain.value = 0.0; const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      [110, 164.8, 220.6].forEach((f) => { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(lp); o.start(); });
      lp.connect(g).connect(this.out); this.pad = g;
    } catch { this.ctx = null; }
  },
  setOn(v) { this.on = v; if (this.out) this.out.gain.setTargetAtTime(v ? 1 : 0, this.ctx.currentTime, 0.05); },
  padLevel(v) { if (this.pad) this.pad.gain.setTargetAtTime(v, this.ctx.currentTime, 1.2); },
  tone(f, dur, { type = 'sine', vol = 0.14, at = 0, to } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at; const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  hiss(dur = 0.12, vol = 0.12, freq = 2500) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime; const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + dur + 0.02);
  },
};
// pentatonic scale: every perfect in a row climbs one note higher
const SCALE = [0, 2, 4, 7, 9];
const noteHz = (i) => 261.63 * Math.pow(2, (SCALE[i % 5] + 12 * Math.floor(i / 5)) / 12);
try { audio.on = localStorage.getItem('stack_sound') !== 'off'; } catch { /* ignore */ }
const soundBtn = $('btn-sound');
function syncSound() { soundBtn.setAttribute('aria-pressed', String(audio.on)); soundBtn.setAttribute('aria-label', audio.on ? 'Sound on' : 'Sound off'); }
soundBtn.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); audio.setOn(!audio.on); syncSound(); try { localStorage.setItem('stack_sound', audio.on ? 'on' : 'off'); } catch { /* ignore */ } });
syncSound();

/* ───────── leaderboard ───────── */
let best = 0;
try { best = Number(localStorage.getItem('stack_best') || 0); } catch { /* ignore */ }
let board = [];
const headers = LB_ON ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' } : {};
async function loadBoard() {
  if (!LB_ON) { board = []; return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/stack_scores?select=initials,score&order=score.desc,created_at.asc&limit=10`, { headers });
    if (!r.ok) throw new Error(r.status);
    board = await r.json();
  } catch { board = null; }
}
function renderBoard(el, mine) {
  if (!LB_ON) { el.innerHTML = `<li class="muted">Public leaderboard coming soon. Your best: <b>${best}</b></li>`; return; }
  if (board === null) { el.innerHTML = '<li class="muted">Leaderboard offline right now. Your best is saved on this device.</li>'; return; }
  if (!board.length) { el.innerHTML = '<li class="muted">No builders yet. Be the first!</li>'; return; }
  el.innerHTML = board.map((r, i) => `<li class="${mine && mine.initials === r.initials && mine.score === r.score ? 'me' : ''}"><span>${i + 1}</span><span>${String(r.initials).replace(/[^A-Z]/g, '')}</span><b>${Number(r.score)}</b></li>`).join('');
}
const qualifies = (score) => LB_ON && board !== null && score > 0 && (board.length < 10 || score > board[board.length - 1].score);
const topScore = () => (board && board[0] ? board[0] : null);

/* ───────── game state ───────── */
let state = 'title';     // title | play | falling | over
let stack = [];          // placed stages: { x, w, hue }
let mover = null;        // { x, w, dir, speed }
let chunks = [];         // falling cut pieces
let parts = [];          // sparkle particles
let rings = [];          // perfect rings
let combo = 0, level = 0, runStart = 0, lastMilestone = 0;
let cam = 0, camT = 0, zoom = 1, zoomT = 1, shake = 0;
let overT = 0;
let lastRun = null;
const stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random() * 3, r: Math.random() < 0.1 ? 1.7 : 0.9, tw: Math.random() * 6 }));
const clouds = Array.from({ length: 9 }, (_, i) => ({ x: Math.random() * 14 - 7, lvl: 2.5 + i * 0.9 + Math.random() * 0.8, w: 2 + Math.random() * 3, v: (Math.random() - 0.5) * 0.3 }));

function hueFor(lv) { return (205 + lv * 11) % 360; }
function reset() {
  stack = [{ x: 0, w: START_W, hue: hueFor(0) }];
  chunks = []; parts = []; rings = [];
  combo = 0; level = 0; lastMilestone = 0; cam = camT = 0; zoom = zoomT = 1; overT = 0;
  spawn();
}
function speedFor(lv) { return Math.min(4.2 + lv * 0.11, 11.5); }
function spawn() {
  const top = stack[stack.length - 1];
  const fromLeft = stack.length % 2 === 0;
  mover = { x: fromLeft ? -TRAVEL : TRAVEL, w: top.w, dir: fromLeft ? 1 : -1, speed: speedFor(stack.length - 1), hue: hueFor(stack.length) };
}

function start() {
  audio.unlock(); audio.padLevel(0.035);
  reset(); state = 'play'; runStart = performance.now();
  $('title-screen').hidden = true; $('result-screen').hidden = true; $('hud').hidden = false;
  updateHud();
}

function drop() {
  if (state !== 'play' || !mover) return;
  const top = stack[stack.length - 1];
  const d = mover.x - top.x;
  if (Math.abs(d) <= PERFECT) {
    combo++;
    let w = top.w;
    if (combo >= 4) w = Math.min(START_W, w + GROW);
    stack.push({ x: top.x, w, hue: mover.hue });
    audio.tone(noteHz(Math.min(combo - 1, 14)), 0.5, { vol: 0.16 }); audio.tone(noteHz(Math.min(combo - 1, 14)) * 2, 0.35, { vol: 0.05, type: 'triangle' });
    rings.push({ x: top.x, lvl: stack.length - 1, w, t: 0 });
    for (let i = 0; i < 14; i++) parts.push({ x: top.x + (Math.random() - 0.5) * w, y: (stack.length - 1) * BH + 0.5, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, life: 0.8, max: 0.8, c: `hsl(${mover.hue},95%,75%)` });
    showPerfect();
    try { navigator.vibrate && navigator.vibrate(12); } catch { /* ignore */ }
  } else {
    const left = Math.max(mover.x - mover.w / 2, top.x - top.w / 2);
    const right = Math.min(mover.x + mover.w / 2, top.x + top.w / 2);
    const overlap = right - left;
    if (overlap <= 0) { fail(); return; }
    combo = 0;
    const nx = (left + right) / 2;
    // the part that hangs over gets sliced and falls
    const cutW = mover.w - overlap;
    const cutX = d > 0 ? right + cutW / 2 : left - cutW / 2;
    chunks.push({ x: cutX, y: stack.length * BH, w: cutW, vx: Math.sign(d) * 1.2, vy: 0, rot: 0, vr: Math.sign(d) * (1.5 + Math.random()), hue: mover.hue, life: 3 });
    stack.push({ x: nx, w: overlap, hue: mover.hue });
    audio.tone(330 + overlap * 25, 0.12, { type: 'triangle', vol: 0.09 }); audio.hiss(0.1, 0.08, 3200);
  }
  level = stack.length - 1;
  const bump = $('score'); bump.classList.remove('bump'); void bump.offsetWidth; bump.classList.add('bump');
  checkMilestone();
  updateHud();
  spawn();
}

function fail() {
  // the whole stage misses and tumbles down
  chunks.push({ x: mover.x, y: stack.length * BH, w: mover.w, vx: mover.dir * 1.5, vy: 0, rot: 0, vr: mover.dir * 2, hue: mover.hue, life: 4 });
  mover = null; state = 'falling'; overT = 0;
  audio.tone(220, 0.6, { type: 'sawtooth', vol: 0.06, to: 70 }); audio.hiss(0.3, 0.12, 400);
  audio.padLevel(0.0);
  shake = reduced ? 0 : 0.5;
}

let bannerTimer = 0;
function checkMilestone() {
  const m = MILESTONES.find((x) => x.lvl === level && x.lvl > 0);
  if (!m || m.lvl <= lastMilestone) return;
  lastMilestone = m.lvl;
  const b = $('banner'); b.innerHTML = `<small>${fmtKm(m.km)}</small>${m.name}${m.sub ? `<br><span style="font-size:.6em;letter-spacing:.14em;color:#7fe3ff">${m.sub}</span>` : ''}`;
  b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2600);
  [0, 4, 7, 12].forEach((s, i) => audio.tone(523.25 * Math.pow(2, s / 12), 0.9, { vol: 0.07, at: i * 0.07 }));
}
function showPerfect() {
  const p = $('perfect'); p.textContent = combo >= 4 ? `PERFECT ×${combo}` : 'PERFECT';
  p.hidden = true; void p.offsetWidth; p.hidden = false;
}
function updateHud() {
  $('score').textContent = level;
  $('alt').textContent = fmtKm(kmAt(level));
  const n = nextAfter(level); const top = topScore();
  let txt = n ? `${n.name} in ${n.lvl - level}` : '';
  if (top && level < top.score && top.score - level <= 5) txt = `${top.score - level} to beat #1 ${top.initials}`;
  else if (level > 0 && best > level && best - level <= 3) txt = `${best - level} to your best`;
  $('next').textContent = txt;
  $('best').textContent = Math.max(best, level);
}

function gameOver() {
  state = 'over';
  const score = level;
  const seconds = Math.round((performance.now() - runStart) / 100) / 10;
  lastRun = { score, seconds };
  const newBest = score > best;
  if (newBest) { best = score; try { localStorage.setItem('stack_best', String(best)); } catch { /* ignore */ } }
  const m = reachedAt(score), n = nextAfter(score);
  $('r-eyebrow').textContent = newBest && score > 0 ? 'New personal best!' : 'Mission report';
  $('r-score').textContent = score;
  $('r-reached').textContent = `Reached: ${m.name} · ${fmtKm(kmAt(score))}`;
  const top = topScore();
  let msg = n ? `Only ${n.lvl - score} more to reach ${n.name}.` : 'You left the solar system. Legend.';
  if (top && score < top.score) msg += ` ${top.score - score} more to beat #1 (${top.initials}).`;
  $('r-text').textContent = msg;
  const form = $('initials-form'); form.hidden = !qualifies(score); $('form-msg').textContent = '';
  form.querySelector('.init-row').hidden = false; form.querySelector('button').disabled = false;
  renderBoard($('board-result'));
  $('result-screen').hidden = false;
  if (!form.hidden) setTimeout(() => $('initials').focus(), 300); else $('btn-again').focus();
}

$('initials-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const val = $('initials').value.toUpperCase().replace(/[^A-Z]/g, '');
  const msg = $('form-msg');
  if (val.length !== 3) { msg.textContent = 'Please use exactly 3 letters (A–Z).'; return; }
  if (!lastRun) return;
  const btn = e.target.querySelector('button'); btn.disabled = true; msg.textContent = 'Sending to Mission Control…';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_stack_score`, { method: 'POST', headers, body: JSON.stringify({ p_initials: val, p_score: lastRun.score, p_seconds: lastRun.seconds }) });
    if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.message || 'Could not save'); }
    const rank = await r.json();
    msg.textContent = `Saved! You are #${rank}.`;
    e.target.querySelector('.init-row').hidden = true;
    await loadBoard(); renderBoard($('board-result'), { initials: val, score: lastRun.score });
    lastRun = null;
  } catch (err) { msg.textContent = `Not saved: ${err.message}`; btn.disabled = false; }
});
$('initials').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); });

/* ───────── input ───────── */
$('btn-start').addEventListener('click', (e) => { e.stopPropagation(); start(); });
$('btn-again').addEventListener('click', (e) => { e.stopPropagation(); start(); });
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state === 'play') drop(); else if (state === 'title') start(); });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'play') drop();
    else if (state === 'title' || (state === 'over' && $('initials-form').hidden)) start();
  }
});

/* ───────── update ───────── */
function update(dt) {
  if (mover && (state === 'play' || state === 'title')) {
    mover.x += mover.dir * mover.speed * dt;
    if (mover.x > TRAVEL) { mover.x = TRAVEL; mover.dir = -1; }
    if (mover.x < -TRAVEL) { mover.x = -TRAVEL; mover.dir = 1; }
  }
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i]; c.vy -= 18 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.life -= dt;
    if (c.life <= 0) chunks.splice(i, 1);
  }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 3 * dt; if (p.life <= 0) parts.splice(i, 1); }
  for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.6) rings.splice(i, 1); }
  for (const c of clouds) { c.x += c.v * dt; if (c.x > 9) c.x = -9; if (c.x < -9) c.x = 9; }
  if (shake > 0) shake = Math.max(0, shake - dt * 1.5);

  // camera: keep the top of the tower in the lower-middle of the screen
  const viewUnits = H / (S * zoom);
  camT = Math.max(0, stack.length * BH - viewUnits * 0.42);
  if (state === 'falling' || state === 'over') {
    overT += dt;
    // zoom out to show the whole rocket you built
    const need = stack.length * BH + 5;
    zoomT = Math.min(1, (H / S) / need);
    camT = 0;
    if (state === 'falling' && overT > (reduced ? 0.2 : 1.6)) gameOver();
  } else zoomT = 1;
  zoom = lerp(zoom, zoomT, clamp(dt * 2.2, 0, 1));
  cam = lerp(cam, camT, clamp(dt * (state === 'play' ? 6 : 2.2), 0, 1));
}

/* ───────── draw ───────── */
const SX = (x) => W / 2 + x * S * zoom;
const SY = (y) => H - (y - cam) * S * zoom - H * 0.12;

function mixHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`;
}

function drawSky(t) {
  const viewLvl = cam + (H / (S * zoom)) * 0.5;       // level at the middle of the screen
  const space = smooth(3, 17, viewLvl);                 // 0 = sunset sky, 1 = deep space
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mixHex('#2a3f7a', '#02030a', space));
  g.addColorStop(0.55, mixHex('#8a4a7c', '#040716', space));
  g.addColorStop(1, mixHex('#ff9a62', '#070b1c', space));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars (parallax)
  const sa = smooth(4, 16, viewLvl);
  if (sa > 0.01) {
    for (const s of stars) {
      const y = ((s.y * H + cam * S * zoom * 0.15) % (H * 1.2)) - H * 0.1;
      ctx.globalAlpha = sa * (0.55 + 0.45 * Math.sin(t * 0.0015 + s.tw));
      ctx.fillStyle = '#fff'; ctx.fillRect(s.x * W, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }
  // Earth's curve below once you're in space
  const earth = smooth(14, 22, viewLvl) * (1 - smooth(40, 52, viewLvl));
  if (earth > 0.01) {
    const R = W * 1.6; const cy = H + R - H * 0.18 * earth;
    const eg = ctx.createRadialGradient(W / 2, cy, R * 0.9, W / 2, cy, R * 1.03);
    eg.addColorStop(0, '#0b3a86'); eg.addColorStop(0.93, '#2a7bd6'); eg.addColorStop(0.97, 'rgba(127,227,255,0.8)'); eg.addColorStop(1, 'rgba(127,227,255,0)');
    ctx.globalAlpha = earth; ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(W / 2, cy, R * 1.03, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  // milestone bodies drifting past
  const body = (lvl, draw) => { const k = (viewLvl - lvl) / 8; if (k > -1 && k < 1) draw(1 - Math.abs(k), k); };
  body(22, (a, k) => { // ISS
    const x = W * (0.2 + (k + 1) * 0.3), y = H * 0.3;
    ctx.globalAlpha = a; ctx.fillStyle = '#cfd6e4'; ctx.fillRect(x - 26, y - 1.5, 52, 3); ctx.fillStyle = '#2b4c9a';
    [-24, -14, 10, 20].forEach((dx) => ctx.fillRect(x + dx, y - 9, 6, 18)); ctx.fillStyle = '#e8ebf2'; ctx.fillRect(x - 6, y - 4, 12, 8); ctx.globalAlpha = 1;
  });
  const planet = (lvl, color, rMul, ring) => body(lvl, (a, k) => {
    const r = Math.min(W, H) * rMul * (0.6 + a * 0.6); const x = W * 0.78, y = H * (0.28 + k * 0.4);
    ctx.globalAlpha = a;
    const pg = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r); pg.addColorStop(0, color[0]); pg.addColorStop(1, color[1]);
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (ring) { ctx.strokeStyle = 'rgba(230,210,160,0.7)'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r * 0.45, -0.3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  });
  planet(50, ['#f2f2ee', '#8c8c94'], 0.16);
  planet(65, ['#ff9a6a', '#8a2a14'], 0.12);
  planet(85, ['#f4d9a8', '#a0673a'], 0.2);
  planet(110, ['#f7e7b8', '#b08b50'], 0.15, true);
  // clouds low in the sky
  for (const c of clouds) {
    const y = SY(c.lvl); if (y < -40 || y > H + 40) continue;
    ctx.fillStyle = `rgba(255,236,230,${0.16 * (1 - space)})`;
    ctx.beginPath(); ctx.ellipse(SX(c.x), y, c.w * S * zoom, 0.35 * S * zoom, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPad() {
  const y0 = SY(0);
  if (y0 > H + 200) return;
  ctx.fillStyle = '#0d0f16'; ctx.fillRect(0, y0, W, H - y0 + 400);
  ctx.fillStyle = '#3a3f4c'; ctx.fillRect(SX(-START_W / 2 - 1.2), y0, (START_W + 2.4) * S * zoom, 0.45 * S * zoom);
  ctx.fillStyle = '#5a606e'; ctx.fillRect(SX(-START_W / 2 - 1.2), y0, (START_W + 2.4) * S * zoom, 0.08 * S * zoom);
  // launch tower
  const tx = SX(-START_W / 2 - 2.6), tw = 0.9 * S * zoom, th = Math.min(stack.length + 2, 14) * S * zoom;
  ctx.strokeStyle = '#b6452c'; ctx.lineWidth = Math.max(1, 1.5 * zoom);
  ctx.strokeRect(tx, y0 - th, tw, th);
  for (let i = 0; i < th; i += tw) { ctx.beginPath(); ctx.moveTo(tx, y0 - i); ctx.lineTo(tx + tw, y0 - i - tw); ctx.moveTo(tx + tw, y0 - i); ctx.lineTo(tx, y0 - i - tw); ctx.stroke(); }
  ctx.fillStyle = Math.sin(performance.now() * 0.004) > 0 ? '#ff3b1f' : '#551208'; ctx.beginPath(); ctx.arc(tx + tw / 2, y0 - th - 4, 3, 0, Math.PI * 2); ctx.fill();
}

// one rocket stage: shaded cylinder with a coloured band
function stage(x, y, w, hue, lvl, alpha = 1) {
  const px = SX(x - w / 2), py = SY(y + BH), pw = w * S * zoom, ph = BH * S * zoom;
  if (py > H + ph || py + ph < -ph) return;
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(px, 0, px + pw, 0);
  g.addColorStop(0, '#9aa1ae'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(0.7, '#e3e6ec'); g.addColorStop(1, '#8a909c');
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph - Math.max(1, zoom));
  // coloured band
  const bg = ctx.createLinearGradient(px, 0, px + pw, 0);
  bg.addColorStop(0, `hsl(${hue},70%,38%)`); bg.addColorStop(0.35, `hsl(${hue},95%,62%)`); bg.addColorStop(1, `hsl(${hue},70%,34%)`);
  ctx.fillStyle = bg; ctx.fillRect(px, py + ph * 0.62, pw, ph * 0.22);
  // roll-pattern marks every 5th stage (like real rockets)
  if (lvl % 5 === 0) { ctx.fillStyle = '#15171d'; ctx.fillRect(px, py, pw * 0.25, ph * 0.6); ctx.fillRect(px + pw * 0.5, py, pw * 0.25, ph * 0.6); }
  // porthole now and then
  if (lvl % 7 === 3 && pw > ph) { ctx.fillStyle = '#0b1c38'; ctx.beginPath(); ctx.arc(px + pw / 2, py + ph * 0.32, ph * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px, py, pw, Math.max(1, ph * 0.05));
  ctx.globalAlpha = 1;
}

function drawEngines() {
  const base = stack[0]; const y = SY(0);
  const n = 3; const bw = base.w * S * zoom;
  for (let i = 0; i < n; i++) {
    const cx = SX(base.x) + (i - 1) * bw * 0.28;
    ctx.fillStyle = '#3c3f47'; ctx.beginPath(); ctx.moveTo(cx - bw * 0.07, y); ctx.lineTo(cx + bw * 0.07, y); ctx.lineTo(cx + bw * 0.1, y + 0.4 * S * zoom); ctx.lineTo(cx - bw * 0.1, y + 0.4 * S * zoom); ctx.fill();
  }
}

function drawNose() {
  const top = stack[stack.length - 1]; const y = SY(stack.length * BH); const w = top.w * S * zoom, cx = SX(top.x);
  const h = Math.max(w * 0.9, 1.2 * S * zoom);
  const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0); g.addColorStop(0, '#9aa1ae'); g.addColorStop(0.4, '#fff'); g.addColorStop(1, '#8a909c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.quadraticCurveTo(cx - w / 2, y - h * 0.6, cx, y - h); ctx.quadraticCurveTo(cx + w / 2, y - h * 0.6, cx + w / 2, y); ctx.fill();
  ctx.fillStyle = '#fc3d21'; ctx.beginPath(); ctx.arc(cx, y - h * 0.45, Math.max(2, w * 0.08), 0, Math.PI * 2); ctx.fill();
}

// dashed lines: your best, and the #1 on the leaderboard
function marker(lvl, label, color) {
  if (lvl <= 0) return;
  const y = SY(lvl * BH); if (y < 0 || y > H) return;
  ctx.setLineDash([6, 6]); ctx.strokeStyle = color; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(label, 10, y - 6);
}

function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 12);
  drawSky(t);
  if (state === 'play') { marker(best, `BEST ${best}`, '#ffb547'); const top = topScore(); if (top && top.score !== best) marker(top.score, `#1 ${top.initials} ${top.score}`, '#7fe3ff'); }
  drawPad();
  drawEngines();
  stack.forEach((s, i) => stage(s.x, i * BH, s.w, s.hue, i));
  if (state === 'over' || (state === 'falling' && overT > 0.5)) drawNose();
  // perfect rings
  for (const r of rings) {
    const k = r.t / 0.6; const y = SY(r.lvl * BH + BH);
    ctx.strokeStyle = `rgba(127,227,255,${1 - k})`; ctx.lineWidth = 2;
    ctx.strokeRect(SX(r.x - r.w / 2) - k * 18, y - k * 10, r.w * S * zoom + k * 36, BH * S * zoom + k * 20);
  }
  // moving stage (with a soft shadow guide on the stack)
  if (mover && state === 'play') {
    stage(mover.x, stack.length * BH, mover.w, mover.hue, stack.length);
  }
  // falling cut pieces
  for (const c of chunks) {
    ctx.save(); const cx = SX(c.x), cy = SY(c.y + BH / 2);
    ctx.translate(cx, cy); ctx.rotate(c.rot);
    const pw = c.w * S * zoom, ph = BH * S * zoom;
    ctx.globalAlpha = clamp(c.life, 0, 1);
    ctx.fillStyle = '#d7dbe3'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.fillStyle = `hsl(${c.hue},90%,58%)`; ctx.fillRect(-pw / 2, ph * 0.12, pw, ph * 0.22);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // sparkles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/* ───────── loop ───────── */
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  update(dt); draw(now);
  requestAnimationFrame(loop);
}

(async function init() {
  reset(); state = 'title';
  // a little demo tower behind the title card
  for (let i = 0; i < 6; i++) stack.push({ x: (Math.random() - 0.5) * 0.3, w: START_W - i * 0.15, hue: hueFor(i + 1) });
  mover = { x: -3, w: START_W - 1, dir: 1, speed: 3, hue: hueFor(7) };
  state = 'title';
  $('best').textContent = best;
  renderBoard($('board-title'));
  requestAnimationFrame(loop);
  if (LB_ON) { await loadBoard(); renderBoard($('board-title')); }
  if (location.search.includes('debug')) window.__stack = { get state() { return state; }, get level() { return level; }, get mover() { return mover; }, get stack() { return stack; }, drop, start };
})();

