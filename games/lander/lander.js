// Lunar Lander — FA-01 flight simulator. Plain canvas 2D, no libraries.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/js/config.js';

/* ───────── constants (metres, seconds) ───────── */
const WORLD_W = 400, WORLD_H = 300;
const GRAVITY = 1.62;            // Moon gravity
const THRUST = 4.2;              // main engine acceleration
const TURN = Math.PI * 0.62;     // rad/s
const FUEL_MAX = 1000;
const BURN = 55;                 // fuel per second at full thrust
const TURN_BURN = 6;
const SAFE_VY = 3.6, SAFE_VX = 2.2, SAFE_ANGLE = 0.2;
const LEG_SPAN = 4.6, LEG_DROP = 4.2;
const MULTS = [1, 2, 5];

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const coarse = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LB_ON = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}
addEventListener('resize', resize); resize();

/* ───────── random helpers ───────── */
let seed = (Date.now() & 0xffff) + 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ───────── stars (screen space) ───────── */
const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() < 0.08 ? 1.6 : 0.8, a: 0.3 + Math.random() * 0.7 }));

/* ───────── terrain ───────── */
let terrain = [], pads = [], craters = [];
function makeTerrain() {
  const n = 81; const step = WORLD_W / (n - 1);
  const ph = [rand() * 6, rand() * 6, rand() * 6, rand() * 6];
  terrain = [];
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const h = 55 + 32 * Math.sin(x * 0.018 + ph[0]) + 18 * Math.sin(x * 0.047 + ph[1]) + 9 * Math.sin(x * 0.11 + ph[2]) + 5 * Math.sin(x * 0.29 + ph[3]) + rand() * 5;
    terrain.push({ x, y: clamp(h, 12, 140) });
  }
  // pads: widths in segments; wide pad pays x1, narrow pays x5
  pads = [];
  const defs = [{ m: 1, seg: 5 }, { m: 2, seg: 3 }, { m: 5, seg: 2 }].sort(() => rand() - 0.5);
  const zones = [[6, 24], [30, 50], [56, 74]];
  defs.forEach((d, k) => {
    const [a, b] = zones[k];
    const start = a + Math.floor(rand() * (b - a - d.seg));
    let y = 0; for (let i = start; i <= start + d.seg; i++) y += terrain[i].y; y /= d.seg + 1;
    for (let i = start; i <= start + d.seg; i++) terrain[i].y = y;
    pads.push({ x1: terrain[start].x, x2: terrain[start + d.seg].x, y, m: d.m });
  });
  craters = Array.from({ length: 16 }, () => ({ x: rand() * WORLD_W, dy: 4 + rand() * 30, r: 2 + rand() * 7 }));
}
function groundAt(x) {
  x = clamp(x, 0, WORLD_W);
  const step = WORLD_W / (terrain.length - 1);
  const i = Math.min(terrain.length - 2, Math.floor(x / step));
  const t = (x - terrain[i].x) / step;
  return lerp(terrain[i].y, terrain[i + 1].y, t);
}
const padAt = (x) => pads.find((p) => x >= p.x1 - 0.2 && x <= p.x2 + 0.2);

/* ───────── ship ───────── */
const ship = { x: 80, y: 238, vx: 14, vy: 0, fuel: FUEL_MAX, thrusting: false, t0: 0 };
// tilt = 0 is upright; positive tilt leans right (clockwise on screen).
let tilt = 0;
function resetShip() {
  ship.x = 70 + rand() * 60; ship.y = 238; ship.vx = 10 + rand() * 8; ship.vy = -1; ship.fuel = FUEL_MAX;
  tilt = -0.6; ship.thrusting = false; ship.t0 = performance.now();
}

/* ───────── particles ───────── */
const parts = [];
function puff(x, y, vx, vy, life, col, size) { if (parts.length < 400) parts.push({ x, y, vx, vy, life, max: life, col, size }); }

