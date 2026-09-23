import { CONTENT as C } from './content.js';
import { aboutHTML, projectsHTML, experienceHTML, educationHTML, skillsHTML, contactHTML, wire } from './ui/render.js';
import { openGame } from './ui/gameDialog.js';

const slots = {
  about: aboutHTML(C), projects: projectsHTML(C), experience: experienceHTML(C),
  education: educationHTML(C), skills: skillsHTML(C), contact: contactHTML(C),
};
for (const [k, html] of Object.entries(slots)) {
  const el = document.querySelector(`[data-slot="${k}"]`);
  if (el) el.innerHTML = html;
}
document.getElementById('q-name').textContent = C.name;
document.getElementById('q-role').textContent = C.role;
document.getElementById('q-meta').textContent = `${C.location} · ${C.education[0] ? 'CS student at KIET' : ''}`;
wire(document.body, { onPlay: (src, title, btn) => openGame(src, title, btn) });

// Deep link like /quick#projects after render
if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
