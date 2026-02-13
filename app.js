const API_BASE = 'https://juicewrldapi.com/juicewrld';
const STORAGE_KEY = 'wrld.rebuild.v2';

const state = {
  tracks: [],
  filteredTracks: [],
  currentIndex: -1,
  likes: {},
  lyricMap: [],
  isSeeking: false,
  filters: { era: '', category: '' },
  filterOptions: { eras: [], categories: [] }
};

const el = {
  trackList: document.getElementById('trackList'),
  countLabel: document.getElementById('countLabel'),
  subtitle: document.getElementById('subtitle'),
  eraFilter: document.getElementById('eraFilter'),
  categoryFilter: document.getElementById('categoryFilter'),
  clearFilters: document.getElementById('clearFilters'),
  cover: document.getElementById('cover'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  seek: document.getElementById('seek'),
  currentTime: document.getElementById('currentTime'),
  duration: document.getElementById('duration'),
  prevBtn: document.getElementById('prevBtn'),
  playBtn: document.getElementById('playBtn'),
  nextBtn: document.getElementById('nextBtn'),
  likeBtn: document.getElementById('likeBtn'),
  shuffleBtn: document.getElementById('shuffleBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  lyricsBtn: document.getElementById('lyricsBtn'),
  lyricsSheet: document.getElementById('lyricsSheet'),
  lyricsLines: document.getElementById('lyricsLines'),
  lyricsTrack: document.getElementById('lyricsTrack'),
  closeLyrics: document.getElementById('closeLyrics'),
  audio: document.getElementById('audio'),
  leftTap: document.getElementById('leftTap'),
  rightTap: document.getElementById('rightTap')
};

const safeJson = (str, fallback) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

async function fetchJson(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

const absoluteUrl = (url) => (url && url.startsWith('http') ? url : `https://juicewrldapi.com${url || ''}`);

function mapSong(song) {
  return {
    id: String(song.id || crypto.randomUUID()),
    title: song.name || song.title || 'Untitled',
    artist: song.credited_artists || 'Juice WRLD',
    durationRaw: song.length || '--:--',
    path: song.path || '',
    lyrics: song.lyrics || '',
    era: song.era?.name || 'Unknown era',
    category: song.category || song.category_name || '',
    cover: absoluteUrl(song.cover_art_url || song.cover_art || song.image_url)
  };
}

function uniqueByTitle(items) {
  const seen = new Set();
  return items.filter((track) => {
    const key = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackCover(track) {
  const hue = (track.title.length * 19 + track.artist.length * 13) % 360;
  return `linear-gradient(140deg, hsl(${hue} 75% 52%), hsl(${(hue + 80) % 360} 75% 45%))`;
}

function loadStorage() {
  const stored = safeJson(localStorage.getItem(STORAGE_KEY), {});
  state.likes = stored.likes || {};
  state.filters = { ...state.filters, ...(stored.filters || {}) };
}

function saveStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ likes: state.likes, filters: state.filters }));
}

function formatTime(total) {
  if (!Number.isFinite(total)) return '0:00';
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderList() {
  el.trackList.innerHTML = '';
  el.countLabel.textContent = `${state.filteredTracks.length} tracks`;

  if (!state.filteredTracks.length) {
    el.trackList.innerHTML = '<p class="status">No songs match your current filters.</p>';
    return;
  }

  state.filteredTracks.forEach((track, index) => {
    const row = document.createElement('button');
    row.className = `track-row ${index === state.currentIndex ? 'active' : ''}`;
    row.type = 'button';
    row.innerHTML = `
      <span class="row-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="row-meta">
        <strong>${track.title}</strong>
        <small>${track.artist} • ${track.era}</small>
      </span>
      <span class="row-like">${state.likes[track.id] ? '♥' : '♡'}</span>
    `;
    row.addEventListener('click', () => openTrack(index, true));
    el.trackList.appendChild(row);
  });
}

function updateLikeButton(track) {
  const liked = !!state.likes[track?.id];
  el.likeBtn.textContent = liked ? '♥ Liked' : '♡ Like';
  el.likeBtn.classList.toggle('liked', liked);
}

function buildLyricTimeline(lyrics, durationSeconds) {
  const lines = lyrics.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const total = Number.isFinite(durationSeconds) && durationSeconds > 1 ? durationSeconds : lines.length * 3;
  const section = total / lines.length;
  return lines.map((line, i) => ({ line, from: i * section, to: (i + 1) * section }));
}

function renderLyrics(lines) {
  el.lyricsLines.innerHTML = '';
  if (!lines.length) {
    el.lyricsLines.innerHTML = '<p class="empty">No lyrics available for this song yet.</p>';
    return;
  }
  lines.forEach((entry, idx) => {
    const p = document.createElement('p');
    p.className = 'lyric-line';
    p.dataset.index = String(idx);
    p.textContent = entry.line;
    el.lyricsLines.appendChild(p);
  });
}

function syncLyrics() {
  if (!state.lyricMap.length) return;
  const t = el.audio.currentTime || 0;
  const activeIndex = state.lyricMap.findIndex((line) => t >= line.from && t < line.to);
  if (activeIndex < 0) return;

  const activeEl = el.lyricsLines.querySelector(`.lyric-line[data-index='${activeIndex}']`);
  el.lyricsLines.querySelectorAll('.lyric-line.active').forEach((node) => node.classList.remove('active'));
  if (activeEl) {
    activeEl.classList.add('active');
    activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderCurrentTrack() {
  const track = state.filteredTracks[state.currentIndex];
  if (!track) {
    el.title.textContent = 'Pick a song';
    el.artist.textContent = 'Tap any track to start';
    el.cover.removeAttribute('src');
    el.cover.style.background = '#0f1328';
    el.lyricsTrack.textContent = '';
    renderLyrics([]);
    return;
  }

  el.title.textContent = track.title;
  el.artist.textContent = `${track.artist} • ${track.era}`;
  el.lyricsTrack.textContent = `${track.title} — ${track.artist}`;
  updateLikeButton(track);

  if (track.cover) {
    el.cover.src = track.cover;
    el.cover.style.background = '#0f1328';
  } else {
    el.cover.removeAttribute('src');
    el.cover.style.background = fallbackCover(track);
  }
}

function setPlayIcon() {
  el.playBtn.textContent = el.audio.paused ? '▶' : '⏸';
}

function openTrack(index, autoplay = false) {
  if (index < 0 || index >= state.filteredTracks.length) return;
  state.currentIndex = index;
  const track = state.filteredTracks[index];
  renderList();
  renderCurrentTrack();

  if (track.path) {
    el.audio.src = `${API_BASE}/files/download/?path=${encodeURIComponent(track.path)}`;
    el.audio.load();
    if (autoplay) el.audio.play().catch(() => setPlayIcon());
  }
}

function nextTrack(step = 1, autoplay = true) {
  if (!state.filteredTracks.length) return;
  const nextIndex = (state.currentIndex + step + state.filteredTracks.length) % state.filteredTracks.length;
  openTrack(nextIndex, autoplay);
}

function toggleLike() {
  const track = state.filteredTracks[state.currentIndex];
  if (!track) return;
  if (state.likes[track.id]) delete state.likes[track.id];
  else state.likes[track.id] = true;
  saveStorage();
  renderList();
  updateLikeButton(track);
}

function shuffleQueue() {
  state.filteredTracks = [...state.filteredTracks]
    .map((track) => ({ track, score: Math.random() }))
    .sort((a, b) => a.score - b.score)
    .map(({ track }) => track);
  state.currentIndex = 0;
  renderList();
  openTrack(0, false);
}

function fillFilterOptions() {
  el.eraFilter.innerHTML = '<option value="">All eras</option>';
  state.filterOptions.eras.forEach((era) => {
    if (era?.name) el.eraFilter.add(new Option(era.name, era.name));
  });

  el.categoryFilter.innerHTML = '<option value="">All categories</option>';
  state.filterOptions.categories.forEach((category) => {
    if (category?.label && category?.value) el.categoryFilter.add(new Option(category.label, category.value));
  });

  el.eraFilter.value = state.filters.era;
  el.categoryFilter.value = state.filters.category;
}

function applyFilters() {
  state.filters.era = el.eraFilter.value;
  state.filters.category = el.categoryFilter.value;

  state.filteredTracks = state.tracks.filter((track) => {
    const eraMatch = !state.filters.era || track.era === state.filters.era;
    const categoryMatch = !state.filters.category || track.category === state.filters.category;
    return eraMatch && categoryMatch;
  });

  state.currentIndex = state.filteredTracks.length ? 0 : -1;
  renderList();
  renderCurrentTrack();
  if (state.currentIndex >= 0) openTrack(0, false);
  saveStorage();
}

async function loadMetadata() {
  const [erasRaw, categoriesRaw] = await Promise.all([
    fetchJson('/eras/').catch(() => []),
    fetchJson('/categories/').catch(() => ({ categories: [] }))
  ]);

  const eras = Array.isArray(erasRaw) ? erasRaw : erasRaw?.results || [];
  const categories = Array.isArray(categoriesRaw?.categories) ? categoriesRaw.categories : [];

  state.filterOptions.eras = eras;
  state.filterOptions.categories = categories;
  fillFilterOptions();
}

function bindEvents() {
  el.playBtn.addEventListener('click', () => {
    if (!el.audio.src && state.filteredTracks.length) openTrack(Math.max(0, state.currentIndex), true);
    else if (el.audio.paused) el.audio.play().catch(() => {});
    else el.audio.pause();
  });

  el.prevBtn.addEventListener('click', () => nextTrack(-1, true));
  el.nextBtn.addEventListener('click', () => nextTrack(1, true));
  el.likeBtn.addEventListener('click', toggleLike);
  el.shuffleBtn.addEventListener('click', shuffleQueue);
  el.refreshBtn.addEventListener('click', init);

  el.eraFilter.addEventListener('change', applyFilters);
  el.categoryFilter.addEventListener('change', applyFilters);
  el.clearFilters.addEventListener('click', () => {
    state.filters = { era: '', category: '' };
    fillFilterOptions();
    applyFilters();
  });

  el.audio.addEventListener('play', setPlayIcon);
  el.audio.addEventListener('pause', setPlayIcon);
  el.audio.addEventListener('ended', () => nextTrack(1, true));
  el.audio.addEventListener('loadedmetadata', () => {
    el.duration.textContent = formatTime(el.audio.duration);
    const track = state.filteredTracks[state.currentIndex];
    state.lyricMap = buildLyricTimeline(track?.lyrics || '', el.audio.duration);
    renderLyrics(state.lyricMap);
  });

  el.audio.addEventListener('timeupdate', () => {
    if (!state.isSeeking) el.seek.value = String(el.audio.currentTime || 0);
    el.seek.max = String(el.audio.duration || 100);
    el.currentTime.textContent = formatTime(el.audio.currentTime);
    el.duration.textContent = formatTime(el.audio.duration);
    syncLyrics();
  });

  el.seek.addEventListener('input', () => {
    state.isSeeking = true;
    el.currentTime.textContent = formatTime(Number(el.seek.value));
  });

  el.seek.addEventListener('change', () => {
    el.audio.currentTime = Number(el.seek.value || 0);
    state.isSeeking = false;
  });

  el.lyricsBtn.addEventListener('click', () => el.lyricsSheet.classList.remove('hidden'));
  el.closeLyrics.addEventListener('click', () => el.lyricsSheet.classList.add('hidden'));
  el.lyricsSheet.addEventListener('click', (event) => {
    if (event.target === el.lyricsSheet) el.lyricsSheet.classList.add('hidden');
  });

  el.leftTap.addEventListener('click', () => nextTrack(-1, true));
  el.rightTap.addEventListener('click', () => nextTrack(1, true));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') nextTrack(-1, true);
    if (event.key === 'ArrowRight') nextTrack(1, true);
    if (event.key === ' ') {
      event.preventDefault();
      el.playBtn.click();
    }
  });
}

async function init() {
  el.subtitle.textContent = 'Loading songs...';
  el.trackList.innerHTML = '<p class="status">Loading tracks from API...</p>';

  try {
    loadStorage();
    await loadMetadata();
    const data = await fetchJson('/songs/', {
      page_size: 80,
      page: 1
    }).catch(() => ({ results: [] }));

    state.tracks = uniqueByTitle((data.results || []).map(mapSong));
    state.filteredTracks = [...state.tracks];

    if (!state.tracks.length) {
      el.trackList.innerHTML = '<p class="status">No tracks were returned from the API.</p>';
      el.subtitle.textContent = 'No tracks available.';
      return;
    }

    applyFilters();
    el.subtitle.textContent = 'Side-tap left/right to skip. Use era/category filters above queue.';
  } catch (error) {
    el.trackList.innerHTML = `<p class="status">Could not load songs. ${error.message}</p>`;
    el.subtitle.textContent = 'Connection issue. Tap refresh to retry.';
  }
}

bindEvents();
init();
