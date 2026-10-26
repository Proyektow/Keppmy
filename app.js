/**
 * Aura • Tiempo, Agenda & Asistente Inteligente
 */

// 1. PWA & Detección de Instalación
let deferredPrompt = null;
const installBtn = document.getElementById('btn-install');

function checkPwaStandalone() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone && installBtn) {
    installBtn.style.display = 'none';
  }
}
checkPwaStandalone();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    installBtn.style.display = 'flex';
  }
});

function triggerPwaInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredPrompt = null;
    });
  } else {
    alert("Pulsa los 3 puntos de Chrome arriba a la derecha y selecciona 'Añadir a pantalla de inicio' o 'Instalar aplicación'.");
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 2. Reloj en tiempo real
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

// 3. Meteorología en Vivo (Open-Meteo Bilbao)
const LAT = 43.263;
const LON = -2.935;
let cachedWeather = null;

async function loadWeather() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
    const res = await fetch(url);
    cachedWeather = await res.json();

    if (cachedWeather) {
      const curTemp = Math.round(cachedWeather.current.temperature_2m);
      const max = Math.round(cachedWeather.daily.temperature_2m_max[0]);
      const min = Math.round(cachedWeather.daily.temperature_2m_min[0]);
      const rain = cachedWeather.daily.precipitation_probability_max[0] || 0;
      const info = interpretWeather(cachedWeather.current.weather_code, rain);

      document.getElementById('w-temp').textContent = `${curTemp}°`;
      document.getElementById('w-icon').textContent = info.icon;
      document.getElementById('w-summary').textContent = info.desc;
      document.getElementById('w-sub').textContent = `Mín: ${min}° • Máx: ${max}° • 💧 ${rain}%`;
    }
  } catch (e) {
    document.getElementById('w-summary').textContent = "Previsión local";
  }
}
loadWeather();
setInterval(loadWeather, 600000);

function interpretWeather(code, rain) {
  if (code >= 51 && code <= 67) return { desc: "Lluvia", icon: "🌧️", advice: "coge paraguas" };
  if (code >= 71 && code <= 86) return { desc: "Nieve", icon: "❄️", advice: "abrigo gordo" };
  if (code >= 95) return { desc: "Tormenta", icon: "⛈️", advice: "cuidado en la calle" };
  if (code === 0) return { desc: "Despejado", icon: "☀️", advice: "buen día para salir" };
  if (code <= 3) return { desc: "Nublado", icon: "⛅", advice: rain > 40 ? "posible chaparrón" : "buena temperatura" };
  return { desc: "Cubierto", icon: "☁️", advice: rain > 40 ? "lleva chubasquero" : "ambiente fresco" };
}

// Consultas meteorológicas ampliadas (Hoy, Mañana, Fin de Semana)
async function askWeather(mode) {
  if (!cachedWeather) await loadWeather();
  if (!cachedWeather || !cachedWeather.daily) {
    speak("No he podido consultar la previsión meteorológica.", "⚠️");
    return;
  }

  const daily = cachedWeather.daily;

  if (mode === 'finde') {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 Dom, 6 Sab
    const daysToSat = (6 - dayOfWeek + 7) % 7;
    const daysToSun = daysToSat + 1;

    const satIndex = daysToSat < 7 ? daysToSat : 5;
    const sunIndex = daysToSun < 7 ? daysToSun : 6;

    const satMax = Math.round(daily.temperature_2m_max[satIndex]);
    const satMin = Math.round(daily.temperature_2m_min[satIndex]);
    const satRain = daily.precipitation_probability_max[satIndex] || 0;
    const satInfo = interpretWeather(daily.weather_code[satIndex], satRain);

    const sunMax = Math.round(daily.temperature_2m_max[sunIndex]);
    const sunRain = daily.precipitation_probability_max[sunIndex] || 0;

    const phrase = `El fin de semana en Bilbao: el sábado tendremos ${satInfo.desc} con máximas de ${satMax} grados y ${satRain} por ciento de lluvia. El domingo esperamos máximas de ${sunMax} grados con ${sunRain} por ciento de lluvia.`;
    speak(phrase, "🏖️");
    return;
  }

  const isTomorrow = mode === 'mañana';
  const idx = isTomorrow ? 1 : 0;
  const max = Math.round(daily.temperature_2m_max[idx]);
  const min = Math.round(daily.temperature_2m_min[idx]);
  const rain = daily.precipitation_probability_max[idx] || 0;
  const info = interpretWeather(daily.weather_code[idx], rain);

  const phrase = `${isTomorrow ? 'Mañana' : 'Hoy'} en Bilbao tendremos ${info.desc}, con mínimas de ${min} y máximas de ${max} grados. Probabilidad de lluvia del ${rain} por ciento. Te aconsejo que ${info.advice}.`;
  speak(phrase, info.icon);
}

