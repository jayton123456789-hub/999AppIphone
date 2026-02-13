const API_BASE = 'https://juicewrldapi.com/juicewrld';
const STORAGE_KEY = 'wrld.rebuild.v3';

const state = {
  view: 'songs',
  tracks: [],
  radioTracks: [],
  visibleTracks: [],
  currentIndex: -1,
  likes: {},
  filters: { album: '' },
  albums: []
};

const el = {
  trackList: document.getElementById('trackList'),
  listTitle: document.getElementById('listTitle'),
  countLabel: document.getElementById('countLabel'),
  subtitle: document.getElementById('subtitle'),
  albumFilter: document.getElementById('albumFilter'),
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
  audio: document.getElementById('audio'),
  navButtons: [...document.querySelectorAll('.nav-btn')]
};

const safeJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const absoluteUrl = (url) => (url && url.startsWith('http') ? url : `https://juicewrldapi.com${url || ''}`);

function parseLength(lengthText) {
  if (!lengthText || typeof lengthText !== 'string') return null;
  const parts = lengthText.split(':').map((p) => Number(p));
  if (parts.some((v) => !Number.isFinite(v))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function mapSong(song) {
  return {
    id: String(song.id || crypto.randomUUID()),
    title: song.name || song.title || 'Untitled',
    artist: song.credited_artists || 'Juice WRLD',
    album: song.album?.name || song.album_name || song.album || 'Singles',
    category: song.category || song.category_name || '',
    cover: absoluteUrl(song.cover_art_url || song.cover_art || song.image_url),
    path: song.path || '',
    lengthSeconds: parseLength(song.length),
    bpm: Number(song.bpm || song.tempo || 92)
  };
}

async function fetchJson(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
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
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function setCoverSpin(track) {
  const bpm = Math.max(60, Math.min(180, Number(track?.bpm || 92)));
  const secondsPerRotation = (240 / bpm).toFixed(2);
  el.cover.style.setProperty('--spin-seconds', `${secondsPerRotation}s`);
}

function updateLikeButton(track) {
  const liked = !!state.likes[track?.id];
  el.likeBtn.textContent = liked ? '♥' : '♡';
  el.likeBtn.classList.toggle('liked', liked);
}

function setPlayIcon() {
  const paused = el.audio.paused;
  el.playBtn.textContent = paused ? '▶' : '⏸';
  el.cover.classList.toggle('spinning', !paused && !!el.audio.src);
}

function renderCurrentTrack() {
  const track = state.visibleTracks[state.currentIndex];
  if (!track) {
    el.title.textContent = 'Pick a song';
    el.artist.textContent = 'Tap any track to start';
    el.cover.removeAttribute('src');
    el.cover.classList.remove('spinning');
    updateLikeButton(null);
    return;
  }

  el.title.textContent = track.title;
  el.artist.textContent = `${track.artist} • ${track.album}`;
  el.cover.src = track.cover || 'icons/icon.svg';
  setCoverSpin(track);
  updateLikeButton(track);
}

function renderList() {
  el.trackList.innerHTML = '';
  el.countLabel.textContent = `${state.visibleTracks.length} tracks`;

  if (!state.visibleTracks.length) {
    const msg = state.view === 'likes'
      ? 'No liked songs yet.'
      : state.view === 'playlists'
        ? 'No playlist tracks available yet. Like songs to build one fast.'
        : state.view === 'radio'
          ? 'No radio songs loaded. Tap Refresh.'
          : 'No songs match the selected album.';
    el.trackList.innerHTML = `<p class="status">${msg}</p>`;
    return;
  }

  state.visibleTracks.forEach((track, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `track-row ${index === state.currentIndex ? 'active' : ''}`;
    row.innerHTML = `
      <span class="row-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="row-meta">
        <strong>${track.title}</strong>
        <small>${track.artist} • ${track.album}</small>
      </span>
      <span class="row-like">${state.likes[track.id] ? '♥' : '♡'}</span>
    `;
    row.addEventListener('click', () => openTrack(index, true));
    el.trackList.appendChild(row);
  });
}

function openTrack(index, autoplay = false) {
  if (index < 0 || index >= state.visibleTracks.length) return;
  state.currentIndex = index;
  const track = state.visibleTracks[index];

  renderList();
  renderCurrentTrack();

  if (!track.path) return;
  el.audio.src = `${API_BASE}/files/download/?path=${encodeURIComponent(track.path)}`;
  el.audio.load();
  if (autoplay) el.audio.play().catch(() => setPlayIcon());
}

function nextTrack(step = 1, autoplay = true) {
  if (!state.visibleTracks.length) return;
  const nextIndex = (state.currentIndex + step + state.visibleTracks.length) % state.visibleTracks.length;
  openTrack(nextIndex, autoplay);
}

function toggleLike() {
  const track = state.visibleTracks[state.currentIndex];
  if (!track) return;
  if (state.likes[track.id]) delete state.likes[track.id];
  else state.likes[track.id] = true;
  saveStorage();
  updateLikeButton(track);
  refreshView();
}

function shuffleQueue() {
  state.visibleTracks = [...state.visibleTracks]
    .map((track) => ({ track, score: Math.random() }))
    .sort((a, b) => a.score - b.score)
    .map(({ track }) => track);
  state.currentIndex = state.visibleTracks.length ? 0 : -1;
  renderList();
  if (state.currentIndex >= 0) openTrack(0, false);
}

function refreshAlbumFilter() {
  el.albumFilter.innerHTML = '<option value="">All albums</option>';
  state.albums.forEach((album) => {
    el.albumFilter.add(new Option(album, album));
  });
  el.albumFilter.value = state.filters.album;
}

function buildSongsView() {
  return state.tracks.filter((track) => !state.filters.album || track.album === state.filters.album);
}

function buildPlaylistsView() {
  const liked = state.tracks.filter((track) => state.likes[track.id]);
  return liked;
}

function refreshView() {
  if (state.view === 'songs') state.visibleTracks = buildSongsView();
  if (state.view === 'playlists') state.visibleTracks = buildPlaylistsView();
  if (state.view === 'likes') state.visibleTracks = state.tracks.filter((track) => state.likes[track.id]);
  if (state.view === 'radio') state.visibleTracks = [...state.radioTracks];

  if (state.currentIndex >= state.visibleTracks.length) state.currentIndex = 0;
  if (!state.visibleTracks.length) state.currentIndex = -1;

  renderList();
  renderCurrentTrack();
}

function setView(view) {
  state.view = view;
  state.currentIndex = state.visibleTracks.length ? 0 : -1;

  el.listTitle.textContent = view[0].toUpperCase() + view.slice(1);
  el.subtitle.textContent = view === 'songs' ? 'Songs' : `${el.listTitle.textContent} mode`;
  el.albumFilter.closest('label').style.display = view === 'songs' ? 'grid' : 'none';

  el.navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  refreshView();
}

async function loadRadio() {
  const radioData = await fetchJson('/radio/random/').catch(() => ({}));
  const list = Array.isArray(radioData?.results)
    ? radioData.results
    : Array.isArray(radioData)
      ? radioData
      : radioData?.song
        ? [radioData.song]
        : radioData?.track
          ? [radioData.track]
          : [];
  state.radioTracks = list.map(mapSong);
}

function bindEvents() {
  el.playBtn.addEventListener('click', () => {
    if (!el.audio.src && state.visibleTracks.length) openTrack(Math.max(0, state.currentIndex), true);
    else if (el.audio.paused) el.audio.play().catch(() => {});
    else el.audio.pause();
  });

  el.prevBtn.addEventListener('click', () => nextTrack(-1, true));
  el.nextBtn.addEventListener('click', () => nextTrack(1, true));
  el.likeBtn.addEventListener('click', toggleLike);
  el.shuffleBtn.addEventListener('click', shuffleQueue);

  el.albumFilter.addEventListener('change', () => {
    state.filters.album = el.albumFilter.value;
    saveStorage();
    refreshView();
  });

  el.refreshBtn.addEventListener('click', init);
  el.navButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  el.audio.addEventListener('play', setPlayIcon);
  el.audio.addEventListener('pause', setPlayIcon);
  el.audio.addEventListener('ended', () => nextTrack(1, true));
  el.audio.addEventListener('loadedmetadata', () => {
    el.duration.textContent = formatTime(el.audio.duration);
  });
  el.audio.addEventListener('timeupdate', () => {
    el.seek.max = String(el.audio.duration || 100);
    el.duration.textContent = formatTime(el.audio.duration);
    if (!Number.isNaN(el.audio.currentTime)) {
      el.currentTime.textContent = formatTime(el.audio.currentTime);
      el.seek.value = String(el.audio.currentTime || 0);
    }
  });

  el.seek.addEventListener('input', () => {
    el.currentTime.textContent = formatTime(Number(el.seek.value));
  });

  el.seek.addEventListener('change', () => {
    el.audio.currentTime = Number(el.seek.value || 0);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
      event.preventDefault();
      el.playBtn.click();
    }
  });
}

async function init() {
  el.subtitle.textContent = 'Loading...';
  el.trackList.innerHTML = '<p class="status">Loading tracks...</p>';

  try {
    loadStorage();

    const songsRaw = await fetchJson('/songs/', { page_size: 120, page: 1 }).catch(() => ({ results: [] }));
    state.tracks = (songsRaw.results || []).map(mapSong);

    state.albums = [...new Set(state.tracks.map((track) => track.album).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    refreshAlbumFilter();

    await loadRadio();
    setView(state.view);
  } catch (error) {
    el.trackList.innerHTML = `<p class="status">Could not load songs. ${error.message}</p>`;
    el.subtitle.textContent = 'Connection issue. Tap refresh.';
  }
}

bindEvents();
init();
