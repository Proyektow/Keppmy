/**
 * Desk Orbit • Clock & Now Playing (Cylinder 3D Navigation)
 */

// 1. Navegación Cilindro / Libro
let currentPage = 0; // 0 = Reloj, 1 = Spotify
const cylinder = document.getElementById('cylinder');
const dots = document.querySelectorAll('.dot');
const glowBg = document.getElementById('ambient-glow');

function updateCylinder() {
  const angle = currentPage * -180;
  cylinder.style.transform = `rotateY(${angle}deg)`;

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentPage);
  });

  // Si estamos en reloj, el fondo vuelve al modo deep black para descansar
  if (currentPage === 0) {
    glowBg.style.opacity = '0.15';
  } else {
    glowBg.style.opacity = '0.65';
  }
}

function rotateBook(direction) {
  currentPage = (currentPage + direction + 2) % 2;
  updateCylinder();
}

function goToPage(index) {
  currentPage = index;
  updateCylinder();
}

// Soporte Swipe táctil (arrastrar con el dedo horizontalmente)
let startX = 0;
window.addEventListener('touchstart', (e) => {
  startX = e.touches[0].clientX;
});

window.addEventListener('touchend', (e) => {
  const diffX = e.changedTouches[0].clientX - startX;
  if (Math.abs(diffX) > 60) {
    rotateBook(diffX > 0 ? -1 : 1);
  }
});

// 2. Pantalla completa real sin barra de estado
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// 3. Reloj en tiempo real
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  document.getElementById('hours-mins').textContent = `${h}:${m}`;
  document.getElementById('seconds').textContent = s;

  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  document.getElementById('date-label').textContent = now.toLocaleDateString('es-ES', opts);
}
setInterval(updateClock, 1000);
updateClock();

// 4. Integración Spotify PKCE
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
let isPlaying = false;
let curDuration = 0;
let curProgress = 0;
let progressInterval = null;

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function loginSpotify() {
  const clientId = document.getElementById('client-id-input').value.trim();
  if (!clientId) return alert("Introduce tu Spotify Client ID.");

  localStorage.setItem('spotify_client_id', clientId);
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem('code_verifier', verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const clientId = localStorage.getItem('spotify_client_id');
  const verifier = localStorage.getItem('code_verifier');

  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier
  });

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_refresh_token', data.refresh_token);
      window.history.replaceState({}, document.title, window.location.pathname);
      initPlayer();
    }
  } catch (e) {
    console.error("Token error:", e);
  }
}

async function fetchNowPlaying() {
  const token = localStorage.getItem('spotify_access_token');
  if (!token) return;

  try {
    const res = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 204 || res.status === 202) {
      document.getElementById('track-name').textContent = "Pausado / Sin música activa";
      document.getElementById('track-artist').textContent = "Abre Spotify en tu ordenador o móvil";
      document.getElementById('eq-indicator').style.display = 'none';
      return;
    }

    if (res.status === 401) {
      localStorage.removeItem('spotify_access_token');
      showAuth();
      return;
    }

    const data = await res.json();
    if (data && data.item) {
      renderTrack(data);
    }
  } catch (e) {}
}

function renderTrack(data) {
  const item = data.item;
  isPlaying = data.is_playing;
  curDuration = item.duration_ms;
  curProgress = data.progress_ms;

  document.getElementById('track-name').textContent = item.name;
  document.getElementById('track-artist').textContent = item.artists.map(a => a.name).join(', ');
  document.getElementById('track-album').textContent = item.album.name;

  const artUrl = item.album.images[0]?.url || '';
  if (artUrl) {
    document.getElementById('track-art').src = artUrl;
    glowBg.style.backgroundImage = `url('${artUrl}')`;
  }

  document.getElementById('btn-play-pause').textContent = isPlaying ? '⏸️' : '▶️';
  document.getElementById('eq-indicator').style.display = isPlaying ? 'flex' : 'none';

  if (data.device) {
    document.getElementById('device-label').textContent = `🔊 ${data.device.name} • ${data.device.volume_percent}%`;
  }

  document.getElementById('time-tot').textContent = formatMs(curDuration);
  updateProgressBar();
}

function updateProgressBar() {
  const perc = Math.min((curProgress / curDuration) * 100, 100);
  document.getElementById('progress-fill').style.width = `${perc}%`;
  document.getElementById('time-cur').textContent = formatMs(curProgress);
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function controlPlayback(action) {
  const token = localStorage.getItem('spotify_access_token');
  const method = (action === 'play' || action === 'pause') ? 'PUT' : 'POST';
  await fetch(`https://api.spotify.com/v1/me/player/${action}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });
  setTimeout(fetchNowPlaying, 400);
}

function togglePlayPause() {
  controlPlayback(isPlaying ? 'pause' : 'play');
}

function initPlayer() {
  document.getElementById('music-auth').style.display = 'none';
  document.getElementById('music-player').style.display = 'flex';

  fetchNowPlaying();
  setInterval(fetchNowPlaying, 2500);

  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (isPlaying && curProgress < curDuration) {
      curProgress += 1000;
      updateProgressBar();
    }
  }, 1000);
}

function showAuth() {
  document.getElementById('music-auth').style.display = 'block';
  document.getElementById('music-player').style.display = 'none';
  const savedId = localStorage.getItem('spotify_client_id');
  if (savedId) document.getElementById('client-id-input').value = savedId;
}

window.addEventListener('DOMContentLoaded', () => {
  const code = new URLSearchParams(window.location.search).get('code');
  const token = localStorage.getItem('spotify_access_token');

  if (code) exchangeCodeForToken(code);
  else if (token) initPlayer();
  else showAuth();
});

// Evitar que la pantalla se apague en el soporte
async function keepScreenAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch(e){}
}
keepScreenAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepScreenAwake();
});