// 4. Síntesis de Voz (TTS)
function speak(text, icon = null) {
  document.getElementById('bubble-text').textContent = text;
  if (icon) {
    document.getElementById('bubble-icon').innerHTML = `<span style="font-size:1.3rem;">${icon}</span>`;
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  }
}

// 5. Calendario y Gestión de Agenda
let myEvents = JSON.parse(localStorage.getItem('aura_events') || '[]');

function saveEvents() {
  localStorage.setItem('aura_events', JSON.stringify(myEvents));
  renderEvents();
}

function createGCalUrl(title, date, time) {
  const startDateTime = new Date(`${date}T${time || '12:00'}:00`);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
  const formatGCal = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${formatGCal(startDateTime)}/${formatGCal(endDateTime)}`;
}

function renderEvents() {
  const container = document.getElementById('events-container');
  container.innerHTML = '';

  if (myEvents.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:18px;">No tienes eventos programados. Sube tu ical.zip o añade uno.</div>';
    return;
  }

  myEvents.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  myEvents.forEach((ev, idx) => {
    const item = document.createElement('div');
    item.className = 'event-item';
    const gcalUrl = createGCalUrl(ev.title, ev.date, ev.time);

    item.innerHTML = `
      <div class="event-info">
        <h4>${ev.title}</h4>
        <p>📅 ${ev.date} a las ${ev.time} ${ev.source === 'google' ? '• Google' : ''}</p>
      </div>
      <div class="event-actions">
        <a href="${gcalUrl}" target="_blank" class="btn-gcal">GCal ↗</a>
        <button class="btn-del-event" onclick="deleteEvent(${idx})">&times;</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function addEventManual() {
  const title = document.getElementById('new-event-title').value.trim();
  const date = document.getElementById('new-event-date').value;
  const time = document.getElementById('new-event-time').value || "12:00";

  if (!title || !date) {
    alert("Introduce un título y una fecha.");
    return;
  }

  myEvents.push({ title, date, time, source: 'local' });
  saveEvents();
  document.getElementById('new-event-title').value = '';
  speak(`Añadido "${title}" para el día ${date}.`, "📅");
}

function deleteEvent(idx) {
  myEvents.splice(idx, 1);
  saveEvents();
}

// 6. Consultas de Agenda por Voz
function checkUpcomingEvents() {
  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = myEvents
    .filter(e => e.date >= todayStr)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 3);

  if (upcoming.length === 0) {
    speak("No tienes ningún evento próximo registrado en tu agenda.", "🔮");
    return;
  }

  const listText = upcoming.map(e => `${e.title} el día ${e.date} a las ${e.time}`).join('. ');
  speak(`Tus próximos eventos son: ${listText}.`, "🔮");
}

function checkEventsForDay(isTomorrow = false) {
  const targetDate = new Date();
  if (isTomorrow) targetDate.setDate(targetDate.getDate() + 1);
  const dateStr = targetDate.toISOString().split('T')[0];

  const matches = myEvents.filter(e => e.date === dateStr);
  if (matches.length === 0) {
    speak(`No tienes nada anotado para ${isTomorrow ? 'mañana' : 'hoy'}.`, "📅");
  } else {
    const listText = matches.map(m => `${m.title} a las ${m.time}`).join(', ');
    speak(`Para ${isTomorrow ? 'mañana' : 'hoy'} tienes previsto: ${listText}.`, "📅");
  }
}

// 7. Lector de ical.zip / .ics
async function handleCalendarFileUpload() {
  const fileInput = document.getElementById('file-calendar-input');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Selecciona primero el archivo ical.zip desde tu móvil.");
    return;
  }

  const file = fileInput.files[0];

  try {
    if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      let foundIcs = false;

      for (const filename of Object.keys(zip.files)) {
        if (filename.endsWith('.ics')) {
          foundIcs = true;
          const icsContent = await zip.files[filename].async('string');
          parseIcsEvents(icsContent);
        }
      }

      if (foundIcs) {
        speak("Calendarios de Google importados correctamente.", "✅");
      } else {
        alert("El archivo ZIP no contiene ningún archivo .ics.");
      }
    } else if (file.name.endsWith('.ics')) {
      const reader = new FileReader();
      reader.onload = function(e) {
        parseIcsEvents(e.target.result);
        speak("Calendario importado correctamente.", "✅");
      };
      reader.readAsText(file);
    }
  } catch (err) {
    alert("Error al leer el archivo: " + err.message);
  }
}

