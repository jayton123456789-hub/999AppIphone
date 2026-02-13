const API_BASE = 'https://juicewrldapi.com/juicewrld';
const STORAGE_KEY = 'wrld.v3.state';

const state = {
  profile: null,
  section: 'songs',
  items: [],
  index: 0,
  playingIndex: 0,
  likes: {},
  playlists: {},
  cachedCovers: {},
  pendingCoverTerms: new Set(),
  settings: { showLyrics: true, motionBoost: true },
  filters: { mood: '', era: '', category: '' }
};

const el = {
  launchFade: document.getElementById('launchFade'),
  profileBadge: document.getElementById('profileBadge'),
  profileSheet: document.getElementById('profileSheet'),
  profileName: document.getElementById('profileName'),
  saveProfile: document.getElementById('saveProfile'),
  carousel: document.getElementById('carousel'),
  sectionTitle: document.getElementById('sectionTitle'),
  sectionSubtitle: document.getElementById('sectionSubtitle'),
  constellation: document.getElementById('constellation'),
  nowPlaying: document.getElementById('nowPlaying'),
  playerCover: document.getElementById('playerCover'),
  playerTitle: document.getElementById('playerTitle'),
  playerArtist: document.getElementById('playerArtist'),
  playerGlow: document.getElementById('playerGlow'),
  lyrics: document.getElementById('lyrics'),
  audio: document.getElementById('audioEl'),
  playPause: document.getElementById('playPause'),
  likeTrack: document.getElementById('likeTrack'),
  moodFilter: document.getElementById('moodFilter'),
  eraFilter: document.getElementById('eraFilter'),
  categoryFilter: document.getElementById('categoryFilter'),
  filterSheet: document.getElementById('filterSheet'),
  settingsSheet: document.getElementById('settingsSheet'),
  showLyrics: document.getElementById('showLyrics'),
  motionBoost: document.getElementById('motionBoost')
};

const safeJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  profile: state.profile,
  likes: state.likes,
  playlists: state.playlists,
  cachedCovers: state.cachedCovers,
  settings: state.settings
}));

const deviceFingerprint = () => `${navigator.userAgent}|${navigator.platform}|${navigator.language}`;

