// Boot sequence. Shows instantly, loads the 3D engine in the background,
// then runs a NASA-style GO / NO-GO poll before you enter.
import { detectQuality } from './quality.js';

const $ = (id) => document.getElementById(id);
const log = $('boot-log');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

function line(label) {
  const li = document.createElement('li');
  li.innerHTML = `<span>&gt; ${label}</span><span class="dots"></span><b class="warn">…</b>`;
  log.appendChild(li);
  return (status = 'OK', cls = 'ok') => { const b = li.querySelector('b'); b.textContent = status; b.className = cls; };
}

async function boot() {
  const q = detectQuality();
  const l1 = line('Checking flight computer');
  await wait(250);
  if (!q.webgl) {
    l1('NO 3D', 'bad');
    $('boot-note').textContent = 'This device can’t show the 3D room. The Quick view has everything.';
    $('boot-actions').hidden = false; $('btn-enter').hidden = true;
    return;
  }
  l1(q.tier === 'high' ? 'FULL POWER' : q.tier === 'mid' ? 'STANDARD' : 'LIGHT MODE', 'ok');

  const l2 = line('Loading flight software');
  let engine;
  try {
    engine = await import('./engine.js');
    l2();
  } catch (err) {
    console.error(err);
    l2('FAILED', 'bad');
    $('boot-note').textContent = 'The 3D engine could not load (check your internet). The Quick view has everything.';
    $('boot-actions').hidden = false; $('btn-enter').hidden = true;
    return;
  }

  const l3 = line('Building the control room');
  await wait(60);
  let app;
  try { app = await engine.createApp({ quality: q, reduced }); l3(); }
  catch (err) {
    console.error(err); l3('FAILED', 'bad');
    $('boot-note').textContent = 'Something went wrong starting the 3D room. Please use the Quick view.';
    $('boot-actions').hidden = false; $('btn-enter').hidden = true; return;
  }

  const l4 = line('Linking ground station KHI');
  const landOk = await app.loadLand(); l4(landOk ? 'OK' : 'OFFLINE MAP', landOk ? 'ok' : 'warn');
  const l5 = line('Tracking the ISS');
  const issOk = await app.startLive(); l5(issOk ? 'LIVE' : 'SIMULATED', issOk ? 'ok' : 'warn');

  // GO / NO-GO poll
  const poll = $('poll'); poll.hidden = false;
  const names = ['FLIGHT', 'FIDO', 'GUIDO', 'EECOM', 'INCO', 'CAPCOM', 'SURGEON', 'BOOSTER'];
  poll.innerHTML = names.map((n) => `<div><span>${n}</span><b>—</b></div>`).join('');
  const cells = [...poll.querySelectorAll('b')];
  for (const c of cells) { await wait(90); c.textContent = 'GO'; c.className = 'go'; }

  $('boot-actions').hidden = false;
  $('btn-enter').focus({ preventScroll: true });
  app.renderPreview();
  $('btn-enter').addEventListener('click', () => {
    $('boot').classList.add('out');
    setTimeout(() => { $('boot').hidden = true; }, 800);
    app.enter();
  }, { once: true });
}

boot();
