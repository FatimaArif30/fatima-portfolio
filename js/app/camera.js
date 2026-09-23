// Camera rig: gentle look-around with drag / wheel / pinch, and smooth flights between stations.
import * as THREE from 'three';
import { clamp, ease, lerp } from './tex.js';

export function makeRig(camera, dom, { reduced }) {
  const cur = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const base = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  let fly = null; // { fromPos, fromTarget, toPos, toTarget, t, dur, done }
  let yaw = 0, pitch = 0, zoom = 1, tYaw = 0, tPitch = 0, tZoom = 1;
  let limits = { yaw: 0.45, pitch: 0.16, zMin: 0.62, zMax: 1.15 };
  let par = { x: 0, y: 0 }, tPar = { x: 0, y: 0 };
  const pointers = new Map();
  let dragDist = 0, pinch0 = 0, zoom0 = 1;

  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragDist = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = tZoom; }
    try { dom.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e) => {
    if (e.pointerType === 'mouse') { tPar.x = (e.clientX / innerWidth - 0.5); tPar.y = (e.clientY / innerHeight - 0.5); }
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    dragDist += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) tZoom = clamp(zoom0 * (pinch0 / d), limits.zMin, limits.zMax);
      return;
    }
    if (fly) return;
    tYaw = clamp(tYaw - dx * 0.0035, -limits.yaw, limits.yaw);
    tPitch = clamp(tPitch + dy * 0.0025, -limits.pitch, limits.pitch);
  };
  const onUp = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; };
  const onWheel = (e) => { e.preventDefault(); tZoom = clamp(tZoom * (1 + Math.sign(e.deltaY) * 0.08), limits.zMin, limits.zMax); };
  dom.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  dom.addEventListener('wheel', onWheel, { passive: false });

  const tmpDir = new THREE.Vector3(), axisY = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3();

  return {
    get flying() { return !!fly; },
    get dragDistance() { return dragDist; },
    set(view) { base.pos.copy(view.pos); base.target.copy(view.target); cur.pos.copy(view.pos); cur.target.copy(view.target); },
    setLimits(l) { limits = { ...limits, ...l }; tYaw = clamp(tYaw, -limits.yaw, limits.yaw); tPitch = clamp(tPitch, -limits.pitch, limits.pitch); tZoom = clamp(tZoom, limits.zMin, limits.zMax); },
    flyTo(view, dur = 1.5) {
      return new Promise((resolve) => {
        const d = reduced ? 0.01 : dur;
        fly = { fromPos: cur.pos.clone(), fromTarget: cur.target.clone(), toPos: view.pos.clone(), toTarget: view.target.clone(), t: 0, dur: d, done: resolve };
        base.pos.copy(view.pos); base.target.copy(view.target);
        tYaw = 0; tPitch = 0; tZoom = 1;
      });
    },
    update(dt) {
      if (fly) {
        fly.t += dt; const k = ease(clamp(fly.t / fly.dur, 0, 1));
        cur.pos.lerpVectors(fly.fromPos, fly.toPos, k);
        cur.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
        // lift the path a little so the camera arcs over the consoles
        cur.pos.y += Math.sin(k * Math.PI) * 1.2;
        if (fly.t >= fly.dur) { const f = fly; fly = null; cur.pos.copy(base.pos); cur.target.copy(base.target); f.done(); }
      } else { cur.pos.copy(base.pos); cur.target.copy(base.target); }
      const s = Math.min(1, dt * 6);
      yaw = lerp(yaw, tYaw, s); pitch = lerp(pitch, tPitch, s); zoom = lerp(zoom, tZoom, s);
      par.x = lerp(par.x, tPar.x, Math.min(1, dt * 2)); par.y = lerp(par.y, tPar.y, Math.min(1, dt * 2));
      tmpDir.copy(cur.pos).sub(cur.target);
      tmpDir.applyAxisAngle(axisY, yaw - par.x * 0.05);
      right.crossVectors(tmpDir, axisY).normalize();
      tmpDir.applyAxisAngle(right, pitch + par.y * 0.03);
      tmpDir.multiplyScalar(zoom);
      camera.position.copy(cur.target).add(tmpDir);
      camera.lookAt(cur.target);
    },
  };
}
