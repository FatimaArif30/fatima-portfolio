# FA-01 Mission Control — Fatima Arif's portfolio

A 3D, NASA-style mission control room you can explore, plus a fast **Quick view** for recruiters.
No build step: plain HTML, CSS and JavaScript. Three.js loads from the jsDelivr CDN.

## Change the text
All text (about, projects, experience, skills, contact) lives in **`js/content.js`**.
Edit it, save, then push to GitHub. Both the 3D room and the Quick view update.

## Pages
- `/` — 3D Mission Control (boot screen, stations, Lunar Lander, launch sequence)
- `/quick` — Quick view (plain page, instant, good for Google)
- `/games/lander/` — Lunar Lander (also opens inside the room)
- `/games/graze-rider/`, `/games/merge-garden/` — game demos

## Lunar Lander leaderboard (Supabase)
1. Create a free Supabase project.
2. SQL Editor → paste `supabase/leaderboard.sql` → Run.
3. Settings → API: copy the Project URL and the `anon` public key into `js/config.js`.
4. Push. Until then, the game keeps a personal best on each device.

## Graphics levels
The site picks high / mid / low automatically and steps down if a device gets slow.
Test a level with `?q=low`, `?q=mid` or `?q=high` at the end of the URL.

## Deploy
Pushing to the `main` branch on GitHub makes Vercel redeploy automatically.
