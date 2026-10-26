/**
 * Desk Orbit • Clock, Modern Spotify, Smart Calendar & Wandering Panda
 */

// ==========================================================
// 1. NAVEGACIÓN Y CARRUSEL
// ==========================================================
let currentSlide = 0; // 0 = Reloj, 1 = Spotify, 2 = Agenda
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
    glowBg.style.opacity = '0.22';
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

// Swipe táctil horizontal
let touchStartX = 0;
window.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
});

window.addEventListener('touchend', (e) => {
  const diffX = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(diffX) > 55) {
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
// 3. AGENDA DE EVENTOS & NOTIFICACIONES INTELIGENTES
// ==========================================================
let agendaEvents = JSON.parse(localStorage.getItem('orbit_calendar_events') || '[]');
const notifiedSet = new Set(); // Para no disparar la misma alerta dos veces

function saveAgenda() {
  localStorage.setItem('orbit_calendar_events', JSON.stringify(agendaEvents));
  renderAgendaList();
  evaluateUpcomingEvents();
}

function renderAgendaList() {
  const container = document.getElementById('events-scroll-container');
  const countBadge = document.getElementById('agenda-count-badge');
  container.innerHTML = '';

  countBadge.textContent = `${agendaEvents.length} eventos`;

  if (agendaEvents.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:24px;">No hay eventos. Añade uno con el formulario o sube tu .ics.</div>';
    return;
  }

  // Orden cronológico
  agendaEvents.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const now = new Date();

  agendaEvents.forEach((ev, idx) => {
    const evDate = new Date(`${ev.date}T${ev.time}:00`);
    const diffMinutes = Math.round((evDate - now) / 60000);
    const isUrgent = diffMinutes >= 0 && diffMinutes <= 30;

    const card = document.createElement('div');
    card.className = `agenda-card ${isUrgent ? 'urgent' : ''}`;

    let tagHtml = '';
    if (diffMinutes < 0) tagHtml = '<span class="urgency-tag" style="color:var(--text-muted); background:rgba(255,255,255,0.08);">Pasado</span>';
    else if (diffMinutes <= 10) tagHtml = '<span class="urgency-tag" style="color:#ef4444; background:rgba(239,68,68,0.18);">¡Ahora!</span>';
    else if (diffMinutes <= 60) tagHtml = `<span class="urgency-tag">en ${diffMinutes}m</span>`;

    card.innerHTML = `
      <div class="agenda-info">
        <h4>${ev.title}</h4>
        <p>📅 ${ev.date} • ${ev.time} hs</p>
      </div>
      <div class="card-right">
        ${tagHtml}
        <button class="btn-del-agenda" onclick="deleteAgendaItem(${idx})" title="Eliminar">&times;</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function handleManualEventSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('ev-title').value.trim();
  const date = document.getElementById('ev-date').value;
  const time = document.getElementById('ev-time').value;

  if (!title || !date || !time) return;

  agendaEvents.push({ title, date, time });
  saveAgenda();

  document.getElementById('ev-title').value = '';
}

function deleteAgendaItem(index) {
  agendaEvents.splice(index, 1);
  saveAgenda();
}

// Lector de archivos .ics
function handleIcsUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    parseIcsText(evt.target.result);
  };
  reader.readAsText(file);
}

function parseIcsText(data) {
  const lines = data.split(/\r\n|\n|\r/);
  let inEvent = false, curTitle = '', curDate = '', curTime = '12:00';
  let importedCount = 0;

  lines.forEach(line => {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true; curTitle = ''; curDate = ''; curTime = '12:00';
    } else if (line.startsWith('END:VEVENT')) {
      if (inEvent && curTitle && curDate) {
        if (!agendaEvents.some(e => e.title === curTitle && e.date === curDate)) {
          agendaEvents.push({ title: curTitle, date: curDate, time: curTime });
          importedCount++;
        }
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) curTitle = line.replace('SUMMARY:', '').trim();
      if (line.startsWith('DTSTART')) {
        const val = line.split(':')[1] || '';
        if (val.length >= 8) {
          curDate = `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
          if (val.length >= 13) curTime = `${val.slice(9,11)}:${val.slice(11,13)}`;
        }
      }
    }
  });

  saveAgenda();
  alert(`Se han importado ${importedCount} eventos desde el archivo .ics.`);
}

// Comprobador inteligente: evalúa proximidad cada 20 segundos
function evaluateUpcomingEvents() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Filtrar eventos futuros
  const upcoming = agendaEvents
    .map(e => ({ ...e, dt: new Date(`${e.date}T${e.time}:00`) }))
    .filter(e => e.dt >= now)
    .sort((a, b) => a.dt - b.dt);

  // 1. Actualizar píldora del reloj principal
  const pill = document.getElementById('quick-agenda-text');
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const diffMins = Math.round((next.dt - now) / 60000);
    pill.textContent = `Próximo: ${next.title} (${next.time} hs • en ${diffMins}m)`;
  } else {
    pill.textContent = "Sin citas para hoy";
  }

  // 2. Disparar notificación si faltan <= 15 minutos
  upcoming.forEach(ev => {
    const diffMins = Math.round((ev.dt - now) / 60000);
    const eventKey = `${ev.title}_${ev.date}_${ev.time}`;

    if (diffMins >= 0 && diffMins <= 15 && !notifiedSet.has(eventKey)) {
      notifiedSet.add(eventKey);
      triggerEventAlert(ev, diffMins);
    }
  });
}

