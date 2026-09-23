// Live space data: real Earth outline, ISS position, NASA Picture of the Day.
// Everything fails softly: if a request fails, the room still works.

const TIMEOUT = 6000;
function withTimeout(p, ms = TIMEOUT) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

/* ───────── Earth land mask (Natural Earth via world-atlas) ───────── */
// Returns an equirectangular canvas where land is white, or null.
export async function loadLand(w = 1024, h = 512) {
  try {
    const r = await withTimeout(fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json'));
    if (!r.ok) throw new Error(r.status);
    const topo = await r.json();
    const [kx, ky] = topo.transform.scale, [dx, dy] = topo.transform.translate;
    const arcs = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([a, b]) => { x += a; y += b; return [x * kx + dx, y * ky + dy]; }); });
    const ring = (ids) => {
      const pts = [];
      ids.forEach((i) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; a.forEach((p, k) => { if (k > 0 || !pts.length) pts.push(p); }); });
      // unwrap longitudes so a ring crossing the date line stays continuous
      for (let k = 1; k < pts.length; k++) { let d = pts[k][0] - pts[k - 1][0]; if (d > 180) pts[k] = [pts[k][0] - 360, pts[k][1]]; else if (d < -180) pts[k] = [pts[k][0] + 360, pts[k][1]]; }
      return pts;
    };
    const polys = [];
    const walk = (g) => {
      if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
      else if (g.type === 'Polygon') polys.push(g.arcs.map(ring));
      else if (g.type === 'MultiPolygon') g.arcs.forEach((p) => polys.push(p.map(ring)));
    };
    walk(topo.objects.land);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    const X = (lon) => ((lon + 180) / 360) * w, Y = (lat) => ((90 - lat) / 180) * h;
    for (const off of [-360, 0, 360]) {
      for (const p of polys) {
        g.beginPath();
        for (const r of p) r.forEach(([lon, lat], k) => (k ? g.lineTo(X(lon + off), Y(lat)) : g.moveTo(X(lon + off), Y(lat))));
        g.fill('evenodd');
      }
    }
    return c;
  } catch { return null; }
}

// Build a function (lat, lon) -> true if land, from the mask canvas.
export function landSampler(mask) {
  const g = mask.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = mask;
  const data = g.getImageData(0, 0, w, h).data;
  return (lat, lon) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * h)));
    return data[(y * w + x) * 4 + 3] > 128;
  };
}

/* ───────── ISS ───────── */
export const iss = { ok: false, lat: 0, lon: 0, alt: 408, vel: 27600, history: [], updated: 0, ascending: true };
export function startISS(onUpdate) {
  let failures = 0;
  const tick = async () => {
    try {
      const r = await withTimeout(fetch('https://api.wheretheiss.at/v1/satellites/25544'), 5000);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (iss.ok) iss.ascending = d.latitude >= iss.lat;
      Object.assign(iss, { ok: true, lat: d.latitude, lon: d.longitude, alt: d.altitude, vel: d.velocity, updated: Date.now() });
      iss.history.push([d.latitude, d.longitude]); if (iss.history.length > 400) iss.history.shift();
      failures = 0;
    } catch { failures++; if (failures > 2) iss.ok = false; }
    onUpdate && onUpdate(iss);
    setTimeout(tick, failures > 3 ? 30000 : 6000);
  };
  tick();
}

/* ───────── NASA Astronomy Picture of the Day ───────── */
export async function loadAPOD() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = JSON.parse(localStorage.getItem('apod') || 'null');
    if (cached && cached.day === today) return cached.data;
  } catch { /* ignore */ }
  try {
    const r = await withTimeout(fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true'));
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const data = { title: d.title, date: d.date, explanation: d.explanation, url: d.media_type === 'image' ? d.url : (d.thumbnail_url || null), page: `https://apod.nasa.gov/apod/ap${(d.date || '').slice(2).replace(/-/g, '')}.html`, copyright: d.copyright ? d.copyright.trim() : 'NASA' };
    try { localStorage.setItem('apod', JSON.stringify({ day: today, data })); } catch { /* ignore */ }
    return data;
  } catch { return null; }
}
