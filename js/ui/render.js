// Turns CONTENT into HTML. Used by the Quick view page and by the 3D room's panels.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function aboutHTML(c) {
  return `
    <dl class="crew">
      <div><dt>Name</dt><dd>${esc(c.name)}</dd></div>
      <div><dt>Role</dt><dd>${esc(c.role)}</dd></div>
      <div><dt>Base</dt><dd>${esc(c.location)}</dd></div>
      <div><dt>Focus</dt><dd>${esc(c.focus)}</dd></div>
      <div><dt>Status</dt><dd class="go">Go for launch</dd></div>
    </dl>
    ${c.about.map((p) => `<p>${esc(p)}</p>`).join('')}`;
}

function projectVisual(p) {
  if (p.image) return `<img src="${esc(p.image)}" alt="${esc(p.name)} screenshot" loading="lazy" decoding="async" width="640" height="360">`;
  // no screenshot: draw a simple payload illustration
  return `<div class="payload-art" aria-hidden="true"><svg viewBox="0 0 320 180"><defs><linearGradient id="pa-${esc(p.id)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e1b33"/><stop offset="1" stop-color="#060b16"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#pa-${esc(p.id)})"/>
    <rect x="70" y="34" width="180" height="112" rx="6" fill="#0a1426" stroke="#7fe3ff" stroke-opacity=".5"/>
    <rect x="70" y="34" width="180" height="18" rx="6" fill="#0b1c38"/><circle cx="82" cy="43" r="3" fill="#fc3d21"/>
    <rect x="84" y="64" width="70" height="8" rx="2" fill="#b8c6e3" opacity=".6"/><rect x="84" y="80" width="110" height="6" rx="2" fill="#8394b8" opacity=".5"/>
    <rect x="84" y="92" width="96" height="6" rx="2" fill="#8394b8" opacity=".5"/>
    <circle cx="214" cy="110" r="20" fill="none" stroke="#fc3d21" stroke-width="3"/><circle cx="214" cy="110" r="6" fill="#fc3d21"/>
    <text x="160" y="170" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#8394b8" letter-spacing="2">${esc(p.name.toUpperCase())} · SCREENSHOTS ON REQUEST</text></svg></div>`;
}

export function projectsHTML(c) {
  return `<div class="payloads">${c.projects.map((p) => `
    <article class="payload" id="p-${esc(p.id)}">
      <div class="payload-media">${projectVisual(p)}</div>
      <div class="payload-body">
        <header>
          <h3>${esc(p.name)}</h3>
          <span class="status ${p.status === 'LIVE' ? 'live' : 'playable'}">● ${esc(p.status)}</span>
        </header>
        <p class="kind">${esc(p.kind)} · ${esc(p.year)}</p>
        <p>${esc(p.summary)}</p>
        <ul>${p.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="chips">${p.stack.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        ${(p.play || p.links.length) ? `<div class="actions">
          ${p.play ? `<button class="btn small" type="button" data-play="${esc(p.play)}" data-title="${esc(p.name)}">▶ Play demo</button>` : ''}
          ${p.links.map((l) => `<a class="btn small ghost" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}
        </div>` : ''}
      </div>
    </article>`).join('')}</div>`;
}

export function experienceHTML(c) {
  return `<ol class="log">${c.experience.map((e) => `
    <li>
      <div class="log-date">${esc(e.dates)}</div>
      <div class="log-body">
        <h3>${esc(e.role)} <span>· ${esc(e.org)}</span></h3>
        <ul>${e.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
    </li>`).join('')}</ol>`;
}

export function educationHTML(c) {
  return `<ul class="edu">${c.education.map((e) => `<li><strong>${esc(e.school)}</strong><span>${esc(e.detail)}</span></li>`).join('')}</ul>`;
}

export function skillsHTML(c) {
  return `<div class="systems">${c.skills.map((g) => `
    <section class="system">
      <h3>${esc(g.group)}</h3>
      <div class="chips">${g.items.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    </section>`).join('')}</div>`;
}

export function contactHTML(c) {
  return `<ul class="comms">${c.contact.map((l) => `
    <li>
      <span class="comms-label">${esc(l.label)}</span>
      <a href="${esc(l.href)}" ${l.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${esc(l.value)}</a>
      ${l.label === 'Email' ? `<button class="copy" type="button" data-copy="${esc(l.value)}">Copy</button>` : ''}
    </li>`).join('')}</ul>`;
}

// Wire shared behaviours inside any container: copy buttons + play buttons.
export function wire(root, { onPlay } = {}) {
  root.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = 'Copied'; }
      catch { copy.textContent = 'Select it'; }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1800);
    }
    const play = e.target.closest('[data-play]');
    if (play && onPlay) onPlay(play.dataset.play, play.dataset.title, play);
  });
}
