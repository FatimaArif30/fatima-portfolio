// Everything drawn on the room's screens. Each screen is a canvas texture that
// redraws a few times per second.
import { ctex, drawMapLayer, TAU, clamp } from './tex.js';
import { iss } from './live.js';

export const PAL = {
  bg: '#040c1a', bigBg: '#020814', bar: '#0b1c38', rule: '#fc3d21', text: '#eef3ff', dim: '#8ea3cc', faint: '#6f84ad',
  grid: 'rgba(80,140,220,0.18)', land: 'rgba(70,170,255,0.6)', ice: 'rgba(200,225,255,0.55)',
  a1: '#7fe3ff', a2: '#ffb547', a3: '#ff5d73', ok: '#5dff9b', a5: '#e79ab2', barA: '#3d7bff', barB: '#7fe3ff', mark: '#fc3d21',
};
const P = PAL;
const INC = 51.64 * Math.PI / 180;
const pad2 = (n) => String(n).padStart(2, '0');
const F = (weight, size, fam) => `${weight} ${size}px ${fam === 'd' ? '"Chakra Petch", "Segoe UI", sans-serif' : '"IBM Plex Mono", Consolas, monospace'}`;

function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '', yy = y;
  for (const w of words) { const test = line ? `${line} ${w}` : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = test; }
  if (line) g.fillText(line, x, yy);
  return yy + lh;
}