const fetchJson = async (path, params = {}) => {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

async function bootstrap() {
  hydrate();
  bindUI();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  await Promise.all([loadFilterMetadata(), loadSection('songs')]);
  animateBackground();
  updateProfileBadge();
  maybeShowProfileSheet();
  gsap.to(el.launchFade, { opacity: 0, duration: 1.1, onComplete: () => el.launchFade.remove() });
}

function hydrate() {
  const stored = safeJson(localStorage.getItem(STORAGE_KEY), {});
  state.profile = stored.profile || null;
  Object.assign(state.likes, stored.likes || {});
  Object.assign(state.playlists, stored.playlists || {});
  Object.assign(state.cachedCovers, stored.cachedCovers || {});
  Object.assign(state.settings, stored.settings || {});
  el.showLyrics.checked = !!state.settings.showLyrics;
  el.motionBoost.checked = !!state.settings.motionBoost;
}

function maybeShowProfileSheet() {
  if (!state.profile?.name) {
    el.profileSheet.classList.remove('hidden');
    setTimeout(() => el.profileName.focus(), 40);
  }
}

function updateProfileBadge() {
  const name = state.profile?.name || 'Guest';
  el.profileBadge.textContent = `${name} • local profile`;
}

function saveProfile() {
  const name = el.profileName.value.trim();
  if (!name) return;
  state.profile = { name, createdAt: new Date().toISOString(), fingerprint: deviceFingerprint() };
  persist();
  updateProfileBadge();
  el.profileSheet.classList.add('hidden');
}

async function loadFilterMetadata() {
  const [eras, categories] = await Promise.all([
    fetchJson('/eras/').catch(() => []),
    fetchJson('/categories/').catch(() => ({ categories: [] }))
  ]);
  eras.slice(0, 60).forEach((era) => el.eraFilter.add(new Option(era.name, era.name)));
  (categories.categories || []).forEach((c) => el.categoryFilter.add(new Option(c.label, c.value)));
}

async function loadSection(section) {
  state.section = section;
  state.index = 0;
  let items = [];

  if (section === 'radio') {
    const randoms = await Promise.all(Array.from({ length: 8 }, () => fetchJson('/radio/random/').catch(() => null)));
    items = randoms.filter(Boolean).map((r) => mapSong(r.song || r));
    el.sectionTitle.textContent = 'Radio Eras';
    el.sectionSubtitle.textContent = 'Randomized cosmic stream';
  } else if (section === 'likes') {
    items = Object.values(state.likes);
    el.sectionTitle.textContent = 'Constellation';
    el.sectionSubtitle.textContent = `${items.length} liked tracks in orbit`;
  } else {
    const data = await fetchJson('/songs/', {
      page: 1,
      page_size: 28,
      era: state.filters.era,
      category: state.filters.category
    }).catch(() => ({ results: [] }));

    items = (data.results || []).map(mapSong);
    if (section === 'albums') items = groupByEra(items);
    if (section === 'playlists') items = asPlaylists(items);
    el.sectionTitle.textContent = section[0].toUpperCase() + section.slice(1);
    el.sectionSubtitle.textContent = state.filters.era || 'Drift through your universe';
  }

  state.items = items.slice(0, 14);
  renderCarousel();
  renderConstellation();
}

function mapSong(song) {
  const key = `${song.name || song.title}-${song.credited_artists || ''}`;
  return {
    id: song.id || `${Date.now()}-${Math.random()}`,
    title: song.name || song.title || 'Untitled Signal',
    artist: song.credited_artists || 'Juice WRLD',
    era: song.era?.name || 'Unknown Era',
    duration: song.length || '--:--',
    path: song.path || '',
    lyrics: song.lyrics || '',
    cover: pickCover(song, key)
  };
}

function pickCover(song, key) {
  const direct = song.cover_art_url || song.cover_art || song.image_url;
  if (direct) return absolutize(direct);
  if (state.cachedCovers[key]) return state.cachedCovers[key];
  requestItunesCover(key);
  return svgCover(song.name || song.title || 'WRLD', song.credited_artists || 'Juice');
}

function requestItunesCover(term) {
  if (state.pendingCoverTerms.has(term)) return;
  state.pendingCoverTerms.add(term);
  itunesCover(term).finally(() => state.pendingCoverTerms.delete(term));
}

function absolutize(url) {
  return url.startsWith('http') ? url : `https://juicewrldapi.com${url}`;
}

async function itunesCover(term) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=1`;
  const data = await fetch(url).then((r) => r.json()).catch(() => null);
  const art = data?.results?.[0]?.artworkUrl100?.replace('100x100bb', '600x600bb');
  if (!art) return;
  state.cachedCovers[term] = art;
  persist();
}

function svgCover(title, artist) {
  const c1 = `hsl(${(title.length * 31) % 360} 70% 45%)`;
  const c2 = `hsl(${(artist.length * 47) % 360} 70% 45%)`;
  const safeTitle = title.replace(/[<>&'"`]/g, '').slice(0, 20);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='800' height='800' fill='#05050d'/><circle cx='400' cy='400' r='260' fill='url(#g)' opacity='0.28'/><text x='60' y='650' fill='white' font-size='50' font-family='Arial'>${safeTitle}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function groupByEra(items) {
  return [...new Map(items.map((i) => [i.era, i])).values()].map((i) => ({ ...i, title: i.era, artist: 'Era Collection' }));
}

function asPlaylists(items) {
  return items.filter((_, i) => i % 2 === 0).map((i) => ({ ...i, title: `Playlist ${i.era}`, artist: 'Mood Mix' }));
}

