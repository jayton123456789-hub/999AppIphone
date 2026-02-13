# Transfer Features

## 1) API-backed song library + album art (kept and upgraded)
- **Kept because:** Live catalog data and real cover art are core to the app.
- **How it was improved:** Rebuilt mapping and duplicate cleanup while preserving metadata from the API (title, artist, era, cover, lyrics, path).
- **How it looks now:** Stable queue list with consistent song cards and loaded cover art in the player.
- **Why it is needed:** A music app must feel alive and current, not static or fake.

## 2) Era/category filter metadata (kept and restored)
- **Kept because:** You asked to keep era/category filter data working like before.
- **How it was improved:** Added filter metadata loading from `/eras/` and `/categories/`, wired into dropdowns with clear/reset behavior.
- **How it looks now:** Lightweight filter row at top of queue with quick era/category targeting.
- **Why it is needed:** Filtering helps users quickly find the part of the catalog they actually want.

## 3) Playback controls and track flow (kept and redesigned)
- **Kept because:** Play/pause/skip is the center of the app experience.
- **How it was improved:** Better icon controls, stronger state updates, end-of-track auto-next, seek handling, and safe play fallback.
- **How it looks now:** Cleaner control cluster with a larger primary play/pause button.
- **Why it is needed:** Good audio control UX is non-negotiable for a music app.

## 4) Side-of-screen previous/next taps (kept and fixed)
- **Kept because:** You specifically wanted edge tap controls.
- **How it was improved:** Added full-height left/right tap zones with reliable next/previous behavior.
- **How it looks now:** Gesture-style navigation with no extra visual clutter.
- **Why it is needed:** One-handed quick track switching is important on phones.

## 5) Lyrics screen (kept and rebuilt)
- **Kept because:** Lyrics are part of your core product idea.
- **How it was improved:** Dedicated lyrics sheet, rendered lines, active-line highlight synced to playback time, and empty-state handling.
- **How it looks now:** Full focus lyrics panel that is readable and fluid.
- **Why it is needed:** Lyrics give emotional context and improve engagement.

## 6) Likes/favorites persistence (kept and cleaned)
- **Kept because:** Saving favorites is expected behavior in music products.
- **How it was improved:** Persistent liked state in local storage with immediate row and player updates.
- **How it looks now:** Consistent heart indicators across queue and player.
- **Why it is needed:** Personalization drives repeat usage.