/* ───────── input ───────── */
const keys = { left: false, right: false, thrust: false };
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'thrust', KeyW: 'thrust', Space: 'thrust' };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); audio.unlock(); }
  if ((e.code === 'Space' || e.code === 'Enter') && state !== 'flying' && !$('title-screen').hidden) { startGame(); e.preventDefault(); }
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { keys.left = keys.right = keys.thrust = false; });
document.querySelectorAll('.touch button').forEach((b) => {
  const k = b.dataset.key;
  const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add('on'); audio.unlock(); try { b.setPointerCapture(e.pointerId); } catch { /* ok */ } };
  const off = () => { keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

/* ───────── audio (Web Audio, no files) ───────── */
const audio = {
  ctx: null, on: true, thrustGain: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = this.ctx.sampleRate * 2; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      this.thrustGain = this.ctx.createGain(); this.thrustGain.gain.value = 0;
      src.connect(lp).connect(this.thrustGain).connect(this.ctx.destination); src.start();
    } catch { this.ctx = null; }
  },
  thrust(on) { if (!this.thrustGain) return; this.thrustGain.gain.setTargetAtTime(on && this.on ? 0.22 : 0, this.ctx.currentTime, 0.05); },
  tone(f, dur, type = 'sine', vol = 0.12, f2) {
    if (!this.ctx || !this.on) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); const t = this.ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  boom() {
    if (!this.ctx || !this.on) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; const g = this.ctx.createGain(); const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300; const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    s.connect(lp).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + 1.5);
  },
};
try { audio.on = localStorage.getItem('lander_sound') !== 'off'; } catch { /* ignore */ }
const soundBtn = $('btn-sound');
function syncSound() { soundBtn.setAttribute('aria-pressed', String(audio.on)); soundBtn.setAttribute('aria-label', audio.on ? 'Sound on' : 'Sound off'); }
soundBtn.addEventListener('click', () => { audio.on = !audio.on; audio.unlock(); audio.thrust(false); syncSound(); try { localStorage.setItem('lander_sound', audio.on ? 'on' : 'off'); } catch { /* ignore */ } });
syncSound();

