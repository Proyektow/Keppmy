/**
 * Desk Orbit • Clock, Modern Spotify & 3D Autonomous Panda Habitat
 */

// ==========================================================
// 1. NAVEGACIÓN EN PRISMA 3D (3 CARAS: 0°, 120°, 240°)
// ==========================================================
let currentFace = 0; // 0 = Reloj, 1 = Spotify, 2 = Panda Room
const prism = document.getElementById('prism');
const dots = document.querySelectorAll('.dot');
const glowBg = document.getElementById('ambient-glow');

function updatePrism() {
  const angle = currentFace * -120;
  prism.style.transform = `rotateY(${angle}deg)`;

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentFace);
  });

  // Atenuación de resplandor según la cara activa
  if (currentFace === 0) {
    glowBg.style.opacity = '0.12';
  } else if (currentFace === 1) {
    glowBg.style.opacity = '0.65';
  } else {
    glowBg.style.opacity = '0.25';
  }
}

function rotatePrism(direction) {
  currentFace = (currentFace + direction + 3) % 3;
  updatePrism();
}

function goToPage(index) {
  currentFace = index;
  updatePrism();
}

// Swipe táctil horizontal
let startX = 0;
window.addEventListener('touchstart', (e) => {
  startX = e.touches[0].clientX;
});

window.addEventListener('touchend', (e) => {
  const diffX = e.changedTouches[0].clientX - startX;
  if (Math.abs(diffX) > 60) {
    rotatePrism(diffX > 0 ? -1 : 1);
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
// 3. SPOTIFY NOW PLAYING CON BOTONES MODERNOS
// ==========================================================
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
      document.getElementById('track-artist').textContent = "Abre Spotify en tu PC o móvil";
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
// 4. MASCOTA AUTÓNOMA: PANDA 3D & HABITAT
// ==========================================================
const panda = document.getElementById('panda-avatar');
const bubble = document.getElementById('panda-bubble');
const stateLabel = document.getElementById('panda-state-label');

// Coordenadas relativas dentro de la habitación
const ROOM_COORDS = {
  center: { x: '50%', y: '50%', z: '18px', msg: 'Paseando... 🐾', status: 'Paseando por la sala' },
  bed:    { x: '24%', y: '32%', z: '25px', msg: 'Zzz... 😴', status: 'Durmiendo la siesta' },
  desk:   { x: '72%', y: '30%', z: '22px', msg: 'Compilando... 💻', status: 'Programando en el setup' },
  fridge: { x: '74%', y: '74%', z: '20px', msg: '¡Ñam bambú! 🎋', status: 'Comiendo en la cocina' },
  bath:   { x: '26%', y: '74%', z: '20px', msg: 'Hora del baño 🚿', status: 'En el aseo' }
};

let currentAction = 'center';

function movePandaTo(actionKey) {
  const target = ROOM_COORDS[actionKey];
  if (!target) return;

  currentAction = actionKey;
  panda.style.left = target.x;
  panda.style.top = target.y;
  panda.style.transform = `translate(-50%, -50%) translateZ(${target.z})`;

  bubble.textContent = target.msg;
  stateLabel.textContent = target.status;
}

function forcePandaAction(actionKey) {
  movePandaTo(actionKey);
}

// IA autónoma del Panda: decide cambiar de actividad cada 12-20 segundos
function runPandaLifeCycle() {
  const actions = ['center', 'bed', 'desk', 'fridge', 'bath'];
  setInterval(() => {
    // Si es de noche (después de las 23:00), preferencia por dormir
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 7) {
      if (Math.random() > 0.3) {
        movePandaTo('bed');
        return;
      }
    }

    const nextAction = actions[Math.floor(Math.random() * actions.length)];
    movePandaTo(nextAction);
  }, 16000);
}

runPandaLifeCycle();

// ==========================================================
// 5. INICIALIZACIÓN GENERAL & WAKE LOCK
// ==========================================================
window.addEventListener('DOMContentLoaded', () => {
  const code = new URLSearchParams(window.location.search).get('code');
  const token = localStorage.getItem('spotify_access_token');

  if (code) exchangeCodeForToken(code);
  else if (token) initPlayer();
  else showAuth();
});

async function keepScreenAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch(e){}
}
keepScreenAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepScreenAwake();
});
