// Small helpers: seeded random, value noise, canvas textures, glow sprite.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  return lerp(lerp(lerp(a, b, u), lerp(c, d, u), v), lerp(lerp(e, f, u), lerp(g, h, u), v), w);
}
function fbm3(x, y, z, oct) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x * f, y * f, z * f); n += a; f *= 2.03; a *= 0.5; }
  return s / n;
}
// "Continents" used for the map on the big screen and the hologram globe.
export const landValue = (x, y, z) => fbm3(x * 1.7 + 11.3, y * 1.7 + 3.1, z * 1.7 + 7.7, 5);
export const LAND = 0.53;

// Canvas texture with a redraw(time) method.
export function ctex(w, h, draw, { wrap = false, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.redraw = (time) => { draw(g, w, h, time); t.needsUpdate = true; };
  t.userData.canvas = c;
  return t;
}

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  _glow = ctex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
  return _glow;
}
export function glowSprite(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}

// World map dots (equirectangular) drawn once and reused by the big screen.
export function drawMapLayer(w, h, colors) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = colors.bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = colors.grid; g.lineWidth = 1;
  for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); }
  for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
  const step = Math.max(6, Math.round(w / 170));
  for (let y = step / 2; y < h; y += step) {
    const lat = (0.5 - y / h) * Math.PI;
    for (let x = step / 2; x < w; x += step) {
      const lon = (x / w) * TAU - Math.PI;
      const v = landValue(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
      if (v > LAND) { g.fillStyle = Math.abs(lat) > 1.2 ? colors.ice : colors.land; g.beginPath(); g.arc(x, y, step * 0.24, 0, TAU); g.fill(); }
    }
  }
  return c;
}