/* ───────── leaderboard ───────── */
let best = 0;
try { best = Number(localStorage.getItem('lander_best') || 0); } catch { /* ignore */ }
let board = [];
const headers = LB_ON ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' } : {};
async function loadBoard() {
  if (!LB_ON) { board = []; return false; }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/lander_scores?select=initials,score&order=score.desc,created_at.asc&limit=10`, { headers });
    if (!r.ok) throw new Error(r.status);
    board = await r.json(); return true;
  } catch { board = null; return false; }
}
function renderBoard(el, mine) {
  if (!LB_ON) { el.innerHTML = `<li class="muted">Public leaderboard coming soon. Your best: <b>${best}</b></li>`; return; }
  if (board === null) { el.innerHTML = '<li class="muted">Leaderboard offline right now. Your best is saved on this device.</li>'; return; }
  if (!board.length) { el.innerHTML = '<li class="muted">No pilots yet. Be the first to land!</li>'; return; }
  el.innerHTML = board.map((r, i) => `<li class="${mine && mine.initials === r.initials && mine.score === r.score ? 'me' : ''}"><span>${i + 1}</span><span>${String(r.initials).replace(/[^A-Z]/g, '')}</span><b>${Number(r.score)}</b></li>`).join('');
}
function qualifies(score) {
  if (!LB_ON || board === null) return false;
  return board.length < 10 || score > board[board.length - 1].score;
}

/* ───────── state ───────── */
let state = 'title';
let lastResult = null;
let flightTime = 0;
let shake = 0;
let lowFuelBeep = 0;

function startGame() {
  audio.unlock();
  makeTerrain(); resetShip(); parts.length = 0; flightTime = 0;
  state = 'flying';
  $('title-screen').hidden = true; $('result-screen').hidden = true; $('hud').hidden = false;
  $('touch').hidden = !coarse;
}
$('btn-start').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);

function endFlight(success, pad, detail) {
  audio.thrust(false);
  keys.left = keys.right = keys.thrust = false;
  const r = $('result-screen');
  const bd = $('r-breakdown'); const form = $('initials-form');
  form.hidden = true; $('form-msg').textContent = '';
  if (success) {
    state = 'landed';
    const softness = clamp(1 - (Math.abs(ship.vy) / SAFE_VY) * 0.7 - (Math.abs(ship.vx) / SAFE_VX) * 0.3, 0, 1);
    const bonus = Math.round(500 * softness);
    const fuel = Math.round(ship.fuel);
    const score = (bonus + fuel) * pad.m;
    lastResult = { score, fuel, pad: pad.m, seconds: Math.round(flightTime * 10) / 10 };
    const newBest = score > best;
    if (newBest) { best = score; try { localStorage.setItem('lander_best', String(best)); } catch { /* ignore */ } }
    $('r-eyebrow').textContent = 'Mission report · success';
    $('r-title').textContent = pad.m === 5 ? 'Perfect landing!' : 'The Eagle has landed';
    $('r-text').textContent = newBest ? 'New personal best. Houston is impressed.' : 'Touchdown confirmed. Nice flying, pilot.';
    bd.innerHTML = `<dt>Soft landing bonus</dt><dd>${bonus}</dd><dt>Fuel left</dt><dd>${fuel}</dd><dt>Pad multiplier</dt><dd>× ${pad.m}</dd><dt class="total">Score</dt><dd class="total">${score}</dd>`;
    audio.tone(660, 0.18, 'sine', 0.12); setTimeout(() => audio.tone(990, 0.3, 'sine', 0.12), 180);
    if (qualifies(score)) { form.hidden = false; setTimeout(() => $('initials').focus(), 350); }
  } else {
    state = 'crashed'; lastResult = null;
    $('r-eyebrow').textContent = 'Mission report · lost signal';
    $('r-title').textContent = 'Houston, we have a problem';
    $('r-text').textContent = detail;
    bd.innerHTML = `<dt>Vertical speed</dt><dd>${Math.abs(ship.vy).toFixed(1)} m/s (max ${SAFE_VY})</dd><dt>Horizontal speed</dt><dd>${Math.abs(ship.vx).toFixed(1)} m/s (max ${SAFE_VX})</dd><dt>Tilt</dt><dd>${Math.round(Math.abs(tilt) * 57.3)}° (max ${Math.round(SAFE_ANGLE * 57.3)}°)</dd>`;
    audio.boom(); shake = reduced ? 0 : 1;
    for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI; const s = 4 + Math.random() * 22; puff(ship.x, ship.y, Math.cos(a) * s, Math.sin(a) * s, 1 + Math.random() * 1.6, i % 3 ? '#ffb547' : '#eef3ff', 1 + Math.random() * 2.4); }
  }
  renderBoard($('board-result'));
  setTimeout(() => { r.hidden = false; $('touch').hidden = true; }, success ? 700 : 1300);
}

$('initials-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const val = $('initials').value.toUpperCase().replace(/[^A-Z]/g, '');
  const msg = $('form-msg');
  if (val.length !== 3) { msg.textContent = 'Please use exactly 3 letters (A–Z).'; return; }
  if (!lastResult) return;
  const btn = e.submitter || e.target.querySelector('button'); btn.disabled = true; msg.textContent = 'Sending to Mission Control…';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_lander_score`, {
      method: 'POST', headers,
      body: JSON.stringify({ p_initials: val, p_score: lastResult.score, p_fuel: lastResult.fuel, p_pad: lastResult.pad, p_seconds: lastResult.seconds }),
    });
    if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.message || 'Could not save'); }
    const rank = await r.json();
    msg.textContent = `Saved! You are #${rank}.`;
    $('initials-form').querySelector('.init-row').hidden = true;
    await loadBoard(); renderBoard($('board-result'), { initials: val, score: lastResult.score });
    lastResult = null;
  } catch (err) { msg.textContent = `Not saved: ${err.message}`; btn.disabled = false; }
});
$('initials').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); });