function parseIcsEvents(icsData) {
  const lines = icsData.split(/\r\n|\n|\r/);
  let inEvent = false, curTitle = '', curDate = '', curTime = '10:00';

  lines.forEach(line => {
    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true; curTitle = ''; curDate = ''; curTime = '10:00';
    } else if (line.startsWith('END:VEVENT')) {
      if (inEvent && curTitle && curDate) {
        if (!myEvents.some(e => e.title === curTitle && e.date === curDate)) {
          myEvents.push({ title: curTitle, date: curDate, time: curTime, source: 'google' });
        }
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) curTitle = line.replace('SUMMARY:', '').trim();
      if (line.startsWith('DTSTART')) {
        const val = line.split(':')[1] || '';
        if (val.length >= 8) {
          curDate = `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
          if (val.length >= 13) {
            curTime = `${val.slice(9,11)}:${val.slice(11,13)}`;
          }
        }
      }
    }
  });
  saveEvents();
}

function openCalendarModal() {
  renderEvents();
  document.getElementById('calendar-modal').classList.add('open');
}

function closeCalendarModal() {
  document.getElementById('calendar-modal').classList.remove('open');
}

// 8. Entrada por Voz & Mapeo de Comandos
let recognition = null;
let isListening = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechClass();
  recognition.lang = 'es-ES';
  recognition.continuous = false;

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('clock-trigger').classList.add('listening');
    document.getElementById('clock-hint').textContent = 'Aura te está escuchando...';
  };

  recognition.onresult = (e) => {
    const query = e.results[0][0].transcript.toLowerCase();
    handleVoiceQuery(query);
  };

  recognition.onerror = () => stopListening();
  recognition.onend = () => stopListening();
}

function toggleVoice() {
  if (!recognition) {
    alert("El navegador no soporta entrada de voz.");
    return;
  }
  if (isListening) recognition.stop();
  else recognition.start();
}

function stopListening() {
  isListening = false;
  document.getElementById('clock-trigger').classList.remove('listening');
  document.getElementById('clock-hint').textContent = 'Toca la hora para hablar';
}

function handleVoiceQuery(text) {
  // A. Añadir Evento
  if (text.includes('apuntar') || text.includes('añadir') || text.includes('anota') || text.includes('recordar')) {
    let isTomorrow = text.includes('mañana');
    const targetDate = new Date();
    if (isTomorrow) targetDate.setDate(targetDate.getDate() + 1);
    const dateStr = targetDate.toISOString().split('T')[0];

    let timeStr = "12:00";
    const hourMatch = text.match(/a las (\d{1,2})/);
    if (hourMatch) timeStr = `${String(hourMatch[1]).padStart(2,'0')}:00`;

    let title = text.replace(/apuntar|añadir|anota|recordar|mañana|hoy|a las \d{1,2}/gi, '').trim();
    if (!title) title = "Evento pendiente";

    myEvents.push({ title: title.charAt(0).toUpperCase() + title.slice(1), date: dateStr, time: timeStr, source: 'local' });
    saveEvents();
    speak(`Anotado: "${title}" para ${isTomorrow ? 'mañana' : 'hoy'} a las ${timeStr}.`, "✅");
  } 
  // B. Próximos Eventos Generales
  else if (text.includes('próximos') || text.includes('semana') || text.includes('que tengo')) {
    if (text.includes('mañana')) {
      checkEventsForDay(true);
    } else if (text.includes('hoy')) {
      checkEventsForDay(false);
    } else {
      checkUpcomingEvents();
    }
  }
  // C. Agenda Hoy / Mañana
  else if (text.includes('agenda') || text.includes('planes')) {
    checkEventsForDay(text.includes('mañana'));
  }
  // D. Tiempo Fin de Semana
  else if (text.includes('fin de semana') || text.includes('finde') || text.includes('sábado') || text.includes('domingo')) {
    askWeather('finde');
  }
  // E. Tiempo Mañana / Hoy
  else if (text.includes('mañana')) {
    askWeather('mañana');
  } else if (text.includes('hoy') || text.includes('tiempo') || text.includes('llueve') || text.includes('temperatura')) {
    askWeather('hoy');
  }
  // F. Hora o Día
  else if (text.includes('hora')) {
    const now = new Date();
    speak(`Son las ${now.getHours()} y ${now.getMinutes()} minutos.`, "⏰");
  } else {
    speak(`He oído: "${text}". Prueba a preguntarme: "¿Qué planes tengo esta semana?" o "¿Qué tiempo hará el fin de semana?".`, "🤔");
  }
}

document.getElementById('new-event-date').value = new Date().toISOString().split('T')[0];

// Wake Lock
async function keepAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch(e){}
}
keepAwake();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