function renderCarousel() {
  el.carousel.innerHTML = '';
  if (!state.items.length) {
    el.carousel.innerHTML = '<p style="text-align:center;color:#d4dbf6">No items in this orbit.</p>';
    return;
  }

  state.items.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<img loading="lazy" src="${item.cover}" alt="${item.title}"><span class="duration">${item.duration}</span><div class="meta"><h3>${item.title}</h3><p>${item.artist}</p></div>`;
    card.addEventListener('click', () => openPlayerByIndex(i));
    let pressTimer = 0;
    card.addEventListener('touchstart', () => { pressTimer = window.setTimeout(() => toggleLike(item), 520); }, { passive: true });
    card.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
    card.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    card.oncontextmenu = (e) => { e.preventDefault(); toggleLike(item); };
    el.carousel.appendChild(card);
  });
  layoutCards();
}

function layoutCards() {
  [...el.carousel.children].forEach((card, i) => {
    const count = state.items.length;
    const raw = ((i - state.index + count + count / 2) % count) - count / 2;
    gsap.to(card, {
      xPercent: raw * 72,
      yPercent: -50,
      left: '50%',
      top: '50%',
      z: 210 - Math.abs(raw) * 74,
      rotateY: raw * -16,
      scale: 1 - Math.min(Math.abs(raw) * 0.11, 0.58),
      opacity: 1 - Math.min(Math.abs(raw) * 0.16, 0.76),
      filter: `blur(${Math.min(Math.abs(raw) * 1.4, 6)}px)`,
      zIndex: 100 - Math.floor(Math.abs(raw) * 10),
      duration: state.settings.motionBoost ? 0.56 : 0.22,
      ease: 'power3.out'
    });
    card.style.boxShadow = Math.abs(raw) < 0.2 ? '0 0 40px #8b6dff9c' : '0 16px 36px #0009';
  });
}

function shift(step) {
  const len = state.items.length;
  if (!len) return;
  state.index = (state.index + step + len) % len;
  layoutCards();
  gsap.fromTo(el.carousel, { rotateZ: step * 1.1 }, { rotateZ: 0, duration: 0.5, ease: 'sine.out' });
}

function openPlayerByIndex(i) {
  if (!state.items.length) return;
  state.playingIndex = i;
  const item = state.items[i];
  el.nowPlaying.classList.remove('hidden');
  el.playerCover.src = item.cover;
  el.playerTitle.textContent = item.title;
  el.playerArtist.textContent = item.artist;
  el.likeTrack.textContent = state.likes[item.id] ? '💖' : '💜';
  const hue = (String(item.id).length * 87) % 360;
  el.playerGlow.style.background = `radial-gradient(circle, hsl(${hue} 80% 60%) 0%, transparent 70%)`;
  el.lyrics.innerHTML = '';

  if (state.settings.showLyrics && item.lyrics) showLyrics(item.lyrics);
  if (item.path) {
    el.audio.src = `${API_BASE}/files/download/?path=${encodeURIComponent(item.path)}`;
    el.audio.play().catch(() => {});
  } else {
    el.audio.pause();
    el.audio.removeAttribute('src');
  }
}

function showLyrics(text) {
  text.split('\n').filter(Boolean).slice(0, 24).forEach((line, i) => {
    const p = document.createElement('p');
    p.textContent = line;
    p.style.opacity = '0';
    el.lyrics.appendChild(p);
    gsap.to(p, { opacity: 0.95, y: -4, delay: i * 0.18, duration: 0.45 });
  });
}

function toggleLike(item) {
  if (!item) return;
  if (state.likes[item.id]) delete state.likes[item.id];
  else state.likes[item.id] = item;
  persist();
  renderConstellation();
  if (!el.nowPlaying.classList.contains('hidden')) el.likeTrack.textContent = state.likes[item.id] ? '💖' : '💜';
}

function renderConstellation() {
  const liked = Object.values(state.likes);
  if (!liked.length) return el.constellation.classList.add('hidden');
  el.constellation.classList.remove('hidden');
  el.constellation.textContent = `Constellation: ${liked.slice(0, 5).map((x) => x.title).join(' • ')}${liked.length > 5 ? ' …' : ''}`;
}

function closeSheetsOnBackdrop(sheet, event) {
  if (event.target === sheet) sheet.classList.add('hidden');
}

function bindUI() {
  let sx = 0; let sy = 0; let lastX = 0; let lastT = 0; let vx = 0;

  el.saveProfile.addEventListener('click', saveProfile);
  el.profileName.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveProfile(); });

  const onStart = (x, y) => { sx = lastX = x; sy = y; lastT = performance.now(); vx = 0; };
  const onMove = (x, y) => {
    const now = performance.now();
    const dx = x - sx;
    const dy = y - sy;
    vx = (x - lastX) / Math.max(now - lastT, 1);
    lastX = x;
    lastT = now;

    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
      shift(dx < 0 ? 1 : -1);
      sx = x;
    }
    if (Math.abs(dy) > 95 && Math.abs(dy) > Math.abs(dx)) {
      cycleSection(dy < 0 ? 1 : -1);
      sy = y;
    }
  };
  const onEnd = () => {
    const steps = Math.min(4, Math.floor(Math.abs(vx) * 12));
    const dir = vx < 0 ? 1 : -1;
    for (let i = 0; i < steps; i += 1) setTimeout(() => shift(dir), i * 70);
  };

  el.carousel.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.carousel.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.carousel.addEventListener('touchend', onEnd, { passive: true });

  document.querySelectorAll('.bottom-nav button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelector('.bottom-nav .active')?.classList.remove('active');
      btn.classList.add('active');
      await loadSection(btn.dataset.section);
    });
  });

  document.getElementById('openFilters').addEventListener('click', () => el.filterSheet.classList.toggle('hidden'));
  document.getElementById('openSettings').addEventListener('click', () => el.settingsSheet.classList.toggle('hidden'));
  document.getElementById('closePlayer').addEventListener('click', () => el.nowPlaying.classList.add('hidden'));

  document.getElementById('applyFilters').addEventListener('click', async () => {
    state.filters = { mood: el.moodFilter.value, era: el.eraFilter.value, category: el.categoryFilter.value };
    setMood(state.filters.mood);
    el.filterSheet.classList.add('hidden');
    await loadSection(state.section);
  });

  document.getElementById('clearState').addEventListener('click', async () => {
    state.likes = {};
    state.playlists = {};
    state.cachedCovers = {};
    persist();
    renderConstellation();
    await loadSection(state.section);
  });

  document.getElementById('resetProfile').addEventListener('click', () => {
    el.settingsSheet.classList.add('hidden');
    el.profileName.value = state.profile?.name || '';
    el.profileSheet.classList.remove('hidden');
  });

  el.showLyrics.addEventListener('change', () => { state.settings.showLyrics = el.showLyrics.checked; persist(); });
  el.motionBoost.addEventListener('change', () => { state.settings.motionBoost = el.motionBoost.checked; persist(); });
  el.playPause.addEventListener('click', () => (el.audio.paused ? el.audio.play().catch(() => {}) : el.audio.pause()));
  document.getElementById('prevTrack').addEventListener('click', () => navigateTrack(-1));
  document.getElementById('nextTrack').addEventListener('click', () => navigateTrack(1));
  el.likeTrack.addEventListener('click', () => toggleLike(state.items[state.playingIndex]));

  [el.profileSheet, el.filterSheet, el.settingsSheet].forEach((sheet) => {
    sheet.addEventListener('click', (e) => closeSheetsOnBackdrop(sheet, e));
  });

  let py = 0;
  el.nowPlaying.addEventListener('touchstart', (e) => { py = e.touches[0].clientY; }, { passive: true });
  el.nowPlaying.addEventListener('touchend', (e) => {
    const dy = e.changedTouches[0].clientY - py;
    if (dy > 80) el.nowPlaying.classList.add('hidden');
    if (Math.abs(dy) < 30 && e.changedTouches[0].clientX < 130) navigateTrack(-1);
    if (Math.abs(dy) < 30 && e.changedTouches[0].clientX > window.innerWidth - 130) navigateTrack(1);
  }, { passive: true });
}

function navigateTrack(dir) {
  if (!state.items.length) return;
  state.playingIndex = (state.playingIndex + dir + state.items.length) % state.items.length;
  openPlayerByIndex(state.playingIndex);
}

function cycleSection(dir) {
  const sections = ['songs', 'albums', 'playlists', 'radio', 'likes'];
  const next = (sections.indexOf(state.section) + dir + sections.length) % sections.length;
  document.querySelector(`.bottom-nav button[data-section='${sections[next]}']`)?.click();
}

function setMood(mood) {
  const map = {
    Melancholy: ['#220f45', '#0a2a40'],
    Hype: ['#4a1515', '#320d4b'],
    Dreamy: ['#243f97', '#0a4f67']
  };
  const [a, b] = map[mood] || ['#5227be', '#0f4b95'];
  document.querySelector('.galaxy').style.background = `radial-gradient(circle at 20% 20%, ${a} 0%, transparent 35%),radial-gradient(circle at 80% 60%, ${b} 0%, transparent 35%),radial-gradient(circle at 40% 85%, #1b2f69 0%, transparent 28%),linear-gradient(170deg,#05050d,#091224)`;
}

function animateBackground() {
  gsap.to('.stars-front', { y: -30, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  gsap.to('.stars-back', { y: -16, duration: 16, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

bootstrap();