/* ───────── simulation ───────── */
function step(dt) {
  if (state !== 'flying') return;
  flightTime += dt;
  const turning = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  if (turning && ship.fuel > 0) { tilt = clamp(tilt - turning * TURN * dt, -Math.PI * 0.6, Math.PI * 0.6); ship.fuel = Math.max(0, ship.fuel - TURN_BURN * dt); }
  ship.thrusting = keys.thrust && ship.fuel > 0;
  let ax = 0, ay = -GRAVITY;
  if (ship.thrusting) {
    ax += Math.sin(tilt) * THRUST; ay += Math.cos(tilt) * THRUST;
    ship.fuel = Math.max(0, ship.fuel - BURN * dt);
    // exhaust
    const ex = ship.x - Math.sin(tilt) * 3.2, ey = ship.y - Math.cos(tilt) * 3.2;
    for (let i = 0; i < 2; i++) puff(ex, ey, -Math.sin(tilt) * 18 + (Math.random() - 0.5) * 5 + ship.vx, -Math.cos(tilt) * 18 + (Math.random() - 0.5) * 5 + ship.vy, 0.35, '#ffb547', 1.4);
    const alt = ship.y - LEG_DROP - groundAt(ship.x);
    if (alt < 30) for (let i = 0; i < 2; i++) { const d = Math.random() < 0.5 ? -1 : 1; puff(ship.x + (Math.random() - 0.5) * 4, groundAt(ship.x) + 0.5, d * (8 + Math.random() * 14) * (1 - alt / 30), 1 + Math.random() * 3, 1.1, '#9aa0ab', 1.6); }
  }
  audio.thrust(ship.thrusting);
  ship.vx += ax * dt; ship.vy += ay * dt;
  ship.x += ship.vx * dt; ship.y += ship.vy * dt;
  if (ship.x < 0) ship.x += WORLD_W; if (ship.x > WORLD_W) ship.x -= WORLD_W;
  if (ship.y > WORLD_H + 80) { ship.vy = Math.min(ship.vy, 0); }

  if (ship.fuel > 0 && ship.fuel < 150) { lowFuelBeep -= dt; if (lowFuelBeep <= 0) { audio.tone(1320, 0.08, 'square', 0.04); lowFuelBeep = 0.8; } }

  // collision: two feet + body
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const feet = [-LEG_SPAN, LEG_SPAN].map((dx) => ({ x: ship.x + dx * c - LEG_DROP * s, y: ship.y - dx * s - LEG_DROP * c }));
  const bodyHit = ship.y - 1.5 < groundAt(ship.x) + 0.5;
  const touch = feet.some((f) => f.y <= groundAt(f.x));
  if (touch || bodyHit) {
    const p1 = padAt(feet[0].x), p2 = padAt(feet[1].x);
    const onPad = p1 && p1 === p2;
    const soft = Math.abs(ship.vy) <= SAFE_VY && Math.abs(ship.vx) <= SAFE_VX && Math.abs(tilt) <= SAFE_ANGLE;
    if (onPad && soft && !bodyHit) {
      ship.y = p1.y + LEG_DROP * Math.cos(tilt) + 0.01; tilt = 0;
      endFlight(true, p1);
    } else {
      let why = 'Too fast on touchdown. Use short bursts of thrust near the ground.';
      if (!onPad) why = 'You missed the landing pad. Aim for the lit flat pads.';
      else if (Math.abs(tilt) > SAFE_ANGLE) why = 'The lander was tilted. Straighten up before touchdown.';
      else if (Math.abs(ship.vx) > SAFE_VX) why = 'Too much sideways speed. Cancel it by tilting the other way.';
      endFlight(false, null, why);
    }
  }
}

