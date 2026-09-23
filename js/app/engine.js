// The 3D Mission Control app: renderer, room, stations, panels, launch sequence.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONTENT as C } from '../content.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { aboutHTML, projectsHTML, experienceHTML, educationHTML, skillsHTML, contactHTML, wire } from '../ui/render.js';
import { openGame } from '../ui/gameDialog.js';
import { SETTINGS, fpsGuard } from './quality.js';
import { makeScreens } from './screens.js';
import { buildRoom } from './room.js';
import { makeRig } from './camera.js';
import { sound } from './audio.js';
import { loadLand as fetchLand, landSampler, startISS, iss, loadAPOD } from './live.js';
import { clamp, lerp } from './tex.js';

const $ = (id) => document.getElementById(id);
const ORDER = ['briefing', 'about', 'projects', 'skills', 'experience', 'contact'];
const TITLES = {
  briefing: ['Mission briefing', 'Welcome aboard'],
  about: ['Crew file', 'About me'],
  projects: ['Payloads', 'Projects'],
  skills: ['Systems', 'Skills'],
  experience: ['Flight log', 'Experience'],
  contact: ['Comms open', 'Contact'],
};

export async function createApp({ quality, reduced }) {
  let tier = quality.tier;
  let S = { ...SETTINGS[tier] };

  /* ── renderer ── */
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, S.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = S.shadows > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 400);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const small = tier === 'low';
  const screens = makeScreens(C, small ? { big: [1200, 504], side: [720, 512], mon: [384, 240] } : {});
  const room = buildRoom({ screens, settings: S, envMap });
  const { scene, stations } = room;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * S.bloomScale, innerHeight * S.bloomScale), 0.55, 0.45, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useBloom = S.bloom;

  const rig = makeRig(camera, canvas, { reduced });
  rig.set(stations.overview.view);

  /* ── view offset so the station stays visible next to the open panel ── */
  let shift = 0, shiftTarget = 0;
  function applyShift() {
    const W = innerWidth, H = innerHeight;
    if (shift < 0.001) { camera.clearViewOffset(); return; }
    if (W > 720) { const pw = Math.min(620, W); camera.setViewOffset(W, H, (pw / 2) * shift, 0, W, H); }
    else { camera.setViewOffset(W, H, 0, H * 0.3 * shift, W, H); }
  }

  function resize() {
    const W = innerWidth, H = innerHeight;
    camera.aspect = W / H; camera.fov = W < H ? 64 : 52; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, S.dpr));
    renderer.setSize(W, H, false); composer.setSize(W, H);
    applyShift();
  }
  addEventListener('resize', () => { resize(); hotspots && hotspots.forEach((h) => { h.w = 0; }); }); resize();

  /* ── hotspots (HTML buttons that follow the 3D stations) ── */
  const layer = $('hotspots');
  const hotspots = Object.values(stations).filter((s) => s.anchor).map((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hotspot';
    b.innerHTML = `<i></i><span>${s.label} · <b>${s.sub}</b></span>`;
    b.addEventListener('click', () => { sound.click(); openStation(s.key); });
    b.addEventListener('pointerenter', () => { hovered = s; });
    b.addEventListener('pointerleave', () => { if (hovered === s) hovered = null; });
    layer.appendChild(b);
    return { s, b };
  });
  const tmp = new THREE.Vector3();
  function placeHotspots() {
    const W = innerWidth, H = innerHeight;
    const show = current === null && !rig.flying && entered;
    for (const h of hotspots) {
      h.s.anchor.getWorldPosition(tmp); tmp.project(camera);
      const off = tmp.z > 1 || tmp.x < -1.1 || tmp.x > 1.1 || tmp.y < -1.1 || tmp.y > 1.1;
      h.b.classList.toggle('gone', !show || off);
      h.b.tabIndex = show && !off ? 0 : -1;
      if (!off) {
        if (!h.w) h.w = h.b.offsetWidth || 160;
        const x = clamp((tmp.x * 0.5 + 0.5) * W - 5, 6, W - h.w - 6);
        const y = clamp((-tmp.y * 0.5 + 0.5) * H - 12, 60, H - 110);
        h.b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
      h.b.classList.toggle('hot', hovered === h.s);
    }
  }

  /* ── pointer picking ── */
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const hitList = Object.values(stations).flatMap((s) => s.hit || []);
  let hovered = null, lastHoverSound = 0;
  function pick(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hitList, false)[0];
    return hit ? hit.object.userData.station : null;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || current || rig.flying) return;
    const s = pick(e.clientX, e.clientY);
    if (s !== hovered) { hovered = s; if (s && performance.now() - lastHoverSound > 250) { sound.hover(); lastHoverSound = performance.now(); } }
    canvas.classList.toggle('clickable', !!s);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (rig.dragDistance > 8 || current || rig.flying || !entered) return;
    const s = pick(e.clientX, e.clientY);
    if (s) { sound.click(); openStation(s.key); }
  });

  /* ── panel ── */
  const panel = $('panel'), pBody = $('panel-body');
  let current = null, entered = false, launching = null, gameOpen = false;
  wire(pBody, { onPlay: (src, title, btn) => openGame(src, title, btn) });

  function panelHTML(key) {
    switch (key) {
      case 'about': return aboutHTML(C);
      case 'projects': return `<p class="lead">Things I’ve built and launched. The games are playable right here.</p>${projectsHTML(C)}`;
      case 'skills': return skillsHTML(C);
      case 'experience': return `${experienceHTML(C)}<h3 class="sub">Education</h3>${educationHTML(C)}`;
      case 'contact': return `<p class="lead">Comms are open. The best way to reach me is email or LinkedIn.</p>${contactHTML(C)}`;
      case 'briefing': return briefingHTML();
      default: return '';
    }
  }
  let apod = null;
  function briefingHTML() {
    const issLine = iss.ok ? `Right now the ISS is at ${iss.lat.toFixed(1)}°, ${iss.lon.toFixed(1)}°, flying ${Math.round(iss.alt)} km above Earth. Its path is on the big screen.` : 'The big screen shows the ISS ground track and my ground station in Karachi.';
    return `
      <p class="lead">Hi, I’m ${C.name.split(' ')[0]}, an ${C.role} from ${C.location.split(',')[0]}. You’re standing in my mission control room.</p>
      <p>Every station here is part of my portfolio. Click a glowing screen, or use the bar at the bottom. Drag to look around and scroll to zoom.</p>
      <div class="tour">
        <button type="button" class="btn" data-go="about">Start the tour →</button>
        <button type="button" class="btn ghost" data-go="projects">See projects</button>
        <button type="button" class="btn ghost" data-go="simulator">Play Lunar Lander</button>
      </div>
      <h3 class="sub">Live right now</h3>
      <p>${issLine}</p>
      ${apod ? `<div class="apod">${apod.url ? `<img src="${apod.url}" alt="${apod.title.replace(/"/g, '&quot;')}" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <h4>${apod.title}</h4><small>NASA Astronomy Picture of the Day · ${apod.date} · © ${apod.copyright}</small>
        <a href="${apod.page}" target="_blank" rel="noopener">Read about it on apod.nasa.gov ↗</a></div>` : ''}`;
  }
  pBody.addEventListener('click', (e) => { const go = e.target.closest('[data-go]'); if (go) { sound.click(); switchTo(go.dataset.go); } });

  function setNav(key) { document.querySelectorAll('.stations button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.station === key))); }

  function showPanel(key) {
    current = key;
    const [eb, title] = TITLES[key];
    $('panel-eyebrow').textContent = eb; $('panel-title').textContent = title;
    pBody.innerHTML = panelHTML(key); pBody.scrollTop = 0;
    const i = ORDER.indexOf(key);
    $('panel-prev').hidden = i <= 0; $('panel-next').hidden = i >= ORDER.length - 1;
    $('panel-next').textContent = i >= 0 && i < ORDER.length - 1 ? `${TITLES[ORDER[i + 1]][1]} →` : 'Next →';
    $('panel-prev').textContent = i > 0 ? `← ${TITLES[ORDER[i - 1]][1]}` : '← Prev';
    if (!panel.open) panel.showModal();
    document.body.classList.add('panel-open');
    shiftTarget = 1; setNav(key); sound.open();
  }

  async function openStation(key) {
    if (!entered || launching) return;
    const s = stations[key]; if (!s) return;
    hovered = null; canvas.classList.remove('clickable');
    if (key === 'simulator') {
      current = 'simulator'; setNav(key);
      await rig.flyTo(s.view, 1.4);
      openGame('/games/lander/index.html', 'Lunar Lander · FA-01 Simulator', $('stations').querySelector('[data-station="simulator"]'));
      return;
    }
    if (key === 'contact') { current = 'contact'; setNav(key); await rig.flyTo(s.view, 1.3); runLaunch(); return; }
    current = key; setNav(key);
    rig.setLimits({ yaw: 0.12, pitch: 0.06, zMin: 0.85, zMax: 1.1 });
    const fly = rig.flyTo(s.view, 1.5);
    setTimeout(() => showPanel(key), reduced ? 0 : 350);
    await fly;
  }
  function leavePanelFor(key) { suppressBack = true; panel.close(); document.body.classList.remove('panel-open'); current = null; shiftTarget = 0; openStation(key); }
  async function switchTo(key) {
    if (key === 'simulator' || key === 'contact') { leavePanelFor(key); return; }
    showPanel(key); rig.flyTo(stations[key].view, 1.3);
  }
  function backToRoom() {
    document.body.classList.remove('panel-open');
    current = null; shiftTarget = 0; setNav(null);
    rig.setLimits({ yaw: 0.45, pitch: 0.16, zMin: 0.62, zMax: 1.15 });
    rig.flyTo(stations.overview.view, 1.4);
  }
  $('panel-close').addEventListener('click', () => panel.close());
  let suppressBack = false;
  panel.addEventListener('close', () => { sound.close(); if (suppressBack) { suppressBack = false; return; } backToRoom(); });
  $('panel-next').addEventListener('click', () => { const i = ORDER.indexOf(current); if (i >= 0 && i < ORDER.length - 1) { sound.click(); switchTo(ORDER[i + 1]); } });
  $('panel-prev').addEventListener('click', () => { const i = ORDER.indexOf(current); if (i > 0) { sound.click(); switchTo(ORDER[i - 1]); } });
  document.querySelectorAll('.stations button').forEach((b) => b.addEventListener('click', () => {
    sound.click();
    const key = b.dataset.station;
    if (panel.open) { switchTo(key); return; }
    openStation(key);
  }));
  document.addEventListener('game-dialog-opened', () => { gameOpen = true; sound.set(false, false); });
  document.addEventListener('game-dialog-closed', () => {
    gameOpen = false; clock.getDelta(); if (soundWanted) sound.set(true, false);
    if (current === 'simulator') backToRoom();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && launching) finishLaunch(); });

  /* ── Contact = Launch ── */
  function runLaunch() {
    if (reduced) { sound.quindar(); showPanel('contact'); return; }
    launching = { t: 0, lastCount: -1, lifted: false };
    screens.state.mode = 'launch'; screens.state.launchT = 0;
    $('launch-hud').hidden = false; sound.quindar();
  }
  function finishLaunch() {
    if (!launching) return;
    launching = null; screens.state.mode = 'normal'; $('launch-hud').hidden = true;
    showPanel('contact');
  }
  $('btn-skip').addEventListener('click', finishLaunch);
  function tickLaunch(dt) {
    launching.t += dt; screens.state.launchT = launching.t;
    const n = 5 - Math.floor(launching.t);
    if (launching.t < 5 && n !== launching.lastCount) { launching.lastCount = n; $('launch-text').textContent = `T-${String(n).padStart(2, '0')}`; sound.count(); }
    if (launching.t >= 5 && !launching.lifted) { launching.lifted = true; $('launch-text').textContent = 'LIFTOFF'; sound.go(); sound.rumble(4); }
    if (launching.t > 9) finishLaunch();
  }

  /* ── sound toggle ── */
  let soundWanted = sound.preferred();
  const sBtn = $('btn-sound');
  function syncSoundBtn() { sBtn.textContent = sound.on ? 'Sound on' : 'Sound off'; sBtn.setAttribute('aria-pressed', String(sound.on)); }
  sBtn.addEventListener('click', () => { soundWanted = !sound.on; sound.set(soundWanted); syncSoundBtn(); });

  /* ── quality guard ── */
  const guard = fpsGuard(() => {
    if (tier === 'high') { tier = 'mid'; S = { ...SETTINGS.mid }; room.setShadows(S.shadows); resize(); }
    else if (tier === 'mid') { tier = 'low'; S = { ...SETTINGS.low }; room.setShadows(0); renderer.shadowMap.enabled = false; useBloom = false; resize(); }
  });

  /* ── loop ── */
  const clock = new THREE.Clock();
  let screenAcc = 0, fullAcc = 0, clockAcc = 1, running = false;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (gameOpen) return; // the game gets the GPU while it's open
    if (launching) tickLaunch(dt);
    shift = lerp(shift, shiftTarget, Math.min(1, dt * 4)); applyShift();
    rig.update(dt);
    room.update(dt, t, { alert: launching ? 1 : 0, hovered });
    screenAcc += dt; fullAcc += dt; clockAcc += dt;
    const hz = launching ? 30 : S.screenHz;
    if (screenAcc > 1 / hz) { screenAcc = 0; const full = fullAcc > 1 / Math.min(hz, 4); if (full) fullAcc = 0; screens.update(t, full); }
    if (clockAcc >= 1) { clockAcc = 0; screens.tickClock(t); }
    if (useBloom) composer.render(); else renderer.render(scene, camera);
    placeHotspots();
    sound.tick(dt);
    if (entered) guard(dt);
  }

  // top score for the arcade screen
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/lander_scores?select=initials,score&order=score.desc&limit=1`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } })
      .then((r) => (r.ok ? r.json() : [])).then((d) => { if (d[0]) screens.state.topScore = `${d[0].initials} ${d[0].score}`; }).catch(() => {});
  }

  return {
    async loadLand() {
      const mask = await fetchLand();
      if (!mask) return false;
      screens.setLandMask(mask); room.setGlobeLand(landSampler(mask));
      return true;
    },
    async startLive() {
      const ok = await new Promise((resolve) => {
        let first = true;
        startISS((d) => {
          const el = $('iss-readout'), tx = $('iss-text');
          el.classList.toggle('live', d.ok);
          tx.textContent = d.ok ? `ISS · ${d.lat.toFixed(1)}°, ${d.lon.toFixed(1)}° · ${Math.round(d.alt)} km` : 'ISS · simulated';
          if (first) { first = false; resolve(d.ok); }
        });
        setTimeout(() => resolve(false), 5500);
      });
      loadAPOD().then((a) => { apod = a; if (a) screens.state.apodTitle = a.title; });
      return ok;
    },
    renderPreview() { running = true; clock.getDelta(); frame(); },
    enter() {
      entered = true;
      $('topbar').hidden = false; $('stations').hidden = false;
      if (soundWanted) sound.set(true); syncSoundBtn();
      canvas.focus({ preventScroll: true });
    },
  };
}
