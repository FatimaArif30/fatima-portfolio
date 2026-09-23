// A <dialog> that plays a game in an iframe. The iframe only loads when opened
// and is emptied on close, so games cost nothing until someone presses Play.
let dlg, frame, titleEl, lastFocus;

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'game-dialog';
  dlg.setAttribute('aria-labelledby', 'game-dialog-title');
  dlg.innerHTML = `
    <div class="gd-bar">
      <span class="gd-dot" aria-hidden="true"></span>
      <h2 id="game-dialog-title">Game</h2>
      <button type="button" class="gd-full">Full screen</button>
      <button type="button" class="gd-close" aria-label="Close game">✕</button>
    </div>
    <div class="gd-stage"><iframe title="Game" allow="fullscreen; autoplay" referrerpolicy="no-referrer"></iframe></div>`;
  document.body.appendChild(dlg);
  frame = dlg.querySelector('iframe');
  titleEl = dlg.querySelector('h2');
  dlg.querySelector('.gd-close').addEventListener('click', () => dlg.close());
  dlg.querySelector('.gd-full').addEventListener('click', () => {
    const el = dlg.querySelector('.gd-stage');
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // click on backdrop
  dlg.addEventListener('close', () => {
    frame.src = 'about:blank';
    document.dispatchEvent(new CustomEvent('game-dialog-closed'));
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  });
}

export function openGame(src, title, opener) {
  if (!dlg) build();
  lastFocus = opener || document.activeElement;
  titleEl.textContent = title || 'Game';
  frame.title = title || 'Game';
  frame.src = src;
  dlg.showModal();
  document.dispatchEvent(new CustomEvent('game-dialog-opened'));
  setTimeout(() => { try { frame.focus(); } catch { /* ignore */ } }, 300);
}