/* ───────── rendering ───────── */
let view = { s: 1, ox: 0, oy: 0 };
function computeView(dt) {
  const hudTop = 70, bottomPad = coarse && state === 'flying' ? 96 : 0;
  const availH = H - bottomPad;
  // narrow (phone) screens show a 230 m window that follows the ship, so the lander stays big enough
  const base = Math.min((availH - 10) / (WORLD_H * 0.92), Math.max(W / WORLD_W, W / 230));
  let zoom = 1, cx = WORLD_W / 2, cy = WORLD_H / 2;
  if (state !== 'title') {
    const alt = ship.y - groundAt(ship.x);
    const z = alt < 55 ? lerp(2.1, 1, clamp((alt - 12) / 43, 0, 1)) : 1;
    zoom = z;
    if (z > 1 || base * WORLD_W > W + 1) cx = ship.x;
    if (z > 1) cy = ship.y - 6;
  }
  const s = lerp(view.s || base, base * zoom, clamp(dt * 3, 0, 1));
  const tx = W / 2 - cx * s, ty = hudTop * 0 + availH / 2 + cy * s;
  // clamp so we don't show beyond world edges when zoomed
  let ox = tx, oy = ty;
  if (s * WORLD_W > W) ox = clamp(ox, W - WORLD_W * s, 0); else ox = (W - WORLD_W * s) / 2;
  const groundBottom = availH;
  if (oy < groundBottom) oy = groundBottom; // world y=0 at or below screen bottom
  view = { s, ox: lerp(view.ox || ox, ox, clamp(dt * 4, 0, 1)), oy: lerp(view.oy || oy, oy, clamp(dt * 4, 0, 1)) };
}
const X = (x) => view.ox + x * view.s;
const Y = (y) => view.oy - y * view.s;