// Disparar toast en pantalla + notificación del sistema + sonido sutil
function triggerEventAlert(ev, minsLeft) {
  // A. Banner Toast visual
  const toast = document.getElementById('event-toast');
  document.getElementById('toast-title').textContent = ev.title;
  document.getElementById('toast-meta').textContent = minsLeft === 0 ? '¡Comienza ahora mismo!' : `Empieza en ${minsLeft} minutos (${ev.time} hs)`;
  
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 7000);

  // B. Notificación nativa del móvil / navegador
  if (Notification.permission === 'granted') {
    new Notification(`Desk Orbit: ${ev.title}`, {
      body: `Cita a las ${ev.time}. Faltan ${minsLeft} minutos.`,
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E'
    });
  }

  // C. Sonido Chime de alerta generado al vuelo con Web Audio
  playChimeTone();
}

function playChimeTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.75);
  } catch(e) {}
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert("Este navegador no soporta notificaciones de sistema.");
    return;
  }
  Notification.requestPermission().then(permission => {
    const badge = document.getElementById('notif-badge');
    if (permission === 'granted') {
      badge.classList.add('active');
      alert("¡Notificaciones activadas! Te avisaremos cuando se acerque una cita.");
    }
  });
}

// ==========================================================
// 4. SPOTIFY NOW PLAYING (REAL PKCE + MODO DEMO)
// ==========================================================
// Limpia cualquier parámetro residual y asegura barra final normalizada
const getCleanRedirectUri = () => {
  let url = window.location.origin + window.location.pathname;
  if (!url.endsWith('/') && !url.endsWith('.html')) {
    url += '/';
  }
  return url;
};

const REDIRECT_URI = getCleanRedirectUri();
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
let isPlaying = false;
let curDuration = 180000;
let curProgress = 45000;
let progressInterval = null;
let isDemoMode = false;

function generateRandomString(len) {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
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

  // ESTA ALERTA TE DICE LA URL EXACTA:
  alert("COPIA ESTA URL EXACTA:\n" + REDIRECT_URI);

  localStorage.setItem('spotify_client_id', clientId);
  // ... resto de la función igual

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
  if (isDemoMode) return;
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
  if (isDemoMode) {
    if (action === 'play' || action === 'pause') {
      isPlaying = !isPlaying;
      setPlayPauseButton(isPlaying);
      document.getElementById('eq-indicator').style.display = isPlaying ? 'flex' : 'none';
    }
    return;
  }

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

function seekSong(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  curProgress = Math.floor(curDuration * ratio);
  updateProgressBar();
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

// Modo demo para probar sin credenciales
function activateDemoMusic() {
  isDemoMode = true;
  isPlaying = true;
  initPlayer();

  document.getElementById('track-name').textContent = "Midnight City (Desk Mix)";
  document.getElementById('track-artist').textContent = "M83 • Synthwave Orbit";
  document.getElementById('track-album').textContent = "Hurry Up, We're Dreaming";
  document.getElementById('track-art').src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80";
  glowBg.style.backgroundImage = "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80')";
  document.getElementById('device-label').textContent = "🔊 Desk Speakers • 85%";
  setPlayPauseButton(true);
}

// ==========================================================
// 5. PANDA VAGABUNDO EN EL FONDO (ANIMACIÓN & DEAMBULACIÓN)
// ==========================================================
const pandaWalker = document.getElementById('panda-walker');
const pandaThought = document.getElementById('panda-thought');

const PANDA_THOUGHTS = [
  '🎋 ¡Qué rico bambú!',
  '🐾 Ronda de mesa...',
  '🎵 Buen ritmo',
  '😴 ¿Toca siesta?',
  '👀 Vigilo tus tareas',
  '☕ Tómate un café',
  '✨ Modo Desk Orbit'
];

let pandaCurrentX = 20;

function wanderPanda() {
  // Elegir una nueva posición aleatoria entre 6% y 88% del ancho de pantalla
  const nextX = Math.floor(Math.random() * 80) + 8;
  const isWalkingLeft = nextX < pandaCurrentX;
  pandaCurrentX = nextX;

  pandaWalker.classList.toggle('walk-left', isWalkingLeft);
  pandaWalker.style.left = `${pandaCurrentX}%`;

  // Cambiar pensamiento ocasionalmente
  if (Math.random() > 0.4) {
    pandaThought.textContent = PANDA_THOUGHTS[Math.floor(Math.random() * PANDA_THOUGHTS.length)];
  }
}

function interactWithPanda() {
  pandaThought.textContent = '🐾 ¡Hola! Sigo patrullando';
  wanderPanda();
}

// Iniciar paseo del panda cada 7-12 segundos
setInterval(wanderPanda, 9000);

// ==========================================================
// 6. INICIALIZACIÓN GENERAL & WAKE LOCK
// ==========================================================
window.addEventListener('DOMContentLoaded', () => {
  const code = new URLSearchParams(window.location.search).get('code');
  const token = localStorage.getItem('spotify_access_token');

  if (code) exchangeCodeForToken(code);
  else if (token) initPlayer();
  else showAuth();

  // Fecha de hoy por defecto en el formulario
  document.getElementById('ev-date').value = new Date().toISOString().split('T')[0];

  renderAgendaList();
  evaluateUpcomingEvents();
  setInterval(evaluateUpcomingEvents, 20000); // Comprobar citas cada 20s

  if (Notification.permission === 'granted') {
    document.getElementById('notif-badge').classList.add('active');
  }
});

async function keepScreenAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch(e){}
}
keepScreenAwake();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepScreenAwake();
});
// ==========================================================
// CONTROL DE GESTOS EN EL AIRE (AIR GESTURE DETECTOR)
// ==========================================================
let airSensorEnabled = false;
let airStream = null;
let airInterval = null;
let previousBrightness = null;
let handCoverStartTime = null;
let lastGestureTime = 0;

