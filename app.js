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
  filters: { mood: '', era: '', category: '' },
  filterOptions: { eras: [], categories: [] },
  autoRandomized: false,
  shifting: false,
  swipeQueue: [],
  swipeDeck: [],
  swipeIndex: 0
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
  motionBoost: document.getElementById('motionBoost'),
  swipeMode: document.getElementById('swipeMode'),
  swipeCard: document.getElementById('swipeCard'),
  swipeCover: document.getElementById('swipeCover'),
  swipeTitle: document.getElementById('swipeTitle'),
  swipeArtist: document.getElementById('swipeArtist'),
  swipeNo: document.getElementById('swipeNo'),
  swipeYes: document.getElementById('swipeYes'),
  previewSeek: document.getElementById('previewSeek'),
  previewTime: document.getElementById('previewTime')
};

const safeJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const asObject = (value) => (value && typeof value === 'object' ? value : {});
const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({
  profile: state.profile,
  likes: state.likes,
  playlists: state.playlists,
  cachedCovers: state.cachedCovers,
  settings: state.settings,
  swipeQueue: state.swipeQueue
}));

const deviceFingerprint = () => `${navigator.userAgent}|${navigator.platform}|${navigator.language}`;

const fetchJson = async (path, params = {}) => {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
const uniqueByTitle = (list) => [...new Map(list.map((x) => [String(x.title).toLowerCase(), x])).values()];
const pickRandom = (list) => (list.length ? list[Math.floor(Math.random() * list.length)] : '');

function applyAutoRandomFilters() {
  if (state.autoRandomized) return;
  const moods = ['Melancholy', 'Hype', 'Dreamy', ''];
  state.filters = {
    mood: pickRandom(moods),
    era: pickRandom(state.filterOptions.eras.map((x) => x.name).filter(Boolean)),
    category: pickRandom(state.filterOptions.categories.map((x) => x.value).filter(Boolean))
  };
  state.autoRandomized = true;
  el.moodFilter.value = state.filters.mood;
  el.eraFilter.value = state.filters.era;
  el.categoryFilter.value = state.filters.category;
  setMood(state.filters.mood);
}

async function getRandomSong() {
  const data = await fetchJson('/radio/random/').catch(() => null);
  const song = data?.song || data;
  return song ? mapSong(song) : null;
}

async function getUniqueRandomSong(excludedIds, excludedTitles) {
  for (let i = 0; i < 6; i += 1) {
    const pick = await getRandomSong();
    if (pick && !excludedIds.has(pick.id) && !excludedTitles.has(String(pick.title).toLowerCase())) return pick;
  }
  return null;
}

async function bootstrap() {
  window.setTimeout(() => el.launchFade?.remove(), 2800);
  try {
    hydrate();
    bindUI();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    await loadFilterMetadata();
    applyAutoRandomFilters();
    await loadSection('songs');
    animateBackground();
    updateProfileBadge();
    maybeShowProfileSheet();
    gsap.to(el.launchFade, { opacity: 0, duration: 1.1, onComplete: () => el.launchFade?.remove() });
  } catch (error) {
    console.error('Bootstrap failed', error);
    el.launchFade?.remove();
  }
}

function hydrate() {
  const stored = asObject(safeJson(localStorage.getItem(STORAGE_KEY), {}));
  state.profile = stored.profile || null;
  Object.assign(state.likes, stored.likes || {});
  Object.assign(state.playlists, stored.playlists || {});
  Object.assign(state.cachedCovers, stored.cachedCovers || {});
  Object.assign(state.settings, stored.settings || {});
  state.swipeQueue = Array.isArray(stored.swipeQueue) ? stored.swipeQueue : [];
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
  const [erasRaw, categoriesRaw] = await Promise.all([
    fetchJson('/eras/').catch(() => []),
    fetchJson('/categories/').catch(() => ({ categories: [] }))
  ]);
  const eras = Array.isArray(erasRaw) ? erasRaw : (erasRaw?.results || []);
  const categories = Array.isArray(categoriesRaw?.categories) ? categoriesRaw.categories : [];
  state.filterOptions.eras = eras;
  state.filterOptions.categories = categories;
  eras.slice(0, 60).forEach((era) => era?.name && el.eraFilter.add(new Option(era.name, era.name)));
  categories.forEach((c) => c?.label && c?.value && el.categoryFilter.add(new Option(c.label, c.value)));
}

async function loadSection(section) {
  state.section = section;
  state.index = 0;
  let items = [];

  if (section === 'swipe') {
    const data = await fetchJson('/songs/', { page: 1, page_size: 30 }).catch(() => ({ results: [] }));
    items = uniqueByTitle(shuffle((data.results || []).map(mapSong))).slice(0, 24);
    state.swipeDeck = items;
    state.swipeIndex = 0;
    el.sectionTitle.textContent = 'Swipe Queue';
    el.sectionSubtitle.textContent = 'Swipe left to skip, right to queue';
  } else if (section === 'radio') {
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

    items = uniqueByTitle(shuffle((data.results || []).map(mapSong)));
    if (section === 'albums') items = groupByEra(items);
    if (section === 'playlists') items = asPlaylists(items);
    el.sectionTitle.textContent = section[0].toUpperCase() + section.slice(1);
    el.sectionSubtitle.textContent = state.filters.era || 'Drift through your universe';
  }

  if (!items.length && (section === 'songs' || section === 'radio')) {
    const fallbackRandom = await Promise.all(Array.from({ length: 14 }, () => getRandomSong()));
    items = fallbackRandom.filter(Boolean);
    el.sectionSubtitle.textContent = 'Random orbit sync online';
  }

  if (section === 'swipe') {
    el.carousel.classList.add('hidden');
    el.swipeMode.classList.remove('hidden');
    renderSwipeCard();
    renderConstellation();
    return;
  }

  el.carousel.classList.remove('hidden');
  el.swipeMode.classList.add('hidden');
  state.items = uniqueByTitle(shuffle(items)).slice(0, 14);
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
  // native horizontal scroll carousel
}

function layoutCards() {}


async function shift() {}


function openPlayerByIndex(i) {
  if (!state.items.length) return;
  state.playingIndex = i;
  const item = state.items[i];
  el.nowPlaying.classList.remove('hidden');
  el.playerCover.src = item.cover;
  el.playerTitle.textContent = item.title;
  el.playerArtist.textContent = item.artist;
  el.likeTrack.textContent = state.likes[item.id] ? 'Liked' : 'Like';
  const hue = (String(item.id).length * 87) % 360;
  el.playerGlow.style.background = `radial-gradient(circle, hsl(${hue} 80% 60%) 0%, transparent 70%)`;
  el.lyrics.innerHTML = '';

  if (state.settings.showLyrics && item.lyrics) showLyrics(item.lyrics);
  if (item.path) {
    el.audio.src = `${API_BASE}/files/download/?path=${encodeURIComponent(item.path)}`;
    el.audio.play().then(() => { el.playPause.textContent = 'Pause'; }).catch(() => { el.playPause.textContent = 'Play'; });
  } else {
    el.audio.pause();
    el.playPause.textContent = 'Play';
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
  if (!el.nowPlaying.classList.contains('hidden')) el.likeTrack.textContent = state.likes[item.id] ? 'Liked' : 'Like';
}

function renderConstellation() {
  const liked = Object.values(state.likes);
  if (!liked.length) return el.constellation.classList.add('hidden');
  el.constellation.classList.remove('hidden');
  el.constellation.textContent = `Constellation: ${liked.slice(0, 5).map((x) => x.title).join(' • ')}${liked.length > 5 ? ' …' : ''}`;
}


function formatClock(sec) {
  if (!Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderSwipeCard() {
  const item = state.swipeDeck[state.swipeIndex];
  if (!item) {
    el.swipeTitle.textContent = 'No more songs';
    el.swipeArtist.textContent = `Queued ${state.swipeQueue.length} songs`;
    el.swipeCover.src = 'icons/icon.svg';
    el.previewSeek.value = 0;
    el.previewTime.textContent = '0:00 / 0:00';
    el.audio.pause();
    return;
  }

  el.swipeCover.src = item.cover;
  el.swipeTitle.textContent = item.title;
  el.swipeArtist.textContent = item.artist;

  if (item.path) {
    el.audio.src = `${API_BASE}/files/download/?path=${encodeURIComponent(item.path)}`;
    const startAt = 45;
    const onMeta = () => {
      const duration = Number.isFinite(el.audio.duration) ? el.audio.duration : 0;
      el.audio.currentTime = Math.min(startAt, Math.max(duration - 5, 0));
      el.previewSeek.max = String(Math.max(duration, 1));
      el.previewSeek.value = String(el.audio.currentTime);
      el.previewTime.textContent = `${formatClock(el.audio.currentTime)} / ${formatClock(duration)}`;
      el.audio.play().catch(() => {});
      el.audio.removeEventListener('loadedmetadata', onMeta);
    };
    el.audio.addEventListener('loadedmetadata', onMeta);
  }
}

function swipeDecision(accepted) {
  const item = state.swipeDeck[state.swipeIndex];
  if (!item) return;
  if (accepted) {
    state.swipeQueue.push(item);
    state.playlists.queue = state.swipeQueue;
  }
  state.swipeIndex += 1;
  persist();
  renderSwipeCard();
}

function closeSheetsOnBackdrop(sheet, event) {
  if (event.target === sheet) sheet.classList.add('hidden');
}

function bindUI() {
  el.saveProfile.addEventListener('click', saveProfile);
  el.profileName.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveProfile(); });

  el.swipeNo?.addEventListener('click', () => swipeDecision(false));
  el.swipeYes?.addEventListener('click', () => swipeDecision(true));
  el.previewSeek?.addEventListener('input', () => {
    const next = Number(el.previewSeek.value || 0);
    if (Number.isFinite(next)) {
      el.audio.currentTime = next;
      el.previewTime.textContent = `${formatClock(el.audio.currentTime)} / ${formatClock(el.audio.duration)}`;
    }
  });
  el.audio.addEventListener('timeupdate', () => {
    if (state.section !== 'swipe') return;
    el.previewSeek.value = String(el.audio.currentTime || 0);
    el.previewTime.textContent = `${formatClock(el.audio.currentTime)} / ${formatClock(el.audio.duration)}`;
  });

  let swipeStartX = 0;
  el.swipeCard?.addEventListener('touchstart', (e) => { swipeStartX = e.touches[0].clientX; }, { passive: true });
  el.swipeCard?.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (dx > 70) swipeDecision(true);
    if (dx < -70) swipeDecision(false);
  }, { passive: true });

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
  el.audio.addEventListener('play', () => { el.playPause.textContent = 'Pause'; });
  el.audio.addEventListener('pause', () => { el.playPause.textContent = 'Play'; });
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
  const sections = ['songs', 'albums', 'playlists', 'swipe', 'radio', 'likes'];
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

function animateBackground() {}

bootstrap();
