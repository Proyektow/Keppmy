/**
 * Desk Orbit • Clock, Scaled Spotify & Panda 2.5D House Architecture
 */

// ==========================================================
// 1. CONTROL DE VISTAS (CARRUSEL SIN ROTURA DE ZOOM)
// ==========================================================
let currentSlide = 0; // 0 = Reloj, 1 = Spotify, 2 = Casa Panda
const track = document.getElementById('carousel-track');
const dots = document.querySelectorAll('.dot');
const glowBg = document.getElementById('ambient-glow');

function updateSlideView() {
  track.style.transform = `translateX(-${currentSlide * 100}vw)`;

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentSlide);
  });

  if (currentSlide === 0) {
    glowBg.style.opacity = '0.12';
  } else if (currentSlide === 1) {
    glowBg.style.opacity = '0.65';
  } else {
    glowBg.style.opacity = '0.2';
  }
}

function rotateSlide(direction) {
  currentSlide = (currentSlide + direction + 3) % 3;
  updateSlideView();
}

function goToSlide(index) {
  currentSlide = index;
  updateSlideView();
}

// Swipe táctil horizontal fluido
let startX = 0;
window.addEventListener('touchstart', (e) => {
  startX = e.touches[0].clientX;
});

window.addEventListener('touchend', (e) => {
  const diffX = e.changedTouches[0].clientX - startX;
  if (Math.abs(diffX) > 50) {
    rotateSlide(diffX > 0 ? -1 : 1);
  }
});

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

// ==========================================================
// 2. RELOJ EN TIEMPO REAL
// ==========================================================
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

// ==========================================================
// 3. INTEGRACIÓN SPOTIFY NOW PLAYING
// ==========================================================
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
let isPlaying = false;
let curDuration = 0;
let curProgress = 0;
let progressInterval = null;

function generateRandomString(length) {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
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
    code,
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
      setPlayPauseButton(false);
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

  setPlayPauseButton(isPlaying);
  document.getElementById('eq-indicator').style.display = isPlaying ? 'flex' : 'none';

  if (data.device) {
    document.getElementById('device-label').textContent = `🔊 ${data.device.name} • ${data.device.volume_percent}%`;
  }

  document.getElementById('time-tot').textContent = formatMs(curDuration);
  updateProgressBar();
}

function setPlayPauseButton(playing) {
  document.getElementById('play-svg').style.display = playing ? 'none' : 'block';
  document.getElementById('pause-svg').style.display = playing ? 'block' : 'none';
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

// ==========================================================
// 4. SIMULACIÓN DE LA CASA DEL PANDA (VISTA DE PLANO 2.5D)
// ==========================================================
const panda = document.getElementById('panda-avatar');
const bubble = document.getElementById('panda-bubble');
const stateLabel = document.getElementById('panda-state-label');

// Coordenadas absolutas en % dentro de la planta de la casa
const HOUSE_COORDS = {
  bed:    { x: '24%', y: '28%', msg: 'Zzz... 😴', status: 'Durmiendo en la cama' },
  desk:   { x: '76%', y: '28%', msg: 'Compilando... 💻', status: 'En el setup gamer' },
  fridge: { x: '76%', y: '74%', msg: 'Comiendo bambú 🎋', status: 'Almorzando en la cocina' },
  bath:   { x: '24%', y: '74%', msg: 'Lavándome las patas 🧼', status: 'En el cuarto de baño' },
  hall:   { x: '50%', y: '50%', msg: 'Explorando... 🐾', status: 'Paseando por el pasillo' }
};

function movePandaTo(spotKey) {
  const target = HOUSE_COORDS[spotKey];
  if (!target) return;

  panda.style.left = target.x;
  panda.style.top = target.y;

  bubble.textContent = target.msg;
  stateLabel.textContent = target.status;
}

function forcePandaAction(spotKey) {
  movePandaTo(spotKey);
}

// Ciclo de vida autónomo: cambia de habitación cada 15 segundos
function runHouseCycle() {
  const spots = ['bed', 'desk', 'fridge', 'bath', 'hall'];
  setInterval(() => {
    const hour = new Date().getHours();
    // Prioridad nocturna para ir a la cama
    if (hour >= 23 || hour < 7) {
      if (Math.random() > 0.25) {
        movePandaTo('bed');
        return;
      }
    }
    const nextSpot = spots[Math.floor(Math.random() * spots.length)];
    movePandaTo(nextSpot);
  }, 15000);
}

runHouseCycle();

// ==========================================================
// 5. INICIALIZACIÓN GENERAL & WAKE LOCK
// ==========================================================
window.addEventListener('DOMContentLoaded', () => {
  const code = new URLSearchParams(window.location.search).get('code');
  const token = localStorage.getItem('spotify_access_token');

  if (code) exchangeCodeForToken(code);
  else if (token) initPlayer();
  else showAuth();

  // Posición inicial del panda
  movePandaTo('hall');
});

async function keepScreenAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch(e){}
}
keepScreenAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepScreenAwake();
});
