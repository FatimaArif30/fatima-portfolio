// Builds the Mission Control room (Artemis look). Every object is made in code.
import * as THREE from 'three';
import { ctex, rng, TAU, glowSprite, landValue, LAND } from './tex.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildRoom({ screens, settings, envMap }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050a);
  scene.fog = new THREE.Fog(0x03050a, 40, 95);
  scene.environment = envMap;

  const C = { x: 0, z: -14 };
  const metal = new THREE.MeshStandardMaterial({ color: 0x252c3a, roughness: 0.45, metalness: 0.55, envMapIntensity: 0.35 });
  const metalLight = new THREE.MeshStandardMaterial({ color: 0x3a4356, roughness: 0.35, metalness: 0.5, envMapIntensity: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.3 });
  const screenMat = (map, k = 1.2) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k), toneMapped: true });

  /* ── floor, walls, ceiling ── */
  const floorTex = ctex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#0c1018'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.025})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(120,140,190,0.10)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); }
  }, { wrap: true });
  floorTex.repeat.set(10, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.38, metalness: 0.35, envMapIntensity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const wallTex = ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#0a0d15'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#0c1019' : '#090c13'; g.fillRect(i * w / 8, 0, w / 8 - 3, h); }
    g.fillStyle = 'rgba(160,180,230,0.05)'; for (let i = 0; i < 8; i++) g.fillRect(i * w / 8 - 3, 0, 3, h);
  }, { wrap: true });
  wallTex.repeat.set(8, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.1, envMapIntensity: 0.08 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 22), wallMat); back.position.set(0, 11, C.z - 0.6); scene.add(back);
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(60, 22), wallMat); side.position.set(s * 26, 11, 10); side.rotation.y = -s * Math.PI / 2; scene.add(side); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(80, 70), new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 1, envMapIntensity: 0.04 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 16, 10); scene.add(ceil);
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.1, 1.0) });
  for (const R of [12, 18, 24]) {
    const tg = new THREE.TorusGeometry(R, 0.08, 6, 64, 1.3); tg.rotateZ(Math.PI / 2 - 0.65); tg.rotateX(Math.PI / 2);
    const t = new THREE.Mesh(tg, stripMat); t.scale.set(1, 1, 0.6); t.position.set(C.x, 15.8, C.z); scene.add(t);
  }
  // NASA-style red wall stripe
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.15) }));
  stripe.position.set(0, 3.2, C.z - 0.58); scene.add(stripe);

  /* ── big wall screen (About) ── */
  const bigFrame = new THREE.Mesh(new THREE.BoxGeometry(21.2, 9.3, 0.4), black); bigFrame.position.set(0, 8.2, C.z - 0.2); scene.add(bigFrame);
  const bigScreen = new THREE.Mesh(new THREE.PlaneGeometry(20.6, 8.66), screenMat(screens.bigTex, 1.12));
  bigScreen.position.set(0, 8.2, C.z + 0.02); scene.add(bigScreen);

  /* ── side screens (Projects left, Skills right) ── */
  const sideDefs = [['projects', -13.6, screens.projTex, 0.55], ['skills', 13.6, screens.skillTex, -0.55]];
  const side = {};
  for (const [key, x, tex, ry] of sideDefs) {
    const grp = new THREE.Group(); grp.position.set(x, 7.2, C.z + 2.4); grp.rotation.y = ry; scene.add(grp);
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(7.6, 5.6, 0.3), black));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5.12), screenMat(tex, 1.08)); s.position.z = 0.16; grp.add(s);
    const anchor = new THREE.Object3D(); anchor.position.set(0, 3.25, 0.2); grp.add(anchor);
    side[key] = { grp, screen: s, anchor, normal: V3(Math.sin(ry), 0, Math.cos(ry)) };
  }

  /* ── clock row (Contact) ── */
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(20.6, 1.1), new THREE.MeshBasicMaterial({ map: screens.clockTex, color: new THREE.Color(1.6, 1.6, 1.6) }));
  clock.position.set(0, 13.6, C.z + 0.02); scene.add(clock);
  const clockFrame = new THREE.Mesh(new THREE.BoxGeometry(21, 1.4, 0.3), black); clockFrame.position.set(0, 13.6, C.z - 0.18); scene.add(clockFrame);

  /* ── consoles ── */
  const btnTex = ctex(512, 128, (g, w, h) => {
    g.fillStyle = '#1a1f29'; g.fillRect(0, 0, w, h);
    const r = rng(3); const cols = ['#fc3d21', '#ffb547', '#5dff9b', '#3d7bff', '#e8ecf5', '#2a3140'];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(12 + x * 31, 14 + y * 38, 22, 22); }
  }, { aniso: 2 });
  const btnMat = new THREE.MeshStandardMaterial({ map: btnTex, emissiveMap: btnTex, emissive: 0xffffff, emissiveIntensity: 0.28, roughness: 0.5 });
  const monMats = screens.pool.map((t) => screenMat(t, 1.25));
  const logMats = [screenMat(screens.logTex, 1.3), screenMat(screens.eduTex, 1.3)];
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1b1f28, roughness: 0.85 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.2) });
  const G = {
    base: new THREE.BoxGeometry(2.5, 0.85, 1.0), desk: new THREE.BoxGeometry(2.62, 0.08, 1.35),
    panel: new THREE.BoxGeometry(2.5, 0.55, 0.06), mon: new THREE.BoxGeometry(1.08, 0.72, 0.07), scr: new THREE.PlaneGeometry(1.0, 0.64),
    pole: new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), seat: new THREE.BoxGeometry(0.62, 0.1, 0.6), back: new THREE.BoxGeometry(0.6, 0.72, 0.08), foot: new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16),
  };
  let mi = 0;
  const chairRand = rng(11);
  function makeConsole(special) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(G.base, metal); base.position.y = 0.425; base.castShadow = base.receiveShadow = true; g.add(base);
    const desk = new THREE.Mesh(G.desk, metalLight); desk.position.set(0, 0.89, 0.15); desk.castShadow = true; g.add(desk);
    const panel = new THREE.Mesh(G.panel, [metal, metal, metal, metal, btnMat, metal]); panel.position.set(0, 1.12, -0.28); panel.rotation.x = -0.9; g.add(panel);
    const screensHere = [];
    [-0.6, 0.6].forEach((sx, k) => {
      const m = new THREE.Mesh(G.mon, black); m.position.set(sx, 1.62, -0.36); m.rotation.x = -0.12; m.castShadow = true; g.add(m);
      const s = new THREE.Mesh(G.scr, special ? logMats[k] : monMats[mi++ % monMats.length]); s.position.set(sx, 1.62, -0.32); s.rotation.x = -0.12; g.add(s);
      screensHere.push(s);
    });
    const ch = new THREE.Group(); ch.position.set(0, 0, 1.25);
    const foot = new THREE.Mesh(G.foot, black); foot.position.y = 0.02; ch.add(foot);
    const pole = new THREE.Mesh(G.pole, metalLight); pole.position.y = 0.27; ch.add(pole);
    const seat = new THREE.Mesh(G.seat, seatMat); seat.position.y = 0.55; seat.castShadow = true; ch.add(seat);
    const bk = new THREE.Mesh(G.back, seatMat); bk.position.set(0, 0.95, 0.28); bk.rotation.x = 0.12; bk.castShadow = true; ch.add(bk);
    ch.rotation.y = (chairRand() - 0.5) * 0.5; g.add(ch);
    g.userData.screens = screensHere;
    return g;
  }
  function arcSlab(r0, r1, a0, a1, h, mat) {
    const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 64 }); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
  }
  const rowsDef = [{ R: 11.5, y: 0, n: 7, span: 0.62 }, { R: 16, y: 0.55, n: 9, span: 0.6 }, { R: 20.5, y: 1.1, n: 11, span: 0.58 }].slice(0, settings.rows);
  const tierMat = new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.6, metalness: 0.3, envMapIntensity: 0.3 });
  let logConsole = null;
  rowsDef.forEach((row, ri) => {
    if (ri > 0) {
      const a0 = -Math.PI / 2 - 0.9, a1 = -Math.PI / 2 + 0.9;
      const slab = arcSlab(row.R - 2.2, 40, a0, a1, row.y, tierMat); slab.position.set(C.x, 0, C.z); scene.add(slab);
      const edge = arcSlab(row.R - 2.21, row.R - 2.13, a0, a1, 0.05, edgeMat); edge.position.set(C.x, row.y - 0.03, C.z); scene.add(edge);
    }
    for (let i = 0; i < row.n; i++) {
      const a = -row.span + (2 * row.span * i) / (row.n - 1);
      const special = ri === 0 && i === Math.floor(row.n / 2);
      const c = makeConsole(special);
      c.position.set(C.x + row.R * Math.sin(a), row.y, C.z + row.R * Math.cos(a)); c.rotation.y = a; scene.add(c);
      if (special) logConsole = c;
    }
  });
  const logAnchor = new THREE.Object3D(); logAnchor.position.set(0, 2.35, -0.35); logConsole.add(logAnchor);

  /* ── Flight simulator cabinet (Stack to the Stars) ── */
  const cab = new THREE.Group(); cab.position.set(14.6, 0, -3.4); cab.rotation.y = -0.9; scene.add(cab);
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x1c2436, roughness: 0.4, metalness: 0.5, envMapIntensity: 0.4 });
  const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.6, 1.3), cabMat); cabBody.position.y = 1.8; cabBody.castShadow = true; cab.add(cabBody);
  const cabTrimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.2) });
  for (const sx of [-0.96, 0.96]) { const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.6, 1.32), cabTrimMat); trim.position.set(sx, 1.8, 0); cab.add(trim); }
  const cabScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.25), screenMat(screens.simTex, 1.3)); cabScreen.position.set(0, 2.45, 0.66); cabScreen.rotation.x = -0.08; cab.add(cabScreen);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32), new THREE.MeshBasicMaterial({ map: screens.marqueeTex, color: new THREE.Color(1.5, 1.5, 1.5) })); marquee.position.set(0, 3.38, 0.66); cab.add(marquee);
  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.7), cabMat); ctrl.position.set(0, 1.45, 0.9); ctrl.rotation.x = 0.25; cab.add(ctrl);
  const stickMat = new THREE.MeshStandardMaterial({ color: 0xfc3d21, roughness: 0.4 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), black); stick.position.set(-0.45, 1.62, 0.95); cab.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 8), stickMat); ball.position.set(-0.45, 1.8, 0.95); cab.add(ball);
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), new THREE.MeshBasicMaterial({ color: k ? new THREE.Color(2, 1.4, 0.3) : new THREE.Color(0.3, 2, 0.8) })); b.position.set(0.25 + k * 0.28, 1.54, 0.92); b.rotation.x = 0.25; cab.add(b); }
  const cabAnchor = new THREE.Object3D(); cabAnchor.position.set(0, 3.9, 0.6); cab.add(cabAnchor);
  const cabGlow = new THREE.PointLight(0x7fb8ff, 8, 7, 1.6); cabGlow.position.set(0, 2.4, 1.6); cab.add(cabGlow);

  /* ── Hologram (Mission briefing) ── */
  const holo = new THREE.Group(); holo.position.set(0, 0, -8.2); scene.add(holo);
  const holoEdge = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.9, 2.4) });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.3, metalness: 0.7, envMapIntensity: 0.5 }));
  ped.position.y = 0.3; ped.castShadow = true; holo.add(ped);
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.035, 8, 64), holoEdge); ringTop.rotation.x = Math.PI / 2; ringTop.position.y = 0.62; holo.add(ringTop);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.25, 4.4, 48, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * 0.1; gl_FragColor = vec4(vec3(0.5,0.85,1.0) * a, a); }',
  }));
  beam.position.y = 2.82; holo.add(beam);
  const globe = new THREE.Group(); globe.position.y = 3.2; holo.add(globe);
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.9, 1.3), wireframe: true, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
  globe.add(wire);
  const landPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: new THREE.Color(0.7, 1.7, 2.1), size: 0.045, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  globe.add(landPts);
  function setGlobeLand(isLand) {
    const pts = []; const N = 6000; const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const th = ga * i; const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) * 180 / Math.PI; const lon = Math.atan2(-z, x) * 180 / Math.PI;
      if (isLand ? isLand(lat, lon) : landValue(x, y, z) > LAND) pts.push(x * 1.37, y * 1.37, z * 1.37);
    }
    landPts.geometry.dispose();
    landPts.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
  setGlobeLand(null);
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.012, 6, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.5, 0.35) }));
  orbit.rotation.x = Math.PI / 2 - 0.9; globe.add(orbit);
  const sat = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) })); orbit.add(sat);
  const khi = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.4) }));
  { const la = 24.86 * Math.PI / 180, lo = 67 * Math.PI / 180; khi.position.set(Math.cos(la) * Math.cos(lo) * 1.39, Math.sin(la) * 1.39, -Math.cos(la) * Math.sin(lo) * 1.39); } globe.add(khi);
  const holoAnchor = new THREE.Object3D(); holoAnchor.position.set(0, 5.1, 0); holo.add(holoAnchor);
  const holoLight = new THREE.PointLight(0x7fd8ff, 14, 12, 1.6); holoLight.position.set(0, 3.2, 0); holo.add(holoLight);

  /* ── lights ── */
  const hemi = new THREE.HemisphereLight(0x6b86c9, 0x0a0c12, 0.38); scene.add(hemi);
  const scrLight = new THREE.PointLight(0x5aa0ff, 60, 40, 1.6); scrLight.position.set(0, 7, C.z + 5); scene.add(scrLight);
  const spots = [];
  [[-9, 0], [0, 4], [9, 0], [-12, 8], [12, 8], [0, 12]].forEach(([x, z], i) => {
    const s = new THREE.SpotLight(0xffe2c0, 140, 32, 0.55, 0.7, 1.4);
    s.position.set(x, 15.5, z); s.target.position.set(x * 0.9, 0, z - 1);
    if (i < settings.shadows) { s.castShadow = true; s.shadow.mapSize.set(settings.shadowMap, settings.shadowMap); s.shadow.bias = -0.0005; }
    scene.add(s, s.target); spots.push(s);
  });
  const spotBase = new THREE.Color(0xffe2c0), hemiBase = new THREE.Color(0x6b86c9), red = new THREE.Color(0xff1a0a), edgeBase = edgeMat.color.clone(), edgeHot = new THREE.Color(4, 0.3, 0.15);

  /* ── stations: where the camera goes, what you can click, where the label sits ── */
  const bigAnchor = new THREE.Object3D(); bigAnchor.position.set(-7.2, 12.95, C.z + 0.3); scene.add(bigAnchor);
  const clockAnchor = new THREE.Object3D(); clockAnchor.position.set(7.8, 14.55, C.z + 0.3); scene.add(clockAnchor);
  const sideView = (k) => { const s = side[k]; const c = s.grp.position.clone(); return { pos: c.clone().addScaledVector(s.normal, 10.5).add(V3(0, 0.3, 0)), target: c }; };
  const cabScreenWorld = new THREE.Vector3(); cab.updateMatrixWorld(true); cabScreen.getWorldPosition(cabScreenWorld);
  const cabFacing = V3(Math.sin(cab.rotation.y), 0, Math.cos(cab.rotation.y));
  const logWorld = new THREE.Vector3(); logConsole.updateMatrixWorld(true); logConsole.userData.screens[0].parent.localToWorld(logWorld.set(0, 1.58, -0.32));

  const stations = {
    overview: { view: { pos: V3(0, 7.6, 21.5), target: V3(0, 5.4, -6) } },
    about: { label: 'About me', sub: 'crew file', anchor: bigAnchor, hit: [bigScreen], glow: [bigScreen], view: { pos: V3(0, 8.3, 4.2), target: V3(0, 8.2, -14) } },
    projects: { label: 'Projects', sub: 'payloads', anchor: side.projects.anchor, hit: [side.projects.screen], glow: [side.projects.screen], view: sideView('projects') },
    skills: { label: 'Skills', sub: 'systems', anchor: side.skills.anchor, hit: [side.skills.screen], glow: [side.skills.screen], view: sideView('skills') },
    experience: { label: 'Experience', sub: 'flight log', anchor: logAnchor, hit: logConsole.userData.screens, glow: logConsole.userData.screens, view: { pos: logWorld.clone().add(V3(0, 0.95, 3.4)), target: logWorld.clone().add(V3(0, -0.05, 0)) } },
    contact: { label: 'Contact', sub: 'launch comms', anchor: clockAnchor, hit: [clock], glow: [clock], view: { pos: V3(0, 10.6, 6), target: V3(0, 10.2, -14) } },
    simulator: { label: 'Play Stack to the Stars', sub: 'simulator', anchor: cabAnchor, hit: [cabBody, cabScreen, marquee], glow: [cabScreen], view: { pos: cabScreenWorld.clone().addScaledVector(cabFacing, 4.2).add(V3(0, 0.2, 0)), target: cabScreenWorld.clone() } },
    briefing: { label: 'Mission briefing', sub: 'start here', anchor: holoAnchor, hit: [ped, wire], glow: [], view: { pos: V3(0, 4.4, -1.2), target: V3(0, 3.1, -8.2) } },
  };
  for (const s of Object.values(stations)) if (s.hit) s.hit.forEach((m) => { m.userData.station = s; });
  Object.entries(stations).forEach(([k, s]) => { s.key = k; s.hover = 0; });

  let alertK = 0;
  return {
    scene, stations, spots, setGlobeLand,
    get alert() { return alertK; },
    setShadows(n) { spots.forEach((s, i) => { s.castShadow = i < n; }); },
    update(dt, t, { alert = 0, hovered = null } = {}) {
      alertK += (alert - alertK) * Math.min(1, dt * 3);
      const pulse = 0.55 + 0.45 * Math.sin(t * 6);
      spots.forEach((s) => { s.color.copy(spotBase).lerp(red, alertK); s.intensity = 140 * (1 - alertK * 0.5 * (1 - pulse)); });
      hemi.color.copy(hemiBase).lerp(red, alertK * 0.8);
      edgeMat.color.copy(edgeBase).lerp(edgeHot, alertK).multiplyScalar(1 - alertK * 0.6 * (1 - pulse));
      globe.rotation.y += dt * 0.3;
      const a = t * 0.8; sat.position.set(Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0);
      // hover glow on the screen you point at
      for (const s of Object.values(stations)) {
        if (!s.glow) continue;
        const target = s === hovered ? 1 : 0; s.hover += (target - s.hover) * Math.min(1, dt * 8);
        s.glow.forEach((m) => { if (!m.userData.baseColor) m.userData.baseColor = m.material.color.clone(); m.material.color.copy(m.userData.baseColor).multiplyScalar(1 + s.hover * 0.35); });
      }
      if (hovered === stations.briefing) wire.material.opacity = 0.14 + 0.1 * stations.briefing.hover; else wire.material.opacity = 0.14;
      stations.briefing.hover += ((hovered === stations.briefing ? 1 : 0) - stations.briefing.hover) * Math.min(1, dt * 8);
      holoLight.intensity = 14 + stations.briefing.hover * 10;
      cabGlow.intensity = 8 + Math.sin(t * 3) * 2;
    },
  };
}