export function makeScreens(C, { big = [1600, 672], side = [900, 640], mon = [512, 320] } = {}) {
  const state = { mode: 'normal', launchT: 0, apodTitle: '', landMask: null, mapLayer: null, alert: 0 };
  const [BW, BH] = big;
  const mapX = Math.round(BW * 0.0165), mapY = Math.round(BH * 0.12), mapW = Math.round(BW * 0.64), mapH = Math.round(mapW / 2);

  function rebuildMap() {
    if (state.landMask) {
      const c = document.createElement('canvas'); c.width = mapW; c.height = mapH; const g = c.getContext('2d');
      g.fillStyle = P.bigBg; g.fillRect(0, 0, mapW, mapH);
      g.strokeStyle = P.grid; g.lineWidth = 1;
      for (let i = 0; i <= 12; i++) { g.beginPath(); g.moveTo(i * mapW / 12, 0); g.lineTo(i * mapW / 12, mapH); g.stroke(); }
      for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(0, i * mapH / 6); g.lineTo(mapW, i * mapH / 6); g.stroke(); }
      // dotted continents sampled from the real land mask
      const src = state.landMask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, state.landMask.width, state.landMask.height).data;
      const mw = state.landMask.width, mh = state.landMask.height; const step = Math.max(6, Math.round(mapW / 160));
      for (let y = step / 2; y < mapH; y += step) for (let x = step / 2; x < mapW; x += step) {
        const sx = Math.floor((x / mapW) * mw), sy = Math.floor((y / mapH) * mh);
        if (src[(sy * mw + sx) * 4 + 3] > 128) { const lat = 90 - (y / mapH) * 180; g.fillStyle = Math.abs(lat) > 66 ? P.ice : P.land; g.beginPath(); g.arc(x, y, step * 0.26, 0, TAU); g.fill(); }
      }
      state.mapLayer = c;
    } else {
      state.mapLayer = drawMapLayer(mapW, mapH, { bg: P.bigBg, grid: P.grid, land: P.land, ice: P.ice });
    }
  }
  rebuildMap();

  const toXY = (lat, lon) => [mapX + ((lon + 180) / 360) * mapW, mapY + ((90 - lat) / 180) * mapH];

  // current (or simulated) ISS state
  function issNow(time) {
    if (iss.ok) return { lat: iss.lat, lon: iss.lon, alt: iss.alt, vel: iss.vel, asc: iss.ascending, live: true };
    const u = (time * 0.05) % TAU;
    const lat = Math.asin(Math.sin(INC) * Math.sin(u)) * 180 / Math.PI;
    let lon = Math.atan2(Math.cos(INC) * Math.sin(u), Math.cos(u)) * 180 / Math.PI - time * 0.4;
    lon = ((lon + 540) % 360 + 360) % 360 - 180;
    return { lat, lon, alt: 408 + 3 * Math.sin(time * 0.5), vel: 27580, asc: Math.cos(u) > 0, live: false };
  }

  function drawTrack(g, s) {
    const sinLat = clamp(Math.sin(s.lat * Math.PI / 180) / Math.sin(INC), -1, 1);
    let u0 = Math.asin(sinLat); if (!s.asc) u0 = Math.PI - u0;
    const node = s.lon - Math.atan2(Math.cos(INC) * Math.sin(u0), Math.cos(u0)) * 180 / Math.PI;
    const seg = (from, to, style, width) => {
      g.strokeStyle = style; g.lineWidth = width; g.beginPath(); let px = null;
      for (let k = 0; k <= 240; k++) {
        const du = from + (to - from) * (k / 240); const u = u0 + du;
        const lat = Math.asin(Math.sin(INC) * Math.sin(u)) * 180 / Math.PI;
        let lon = node + Math.atan2(Math.cos(INC) * Math.sin(u), Math.cos(u)) * 180 / Math.PI - (du / TAU) * 23.2;
        lon = ((lon + 540) % 360 + 360) % 360 - 180;
        const [x, y] = toXY(lat, lon);
        if (px === null || Math.abs(x - px) > mapW / 2) g.moveTo(x, y); else g.lineTo(x, y);
        px = x;
      }
      g.stroke();
    };
    seg(-TAU * 0.75, 0, 'rgba(255,181,71,0.3)', 2);
    seg(0, TAU * 1.25, 'rgba(255,181,71,0.95)', 3);
  }

  function drawRocket(g, x, y, sc, t) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    // flame
    const fl = 60 + Math.sin(t * 40) * 8 + Math.random() * 10;
    const fg = g.createLinearGradient(0, 40, 0, 40 + fl); fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.3, '#ffb547'); fg.addColorStop(1, 'rgba(252,61,33,0)');
    g.fillStyle = fg; g.beginPath(); g.moveTo(-12, 40); g.lineTo(0, 40 + fl); g.lineTo(12, 40); g.fill();
    // body
    g.fillStyle = '#eef3ff'; g.beginPath(); g.moveTo(0, -70); g.bezierCurveTo(16, -50, 16, -20, 15, 40); g.lineTo(-15, 40); g.bezierCurveTo(-16, -20, -16, -50, 0, -70); g.fill();
    g.fillStyle = '#fc3d21'; g.beginPath(); g.moveTo(-15, 12); g.lineTo(-30, 44); g.lineTo(-15, 36); g.fill(); g.beginPath(); g.moveTo(15, 12); g.lineTo(30, 44); g.lineTo(15, 36); g.fill();
    g.fillStyle = '#0b1c38'; g.beginPath(); g.arc(0, -28, 7, 0, TAU); g.fill();
    g.fillStyle = '#16181d'; g.fillRect(-15, 0, 30, 6);
    g.restore();
  }

  function drawLaunch(g, w, h, time) {
    const T = state.launchT;
    g.fillStyle = '#020610'; g.fillRect(0, 0, w, h);
    if (T < 5) {
      if (state.mapLayer) { g.globalAlpha = 0.25; g.drawImage(state.mapLayer, mapX, mapY); g.globalAlpha = 1; }
      const n = Math.max(1, 5 - Math.floor(T));
      g.strokeStyle = '#ff3b1f'; g.lineWidth = 8; g.strokeRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffd2c8'; g.font = F(600, Math.round(h * 0.06), 'm'); g.fillText('OPENING COMMS CHANNEL · ALL STATIONS GO', w / 2, h * 0.3);
      g.fillStyle = '#ff3b1f'; g.font = F(700, Math.round(h * 0.3), 'd'); g.fillText(`T-${pad2(n)}`, w / 2, h * 0.56);
      g.textAlign = 'left';
    } else {
      const k = T - 5; // seconds since liftoff
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#02040c'); sky.addColorStop(1, k < 2 ? '#3a1a10' : '#07102a');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { const sx = (i * 197) % w, sy = ((i * 131) % h) + (k * 60) % h; g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(sx, sy % h, 2, 2); }
      const ground = h * 0.86 + k * k * 30;
      g.fillStyle = '#1a1c22'; g.fillRect(0, ground, w, h);
      const ry = h * 0.62 - Math.max(0, k * k * 26);
      const shake = k < 2.5 ? (Math.random() - 0.5) * 8 : 0;
      // smoke
      for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI; const r = 40 + k * 90 + (i % 5) * 18; g.fillStyle = `rgba(200,200,210,${0.18 * Math.max(0, 1 - k / 4)})`; g.beginPath(); g.arc(w / 2 + Math.cos(a) * r * 1.6, ground - Math.sin(a) * r * 0.25, 40 + k * 20, 0, TAU); g.fill(); }
      drawRocket(g, w / 2 + shake, ry, h / 420, time);
      g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = F(700, Math.round(h * 0.09), 'd');
      g.fillText(k < 2 ? 'LIFTOFF' : 'COMMS OPEN', w / 2, h * 0.16); g.textAlign = 'left';
      g.fillStyle = '#ffb547'; g.font = F(500, Math.round(h * 0.035), 'm');
      g.fillText(`ALT ${(k * k * 0.12).toFixed(2)} KM   VEL ${(k * 180).toFixed(0)} KM/H   FA-01`, w * 0.03, h * 0.95);
    }
  }

  const bigTex = ctex(BW, BH, (g, w, h, time) => {
    if (state.mode === 'launch') { drawLaunch(g, w, h, time); return; }
    const s = issNow(time);
    g.fillStyle = P.bigBg; g.fillRect(0, 0, w, h);
    const bar = Math.round(h * 0.085);
    g.fillStyle = P.bar; g.fillRect(0, 0, w, bar); g.fillStyle = P.rule; g.fillRect(0, bar - 4, w, 4);
    g.textBaseline = 'middle'; g.fillStyle = P.text; g.font = F(600, Math.round(bar * 0.5), 'd');
    g.fillText(`${C.callsign}  ·  MISSION: ${C.role.toUpperCase()}`, mapX, bar / 2);
    g.textAlign = 'right'; g.fillStyle = P.a2; g.font = F(500, Math.round(bar * 0.36), 'm');
    g.fillText(`GROUND STATION: ${C.groundStation.name}  ${C.groundStation.lat.toFixed(2)}°N ${C.groundStation.lon.toFixed(2)}°E`, w - mapX, bar / 2); g.textAlign = 'left';
    if (state.mapLayer) g.drawImage(state.mapLayer, mapX, mapY);
    drawTrack(g, s);
    const [sx, sy] = toXY(s.lat, s.lon);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(sx, sy, 26 + 4 * Math.sin(time * 4), 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 8, 0, TAU); g.fill();
    g.font = F(600, 18, 'm'); g.fillText(s.live ? 'ISS · LIVE' : 'ISS · SIM', sx + 16, sy - 16);
    const [kx, ky] = toXY(C.groundStation.lat, C.groundStation.lon);
    g.strokeStyle = P.mark; g.lineWidth = 3; g.beginPath(); g.arc(kx, ky, 11 + 4 * Math.sin(time * 3), 0, TAU); g.stroke();
    g.fillStyle = P.mark; g.beginPath(); g.arc(kx, ky, 4.5, 0, TAU); g.fill(); g.font = F(600, 17, 'm'); g.fillText('KHI', kx + 15, ky + 18);
    // crew panel
    const px = mapX + mapW + Math.round(w * 0.018), pw = w - px - mapX, py = mapY;
    g.strokeStyle = 'rgba(120,160,230,0.35)'; g.lineWidth = 2; g.strokeRect(px, py, pw, mapH);
    g.fillStyle = P.text; g.font = F(600, Math.round(h * 0.04), 'd'); g.fillText('CREW FILE', px + 20, py + 32);
    const rows = [['NAME', C.name.toUpperCase()], ['ROLE', C.role.toUpperCase()], ['BASE', 'KIET · KARACHI'], ['FOCUS', 'MULTI-AGENT / LLM / ML'], ['STATUS', state.mode === 'alert' ? 'LAUNCH IN PROGRESS' : 'GO FOR LAUNCH']];
    const rh = (mapH - 70) / rows.length;
    rows.forEach(([k, v], i) => {
      const y = py + 70 + i * rh;
      g.fillStyle = P.faint; g.font = F(500, Math.round(h * 0.026), 'm'); g.fillText(k, px + 20, y);
      g.fillStyle = i === 4 ? P.ok : P.text; g.font = F(600, Math.round(h * 0.03), 'm');
      let val = v; while (g.measureText(val).width > pw - 40 && val.length > 4) val = val.slice(0, -2) + '…';
      g.fillText(val, px + 20, y + Math.round(h * 0.038));
    });
    // bottom strip
    const sb = Math.round(h * 0.075);
    g.fillStyle = P.bar; g.fillRect(0, h - sb, w, sb);
    g.font = F(500, Math.round(sb * 0.38), 'm'); g.fillStyle = P.a1;
    const tele = `ISS ${s.live ? 'LIVE' : 'SIM'}  ALT ${s.alt.toFixed(1)} KM   VEL ${Math.round(s.vel).toLocaleString('en-US')} KM/H   LAT ${s.lat.toFixed(2)}   LON ${s.lon.toFixed(2)}`;
    g.fillText(tele, mapX, h - sb / 2);
    if (state.apodTitle) {
      const msg = `NASA PICTURE OF THE DAY: ${state.apodTitle.toUpperCase()}   ·   `;
      g.save(); const clipX = mapX + g.measureText(tele).width + 40; g.beginPath(); g.rect(clipX, h - sb, w - clipX, sb); g.clip();
      g.fillStyle = P.a2; const mw = g.measureText(msg).width; const off = (time * 60) % mw;
      for (let x = clipX - off; x < w; x += mw) g.fillText(msg, x, h - sb / 2);
      g.restore();
    }
  });

  const header = (g, w, title, accent) => {
    g.fillStyle = P.bar; g.fillRect(0, 0, w, 64); g.fillStyle = accent; g.fillRect(0, 60, w, 4);
    g.font = F(600, 34, 'd'); g.fillStyle = P.text; g.textBaseline = 'middle'; g.fillText(title, 26, 32);
  };

  const projTex = ctex(side[0], side[1], (g, w, h, time) => {
    g.fillStyle = P.bg; g.fillRect(0, 0, w, h); header(g, w, 'PAYLOADS  /  PROJECTS', P.rule);
    const items = C.projects.slice(0, 4);
    const rh = (h - 90) / items.length;
    items.forEach((p, i) => {
      const y = 80 + i * rh;
      g.strokeStyle = 'rgba(120,160,230,0.3)'; g.lineWidth = 2; g.strokeRect(22, y, w - 44, rh - 14);
      g.font = F(600, 34, 'd'); g.fillStyle = P.text; g.fillText(p.name.toUpperCase(), 44, y + (rh - 14) * 0.36);
      g.font = F(400, 21, 'm'); g.fillStyle = P.dim; g.fillText(p.kind, 44, y + (rh - 14) * 0.72);
      const live = p.status === 'LIVE'; const blink = !live && Math.sin(time * 4) > 0;
      g.fillStyle = live ? P.ok : blink ? P.a2 : '#8a6420'; g.font = F(600, 24, 'm'); g.textAlign = 'right';
      g.fillText(live ? '● LIVE' : '▶ PLAY', w - 44, y + (rh - 14) * 0.5); g.textAlign = 'left';
    });
  });

  const skillTex = ctex(side[0], side[1], (g, w, h, time) => {
    g.fillStyle = P.bg; g.fillRect(0, 0, w, h); header(g, w, 'SYSTEMS  /  SKILLS', P.barB);
    const groups = C.skills; const rh = (h - 90) / groups.length;
    groups.forEach((gr, i) => {
      const y = 86 + i * rh;
      const lvl = 0.72 + 0.2 * ((i * 37) % 10) / 10 + 0.03 * Math.sin(time * 2 + i);
      g.font = F(600, 24, 'm'); g.fillStyle = P.a1; g.fillText(gr.group.toUpperCase(), 26, y + 14);
      g.fillStyle = P.bar; g.fillRect(w * 0.45, y + 4, w * 0.5, 16);
      const grd = g.createLinearGradient(w * 0.45, 0, w * 0.95, 0); grd.addColorStop(0, P.barA); grd.addColorStop(1, P.barB);
      g.fillStyle = grd; g.fillRect(w * 0.45, y + 4, w * 0.5 * clamp(lvl, 0, 1), 16);
      g.font = F(400, 20, 'm'); g.fillStyle = P.dim;
      wrapText(g, gr.items.join('  ·  '), 26, y + 50, w - 52, 26);
    });
  });

  const clockTex = ctex(2048, 110, (g, w, h) => {
    g.fillStyle = '#0a0304'; g.fillRect(0, 0, w, h);
    const now = new Date();
    const utc = `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`;
    const pk = new Date(now.getTime() + 5 * 3600e3);
    const pkt = `${pad2(pk.getUTCHours())}:${pad2(pk.getUTCMinutes())}:${pad2(pk.getUTCSeconds())}`;
    const met = Math.floor(performance.now() / 1000);
    const metS = `000:${pad2(Math.floor(met / 3600))}:${pad2(Math.floor(met / 60) % 60)}:${pad2(met % 60)}`;
    g.textBaseline = 'middle';
    [['MET', metS], ['GMT', utc], ['PKT', pkt]].forEach(([k, v], i) => {
      const x = 60 + i * 680;
      g.fillStyle = '#ff9a7a'; g.font = F(500, 30, 'm'); g.fillText(k, x, h / 2);
      g.fillStyle = '#ff3b1f'; g.font = F(600, 62, 'm'); g.fillText(v, x + 80, h / 2 + 2);
    });
  });

  const [MW, MH] = mon;
  const Pm = (g, w, h, title, accent) => {
    g.fillStyle = P.bg; g.fillRect(0, 0, w, h); g.fillStyle = P.bar; g.fillRect(0, 0, w, 40);
    g.font = F(600, 20, 'm'); g.fillStyle = accent; g.textBaseline = 'middle'; g.fillText(title, 14, 21);
  };
  const logLines = ['agent.planner  ··· GO', 'llm.eval suite ··· 98.2%', 'claims.extract ··· OK', 'tavily.search  ··· OK', 'supabase.rls   ··· OK', 'vercel.deploy  ··· LIVE', 'tool.router    ··· GO', 'trust.score    ··· 78', 'queue.workers  ··· 12/12', 'guardrails     ··· ARMED'];
  const pool = [
    ctex(MW, MH, (g, w, h, t) => { Pm(g, w, h, 'TELEMETRY  CH-03', P.a1);
      g.strokeStyle = P.grid; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * 64, 44); g.lineTo(i * 64, h); g.stroke(); }
      [[P.a1, 1.0, 0], [P.a2, 1.7, 2], [P.a3, 0.6, 4]].forEach(([c, f, o]) => { g.strokeStyle = c; g.lineWidth = 3; g.beginPath();
        for (let x = 0; x <= w; x += 8) { const y = 180 + Math.sin(x * 0.02 * f + t * 2 + o) * 50 + Math.sin(x * 0.07 + t * 3 + o) * 14; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }); }),
    ctex(MW, MH, (g, w, h, t) => { Pm(g, w, h, 'AGENT LOG', P.ok);
      g.font = F(400, 19, 'm'); const off = Math.floor(t * 1.5);
      for (let i = 0; i < 10; i++) { g.globalAlpha = i === 9 ? 1 : 0.75; g.fillStyle = P.ok; g.fillText('> ' + logLines[(i + off) % logLines.length], 14, 64 + i * 26); } g.globalAlpha = 1; }),
    ctex(MW, MH, (g, w, h, t) => { Pm(g, w, h, 'TRACKING  RADAR', P.a2);
      const cx = w / 2, cy = 184, R = 120; g.strokeStyle = P.grid; g.lineWidth = 2;
      for (let r = 30; r <= R; r += 30) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
      const a = t * 1.6; for (let k = 1; k < 12; k++) { g.globalAlpha = 0.3 * (1 - k / 12); g.fillStyle = P.a2; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a - k * 0.06, a - (k - 1) * 0.06); g.closePath(); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = P.text; [[0.8, 60], [2.4, 95], [4.1, 40]].forEach(([b, r]) => { g.beginPath(); g.arc(cx + Math.cos(b) * r, cy + Math.sin(b) * r, 5, 0, TAU); g.fill(); }); }),
    ctex(MW, MH, (g, w, h, t) => { Pm(g, w, h, 'FLIGHT  POLL', P.text);
      const pos = ['FLIGHT', 'FIDO', 'GUIDO', 'EECOM', 'INCO', 'CAPCOM', 'SURGEON', 'BOOSTER'];
      g.font = F(600, 20, 'm');
      pos.forEach((p, i) => { const x = 16 + (i % 2) * 248, y = 70 + Math.floor(i / 2) * 60; g.strokeStyle = P.grid; g.strokeRect(x, y - 20, 232, 44);
        g.fillStyle = P.dim; g.fillText(p, x + 12, y + 2); const go = (Math.floor(t * 0.8) + i) % 9 !== 0; g.fillStyle = go ? P.ok : P.a2; g.textAlign = 'right'; g.fillText(go ? 'GO' : 'HOLD', x + 220, y + 2); g.textAlign = 'left'; }); }),
    ctex(MW, MH, (g, w, h, t) => { Pm(g, w, h, 'TRAJECTORY', P.a5);
      g.strokeStyle = P.a5; g.globalAlpha = 0.4; g.lineWidth = 2; g.beginPath(); g.ellipse(w / 2, 190, 190, 80, -0.2, 0, TAU); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = P.barA; g.beginPath(); g.arc(w / 2, 190, 34, 0, TAU); g.fill();
      const a = t * 0.9; const x = w / 2 + Math.cos(a) * 190 * Math.cos(-0.2) - Math.sin(a) * 80 * Math.sin(-0.2); const y = 190 + Math.cos(a) * 190 * Math.sin(-0.2) + Math.sin(a) * 80 * Math.cos(-0.2);
      g.fillStyle = P.text; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }),
    ctex(MW, MH, (g, w, h, t) => { Pm(g, w, h, 'POWER  BUS', P.a1);
      for (let i = 0; i < 14; i++) { const v = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.9)) * (0.6 + 0.4 * Math.sin(i * 1.7));
        const bh = v * 230; const grd = g.createLinearGradient(0, h - bh, 0, h); grd.addColorStop(0, P.barB); grd.addColorStop(1, P.barA); g.fillStyle = grd; g.fillRect(16 + i * 35, h - 16 - bh, 26, bh); } }),
  ];

  // Flight-log console (Experience): two special monitors
  const logTex = ctex(MW, MH, (g, w, h) => {
    Pm(g, w, h, 'FLIGHT LOG', P.a2);
    let y = 70;
    for (const e of C.experience) {
      g.font = F(600, 19, 'm'); g.fillStyle = P.a2; g.fillText(e.dates.toUpperCase(), 14, y); y += 26;
      g.font = F(600, 22, 'd'); g.fillStyle = P.text; y = wrapText(g, e.role, 14, y, w - 28, 24);
      g.font = F(400, 18, 'm'); g.fillStyle = P.dim; g.fillText(e.org, 14, y); y += 34;
    }
  });
  const eduTex = ctex(MW, MH, (g, w, h, t) => {
    Pm(g, w, h, 'TRAINING', P.a1);
    let y = 76;
    for (const e of C.education) { g.font = F(600, 22, 'd'); g.fillStyle = P.text; y = wrapText(g, e.school, 14, y, w - 28, 26); g.font = F(400, 18, 'm'); g.fillStyle = P.dim; g.fillText(e.detail, 14, y); y += 40; }
    g.font = F(500, 17, 'm'); g.fillStyle = Math.sin(t * 3) > 0 ? P.ok : 'rgba(93,255,155,0.4)'; g.fillText('▶ CLICK TO OPEN FULL LOG', 14, h - 22);
  });

  // Simulator cabinet attract screen
  const simTex = ctex(512, 400, (g, w, h, t) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#02030a'); sky.addColorStop(0.6, '#1a1840'); sky.addColorStop(1, '#6b3a6e');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect((i * 97) % w, (i * 53) % (h * 0.5), 2, 2); }
    // a rocket being stacked: stages grow over a 9 second loop
    const n = Math.floor((t % 9) / 0.75) + 1, bh = 17, base = h - 22;
    g.fillStyle = '#23262e'; g.fillRect(w / 2 - 70, base, 140, 8);
    for (let i = 0; i < n; i++) {
      const sw = 92 - i * 4 + ((i * 37) % 7) - 3, x = w / 2 - sw / 2 + ((i * 53) % 9) - 4, y = base - (i + 1) * bh;
      const gr = g.createLinearGradient(x, 0, x + sw, 0); gr.addColorStop(0, '#9aa1ae'); gr.addColorStop(0.35, '#fff'); gr.addColorStop(1, '#8a909c');
      g.fillStyle = gr; g.fillRect(x, y, sw, bh - 1);
      g.fillStyle = `hsl(${(205 + i * 11) % 360},95%,60%)`; g.fillRect(x, y + bh * 0.62, sw, bh * 0.22);
    }
    // the next stage sliding across
    const sx = w / 2 + Math.sin(t * 2.6) * 150, sw2 = 92 - n * 4, sy = base - (n + 1) * bh;
    if (n < 12) { g.fillStyle = '#eef0f5'; g.fillRect(sx - sw2 / 2, sy, sw2, bh - 1); g.fillStyle = `hsl(${(205 + n * 11) % 360},95%,60%)`; g.fillRect(sx - sw2 / 2, sy + bh * 0.62, sw2, bh * 0.22); }
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = F(700, 40, 'd'); g.fillText('STACK TO THE STARS', w / 2, 54);
    g.font = F(600, 20, 'm'); g.fillStyle = Math.sin(t * 4) > 0 ? '#ffb547' : 'rgba(255,181,71,0.25)'; g.fillText('CLICK TO PLAY', w / 2, 90);
    if (state.topScore) { g.fillStyle = P.a1; g.font = F(500, 18, 'm'); g.fillText(`TOP BUILDER ${state.topScore}`, w / 2, 118); }
    g.textAlign = 'left';
  });
  const marqueeTex = ctex(512, 96, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#fc3d21'); grd.addColorStop(1, '#ff7a3a');
    g.fillStyle = '#0b1c38'; g.fillRect(0, 0, w, h); g.fillStyle = grd; g.fillRect(0, h - 10, w, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = F(700, 44, 'd'); g.fillText('FLIGHT SIMULATOR', w / 2, h / 2 - 4);
  });

  const all = [bigTex, projTex, skillTex, ...pool, simTex];
  return {
    state, bigTex, projTex, skillTex, clockTex, pool, logTex, eduTex, simTex, marqueeTex,
    setLandMask(mask) { state.landMask = mask; rebuildMap(); },
    update(t, full = true) {
      bigTex.userData.redraw(t);
      simTex.userData.redraw(t);
      if (full) { projTex.userData.redraw(t); skillTex.userData.redraw(t); pool.forEach((p) => p.userData.redraw(t)); eduTex.userData.redraw(t); }
    },
    tickClock(t) { clockTex.userData.redraw(t); },
    all,
  };
}
