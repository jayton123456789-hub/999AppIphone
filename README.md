# WRLD — iPhone-First Music Galaxy PWA

WRLD is a mobile web music app that behaves like a native iPhone app: installable, fullscreen standalone, safe-area aware, animated, and gesture-first.

## Major QA + reliability updates

- Added a **no-email quick account** flow (name only) saved locally with lightweight browser fingerprint metadata.
- Added profile reset/change controls in Settings.
- Fixed interaction reliability: backdrop-tap to close sheets, explicit close button for player, mobile long-press like action.
- Guarded empty-state actions and reduced duplicate fallback cover requests.
- Kept immersive launch fade, 3D carousel depth, now-playing, likes, filters, and sections intact.

## Experience highlights

- Black launch fade-in for cinematic app start.
- Galaxy environment with parallax star fields and mood-reactive tones.
- Wrapped 3D depth carousel with inertia momentum.
- Sections: songs, albums, playlists, radio, likes.
- Immersive now-playing overlay with swipe and button controls.
- Constellation-style liked songs summary.
- Local persistence for profile, likes, playlists, settings, and cached covers.

## API integration (Juice WRLD API)

Base URL:

```txt
https://juicewrldapi.com/juicewrld
```

Used endpoints:

- `GET /songs/`
- `GET /eras/`
- `GET /categories/`
- `GET /radio/random/`
- `GET /files/download/?path=...`

Cover-art fallback chain:

1. API image fields (`cover_art_url`, `cover_art`, `image_url`)
2. iTunes Search API lookup
3. Generated SVG art

## Run locally

```bash
python -m http.server 4173
```

Open `http://localhost:4173`.

## Deploy to Render

This repo now includes a Node-compatible Render setup so it works even when deployed as a **Web Service**:

- `package.json` provides `npm install`, `npm run build`, and `npm run start`
- `npm run start` serves the static app with `serve` on Render's assigned `PORT`
- `render.yaml` defines build/start commands for Render blueprints

If you prefer a Render Static Site, you can still deploy from the repo root with publish directory `.` and no build step.