const airVideo = document.getElementById('air-video');
const airCanvas = document.getElementById('air-canvas');
const airCtx = airCanvas.getContext('2d', { willReadFrequently: true });
const sensorBtn = document.getElementById('wave-sensor-btn');
const sensorDot = document.getElementById('sensor-active-dot');

async function toggleAirGestureSensor() {
  if (airSensorEnabled) {
    stopAirSensor();
  } else {
    await startAirSensor();
  }
}

async function startAirSensor() {
  try {
    airStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 64 },
        height: { ideal: 64 }
      },
      audio: false
    });

    airVideo.srcObject = airStream;
    await airVideo.play();

    airSensorEnabled = true;
    sensorBtn.classList.add('sensor-on');
    sensorDot.classList.add('active');

    // Analiza un micro-fotograma cada 75 ms (13 FPS, consumo casi nulo)
    airInterval = setInterval(processAirFrame, 75);

    if (navigator.vibrate) navigator.vibrate(50);
  } catch (err) {
    alert("No se pudo acceder a la cámara frontal para los gestos aéreos: " + err.message);
    stopAirSensor();
  }
}

function stopAirSensor() {
  airSensorEnabled = false;
  if (airInterval) clearInterval(airInterval);
  if (airStream) {
    airStream.getTracks().forEach(track => track.stop());
    airStream = null;
  }
  sensorBtn.classList.remove('sensor-on');
  sensorDot.classList.remove('active');
}

function processAirFrame() {
  if (!airVideo.videoWidth) return;

  // Dibuja la imagen reducida a 16x16 píxeles para calcular la luz
  airCtx.drawImage(airVideo, 0, 0, 16, 16);
  const frame = airCtx.getImageData(0, 0, 16, 16);
  const data = frame.data;

  let totalLuma = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Brillo percibido (fórmula ITU-R BT.601)
    totalLuma += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  const avgBrightness = totalLuma / (data.length / 4);

  const now = Date.now();

  if (previousBrightness !== null) {
    const diff = previousBrightness - avgBrightness;

    // Condición: La mano tapa la parte superior del móvil (caída brusca de luz)
    const isCovered = avgBrightness < 35 || diff > 40;

    if (isCovered) {
      if (!handCoverStartTime) {
        handCoverStartTime = now;
      } else {
        const coveredDuration = now - handCoverStartTime;

        // Gesto 1: Mano quieta encima por más de 800ms -> Play / Pausa
        if (coveredDuration > 800 && (now - lastGestureTime > 1500)) {
          triggerGestureFeedback("play-pause");
          togglePlayPause();
          lastGestureTime = now;
          handCoverStartTime = null; // Reiniciar
        }
      }
    } else {
      // Si se destapa después de un paso rápido (entre 120ms y 600ms)
      if (handCoverStartTime) {
        const coveredDuration = now - handCoverStartTime;
        if (coveredDuration >= 100 && coveredDuration <= 600 && (now - lastGestureTime > 1200)) {
          // Gesto 2: Paso rápido de la mano (Swipe aéreo) -> Siguiente canción
          triggerGestureFeedback("next");
          controlPlayback('next');
          lastGestureTime = now;
        }
        handCoverStartTime = null;
      }
    }
  }

  previousBrightness = avgBrightness;
}

function triggerGestureFeedback(type) {
  // Vibración táctil
  if (navigator.vibrate) {
    if (type === "play-pause") navigator.vibrate([40, 60, 40]);
    else navigator.vibrate(60);
  }

  // Destello en pantalla
  const viewport = document.querySelector('.stage-viewport');
  if (viewport) {
    viewport.classList.remove('gesture-pulse');
    void viewport.offsetWidth; // Forzar reflow
    viewport.classList.add('gesture-pulse');
  }
}

