// Picks a graphics level for this device so every phone can open the room.
// high: full effects · mid: fewer shadows · low: no shadows, no glow, lighter screens
export function detectQuality() {
  const q = { tier: 'high', webgl: true, reasons: [] };
  let gl = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2') || c.getContext('webgl');
  } catch { gl = null; }
  if (!gl) { q.webgl = false; q.tier = 'none'; return q; }

  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 500;
  const saveData = navigator.connection && navigator.connection.saveData;
  let gpu = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); } catch { /* ignore */ }
  const weakGpu = /swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [34]\d\d|powervr sgx|intel\(r\) hd graphics [2-5]/i.test(gpu);

  let score = 0;
  if (mem <= 2) score += 2; else if (mem <= 4) score += 1;
  if (cores <= 4) score += 1;
  if (coarse && small) score += 1;
  if (weakGpu) score += 2;
  if (saveData) score += 2;
  q.tier = score >= 3 ? 'low' : score >= 1 ? 'mid' : 'high';
  q.gpu = gpu;
  try { const forced = new URLSearchParams(location.search).get('q'); if (['low', 'mid', 'high'].includes(forced)) q.tier = forced; } catch { /* ignore */ }
  return q;
}

export const SETTINGS = {
  high: { dpr: 1.75, shadows: 3, shadowMap: 1024, bloom: true, bloomScale: 0.5, rows: 3, screenHz: 8, antialias: true },
  mid:  { dpr: 1.35, shadows: 1, shadowMap: 1024, bloom: true, bloomScale: 0.4, rows: 3, screenHz: 6, antialias: true },
  low:  { dpr: 1.0,  shadows: 0, shadowMap: 512,  bloom: false, bloomScale: 0.3, rows: 2, screenHz: 3, antialias: false },
};

// Watches the frame rate; if the device struggles for a few seconds, steps quality down.
export function fpsGuard(onDrop) {
  let frames = 0, acc = 0, slow = 0, cooldown = 4;
  return (dt) => {
    frames++; acc += dt; cooldown -= dt;
    if (acc >= 1) {
      const fps = frames / acc; frames = 0; acc = 0;
      if (cooldown > 0) return;
      if (fps < 32) slow++; else slow = Math.max(0, slow - 1);
      if (slow >= 3) { slow = 0; cooldown = 5; onDrop(fps); }
    }
  };
}