function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#010208'); g.addColorStop(1, '#050915');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const st of stars) { ctx.globalAlpha = st.a * (0.75 + 0.25 * Math.sin(t * 0.001 + st.x * 40)); ctx.fillStyle = '#fff'; ctx.fillRect(st.x * W, st.y * H * 0.8, st.r, st.r); }
  ctx.globalAlpha = 1;
  // Earth
  const er = Math.min(W, H) * 0.07, ex = W * 0.84, ey = H * 0.2;
  const eg = ctx.createRadialGradient(ex - er * 0.4, ey - er * 0.4, er * 0.1, ex, ey, er);
  eg.addColorStop(0, '#6fb0ff'); eg.addColorStop(0.7, '#1f5fb8'); eg.addColorStop(1, '#0b2a5e');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(ex - er * 0.2, ey - er * 0.3, er * 0.5, er * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(ex + er * 0.35, ey + er * 0.1, er, 0, Math.PI * 2); ctx.globalCompositeOperation = 'source-atop'; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(127,227,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ey, er + 1.5, Math.PI * 0.6, Math.PI * 1.45); ctx.stroke();

  if (!terrain.length) makeTerrain();
  const sh = shake > 0 ? shake * 6 : 0;
  ctx.save(); if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

  // terrain
  ctx.beginPath(); ctx.moveTo(X(0), H + 50);
  for (const p of terrain) ctx.lineTo(X(p.x), Y(p.y));
  ctx.lineTo(X(WORLD_W), H + 50); ctx.closePath();
  const tg = ctx.createLinearGradient(0, Y(140), 0, H); tg.addColorStop(0, '#8d919b'); tg.addColorStop(0.35, '#555962'); tg.addColorStop(1, '#23252b');
  ctx.fillStyle = tg; ctx.fill();
  ctx.save(); ctx.clip();
  for (const c of craters) { const gy = groundAt(c.x) - c.dy; ctx.fillStyle = 'rgba(20,20,26,0.35)'; ctx.beginPath(); ctx.ellipse(X(c.x), Y(gy), c.r * view.s, c.r * 0.4 * view.s, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(X(c.x), Y(gy) + 1, c.r * view.s, c.r * 0.4 * view.s, 0, 0.1, Math.PI - 0.1); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#d7dbe4'; ctx.lineWidth = 1.5; ctx.beginPath();
  terrain.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke();

  // pads
  for (const p of pads) {
    ctx.strokeStyle = '#eef3ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(p.x1), Y(p.y)); ctx.lineTo(X(p.x2), Y(p.y)); ctx.stroke();
    const blink = Math.sin(t * 0.006) > 0;
    for (const x of [p.x1, p.x2]) { ctx.fillStyle = blink ? (p.m === 5 ? '#fc3d21' : '#5dff9b') : 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(X(x), Y(p.y) - 3, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = `600 ${Math.max(11, 4.2 * view.s)}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillStyle = p.m === 5 ? '#fc3d21' : p.m === 2 ? '#ffb547' : '#7fe3ff';
    ctx.fillText(`×${p.m}`, X((p.x1 + p.x2) / 2), Y(p.y) + 16 + view.s * 2);
  }

  // arrows for pads that are off screen
  if (state === 'flying') {
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    for (const p of pads) {
      const px = X((p.x1 + p.x2) / 2);
      if (px >= 0 && px <= W) continue;
      const left = px < 0; const yy = clamp(Y(p.y), 90, H - 110);
      ctx.fillStyle = p.m === 5 ? '#fc3d21' : p.m === 2 ? '#ffb547' : '#7fe3ff';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillText(left ? `◀ ×${p.m}` : `×${p.m} ▶`, left ? 8 : W - 8, yy);
    }
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const q of parts) { const k = q.life / q.max; ctx.globalAlpha = k; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), q.size * Math.max(1, view.s * 0.5) * (0.6 + k * 0.4), 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

  // ship
  if (state !== 'crashed' && state !== 'title') drawShip(t);
  ctx.restore();

  if (state === 'title') drawAttract(t);
}

function drawShip(t) {
  const s = view.s;
  ctx.save(); ctx.translate(X(ship.x), Y(ship.y)); ctx.rotate(tilt); ctx.scale(s, s);
  // flame
  if (ship.thrusting) {
    const L = 5 + Math.random() * 2.5;
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(0, 2.5, 0, 2.5 + L); fg.addColorStop(0, 'rgba(255,255,255,0.95)'); fg.addColorStop(0.3, 'rgba(255,181,71,0.9)'); fg.addColorStop(1, 'rgba(252,61,33,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-1.1, 2.4); ctx.lineTo(0, 2.4 + L); ctx.lineTo(1.1, 2.4); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.lineWidth = 0.35; ctx.lineJoin = 'round';
  // legs
  ctx.strokeStyle = '#cfd5df';
  ctx.beginPath(); ctx.moveTo(-2.4, 0.8); ctx.lineTo(-LEG_SPAN, LEG_DROP); ctx.moveTo(2.4, 0.8); ctx.lineTo(LEG_SPAN, LEG_DROP);
  ctx.moveTo(-1.6, 1.6); ctx.lineTo(-LEG_SPAN + 0.6, LEG_DROP - 0.8); ctx.moveTo(1.6, 1.6); ctx.lineTo(LEG_SPAN - 0.6, LEG_DROP - 0.8); ctx.stroke();
  ctx.fillStyle = '#cfd5df'; ctx.fillRect(-LEG_SPAN - 0.8, LEG_DROP - 0.2, 1.6, 0.4); ctx.fillRect(LEG_SPAN - 0.8, LEG_DROP - 0.2, 1.6, 0.4);
  // descent stage (gold foil)
  const gg = ctx.createLinearGradient(-2.6, 0, 2.6, 0); gg.addColorStop(0, '#8a6a22'); gg.addColorStop(0.45, '#e9c46a'); gg.addColorStop(1, '#9c7a2c');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(-2.7, -0.4); ctx.lineTo(2.7, -0.4); ctx.lineTo(2.3, 1.9); ctx.lineTo(-2.3, 1.9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(-0.9, -0.4); ctx.lineTo(-0.8, 1.9); ctx.moveTo(0.9, -0.4); ctx.lineTo(0.8, 1.9); ctx.stroke();
  // engine bell
  ctx.fillStyle = '#5a5e68'; ctx.beginPath(); ctx.moveTo(-0.7, 1.9); ctx.lineTo(0.7, 1.9); ctx.lineTo(1.1, 2.6); ctx.lineTo(-1.1, 2.6); ctx.closePath(); ctx.fill();
  // ascent stage
  ctx.fillStyle = '#e6e9ef'; ctx.beginPath(); ctx.moveTo(-2.1, -0.4); ctx.lineTo(-2.3, -2.2); ctx.lineTo(-1.2, -3.6); ctx.lineTo(1.3, -3.6); ctx.lineTo(2.2, -2.4); ctx.lineTo(2.0, -0.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0b1c38'; ctx.beginPath(); ctx.moveTo(-1.3, -2.1); ctx.lineTo(-0.9, -3.0); ctx.lineTo(0.1, -3.0); ctx.lineTo(0.1, -2.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fc3d21'; ctx.fillRect(1.0, -1.4, 0.8, 0.5);
  ctx.strokeStyle = '#cfd5df'; ctx.beginPath(); ctx.moveTo(1.2, -3.6); ctx.lineTo(1.9, -4.8); ctx.stroke();
  ctx.beginPath(); ctx.arc(1.9, -4.8, 0.35, 0, Math.PI * 2); ctx.stroke();
  // RCS blink
  if (Math.sin(t * 0.01) > 0.6) { ctx.fillStyle = '#5dff9b'; ctx.beginPath(); ctx.arc(-2.2, -1.2, 0.25, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// attract mode: lander hovering above the surface behind the title card
function drawAttract(t) {
  const s = view.s; const x = WORLD_W * 0.5 + Math.sin(t * 0.0004) * 60, y = 200 + Math.sin(t * 0.0011) * 10;
  ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(Math.sin(t * 0.0007) * 0.15); ctx.scale(s, s);
  ctx.globalAlpha = 0.55; ctx.fillStyle = '#e6e9ef'; ctx.beginPath(); ctx.arc(0, -1.5, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e9c46a'; ctx.fillRect(-2.6, -0.4, 5.2, 2.2); ctx.globalAlpha = 1;
  ctx.restore();
}

function updateHud() {
  const alt = Math.max(0, ship.y - LEG_DROP - groundAt(ship.x));
  $('h-alt').textContent = alt.toFixed(0);
  const vx = $('h-vx'), vy = $('h-vy');
  vx.textContent = (ship.vx >= 0 ? '→ ' : '← ') + Math.abs(ship.vx).toFixed(1);
  vy.textContent = (ship.vy >= 0 ? '↑ ' : '↓ ') + Math.abs(ship.vy).toFixed(1);
  vx.className = Math.abs(ship.vx) <= SAFE_VX ? 'ok' : Math.abs(ship.vx) <= SAFE_VX * 2 ? 'warn' : 'bad';
  vy.className = Math.abs(ship.vy) <= SAFE_VY ? 'ok' : Math.abs(ship.vy) <= SAFE_VY * 2 ? 'warn' : 'bad';
  $('h-fuel').style.width = `${(ship.fuel / FUEL_MAX) * 100}%`;
  $('h-best').textContent = best;
}

/* ───────── loop ───────── */
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!document.hidden) {
    const sub = 3; for (let i = 0; i < sub; i++) step(dt / sub);
    for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy -= GRAVITY * dt * 0.5; if (q.life <= 0) parts.splice(i, 1); }
    if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
    computeView(dt); draw(now);
    if (state === 'flying') updateHud();
  }
  requestAnimationFrame(loop);
}

if (location.search.includes('debug')) window.__lander = { ship, get pads() { return pads; }, setTilt(v) { tilt = v; } };

(async function init() {
  makeTerrain();
  renderBoard($('board-title'));
  $('h-best').textContent = best;
  requestAnimationFrame(loop);
  if (LB_ON) { await loadBoard(); renderBoard($('board-title')); }
  // Tell the parent page (Mission Control) we're ready — used for the arcade screen
  try { parent.postMessage({ type: 'lander-ready' }, location.origin); } catch { /* ignore */ }
})();
