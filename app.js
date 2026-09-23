/* ============================================================
   SALAH TIMES — Live Prayer App Logic
   ============================================================ */

'use strict';

// ── Constants ─────────────────────────────────────────────────
const PRAYERS = [
  { key: 'Fajr',    nameAr: 'الفجر',   emoji: '🌄', desc: 'Dawn' },
  { key: 'Dhuhr',   nameAr: 'الظهر',   emoji: '☀️',  desc: 'Midday' },
  { key: 'Asr',     nameAr: 'العصر',   emoji: '🌇',  desc: 'Afternoon' },
  { key: 'Maghrib', nameAr: 'المغرب',  emoji: '🌆',  desc: 'Sunset' },
  { key: 'Isha',    nameAr: 'العشاء',  emoji: '🌙',  desc: 'Night' },
];

// Reference times shown alongside the five daily prayers — mirrors what
// IRN's own bønnetid.no displays (Morgengry/Fajr slutt/Kveldsgry/Midnatt).
const EXTRA_TIMES = [
  { key: 'Imsak',    label: 'Imsak',    emoji: '🌑' },
  { key: 'Sunrise',  label: 'Sunrise',  emoji: '🌅' },
  { key: 'Sunset',   label: 'Sunset',   emoji: '🌇' },
  { key: 'Midnight', label: 'Midnight', emoji: '🌌' },
];

const METHODS = [
  { id: 3,  name: 'Muslim World League' },
  { id: 2,  name: 'Islamic Society of North America (ISNA)' },
  { id: 4,  name: 'Umm Al-Qura University, Makkah' },
  { id: 5,  name: 'Egyptian General Authority of Survey' },
  { id: 1,  name: 'University of Islamic Sciences, Karachi' },
  { id: 7,  name: 'Institute of Geophysics, University of Tehran' },
  { id: 8,  name: 'Gulf Region' },
  { id: 9,  name: 'Kuwait' },
  { id: 10, name: 'Qatar' },
  { id: 12, name: 'Union Organization Islamic de France' },
  { id: 13, name: 'Diyanet İşleri Başkanlığı, Turkey' },
  { id: 15, name: 'Moonsighting Committee Worldwide' },
];

// ── State ──────────────────────────────────────────────────────
let prayerTimings  = null;
let currentLat     = null;
let currentLon     = null;
let currentCity    = '';
let clockInterval  = null;
let prevHr  = -1, prevMin = -1, prevSec = -1;

let settings = { method: 2, school: 0, timeFormat: 12, midnightMode: 0, latitudeAdjustment: '' };
try {
  const saved = JSON.parse(localStorage.getItem('salahSettings'));
  if (saved) settings = { ...settings, ...saved };
} catch {}

// ── DOM Helpers ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(name) {
  ['locationScreen','loadingScreen','errorScreen','prayerScreen'].forEach(s => {
    $(s).style.display = (s === name + 'Screen') ? '' : 'none';
  });
}

function setLoading(text) {
  showScreen('loading');
  $('loadingText').textContent = text;
}

function showError(msg) {
  showScreen('error');
  $('errorMessage').textContent = msg;
}

// ── Stars Generator ────────────────────────────────────────────
function generateStars() {
  const container = $('starsBg');
  for (let i = 0; i < 120; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    const dur  = (Math.random() * 4 + 2).toFixed(1) + 's';
    const del  = (Math.random() * 6).toFixed(1) + 's';
    const opac = (Math.random() * 0.6 + 0.3).toFixed(2);
    star.style.cssText = `
      width:${size}px; height:${size}px;
      top:${Math.random()*100}%; left:${Math.random()*100}%;
      --dur:${dur}; --delay:${del}; --max-opacity:${opac};
    `;
    container.appendChild(star);
  }
}

// ── Header Date ───────────────────────────────────────────────
function updateHeaderDate() {
  const now = new Date();
  $('headerDate').textContent = now.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

// ── Geocoding: city from coords ───────────────────────────────
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    return addr.city || addr.town || addr.village || addr.county || addr.state || 'Your Location';
  } catch {
    return 'Your Location';
  }
}

// ── Geocoding: coords from city name ─────────────────────────
async function geocodeCity(cityName) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`,
    { headers: { 'Accept-Language': 'en' } }
  );
  const data = await res.json();
  if (!data.length) throw new Error('City not found');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), city: data[0].display_name.split(',')[0] };
}

// ── Aladhan API ───────────────────────────────────────────────
async function fetchPrayerTimes(lat, lon) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const date = `${dd}-${mm}-${yyyy}`;

  const latAdjParam = settings.latitudeAdjustment !== '' ? `&latitudeAdjustmentMethod=${settings.latitudeAdjustment}` : '';
  const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${lat}&longitude=${lon}` +
    `&method=${settings.method}&school=${settings.school}&midnightMode=${settings.midnightMode}${latAdjParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('API error: ' + res.status);
  const json = await res.json();
  return json.data;
}

// ── Parse time string "HH:MM" to today's Date ────────────────
function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Format Date per time-format setting ────────────────────────
function fmt12(dateObj) {
  return settings.timeFormat === 24
    ? dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Hijri Date ────────────────────────────────────────────────
function renderHijri(hijri) {
  if (!hijri) return;
  const { day, month, year } = hijri;
  $('hijriDate').textContent = `${day} ${month.en} ${year} AH`;
}

// ── Determine Next Prayer ─────────────────────────────────────
function getNextPrayer(timings) {
  const now = new Date();
  for (const p of PRAYERS) {
    const t = parseTime(timings[p.key]);
    if (t > now) return { ...p, time: t };
  }
  // All passed — next is Fajr tomorrow
  const fajr = PRAYERS[0];
  const t = parseTime(timings[fajr.key]);
  t.setDate(t.getDate() + 1);
  return { ...fajr, time: t };
}

function getCurrentPrayer(timings) {
  const now = new Date();
  let last = null;
  for (const p of PRAYERS) {
    const t = parseTime(timings[p.key]);
    if (t <= now) last = p;
  }
  return last;
}

// ── Render Prayers Grid ───────────────────────────────────────
function renderPrayersGrid(timings) {
  const now    = new Date();
  const next   = getNextPrayer(timings);
  const curr   = getCurrentPrayer(timings);
  const grid   = $('prayersGrid');
  grid.innerHTML = '';

  for (const p of PRAYERS) {
    const t = parseTime(timings[p.key]);
    const isPassed  = t < now;
    const isNext    = p.key === next.key;
    const isCurrent = curr && p.key === curr.key;

    const card = document.createElement('div');
    card.className = 'prayer-card' +
      (isCurrent ? ' is-current' : '') +
      (isPassed && !isCurrent ? ' is-passed' : '');

    let badgeClass = 'badge-passed';
    let badgeText  = 'Passed';
    if (isCurrent) { badgeClass = 'badge-current'; badgeText = 'Current'; }
    else if (isNext && !isCurrent) { badgeClass = 'badge-next'; badgeText = 'Next'; }
    else if (!isPassed)            { badgeClass = ''; badgeText = ''; }

    card.innerHTML = `
      <div class="prayer-emoji">${p.emoji}</div>
      <div class="prayer-info">
        <div class="prayer-name-en">${p.key}</div>
        <div class="prayer-name-ar">${p.nameAr}</div>
      </div>
      <div class="prayer-time">${fmt12(t)}</div>
      ${badgeText ? `<span class="prayer-badge ${badgeClass}">${badgeText}</span>` : ''}
    `;
    grid.appendChild(card);
  }
}

function renderExtraTimes(timings) {
  const row = $('extraTimesRow');
  if (!row) return;
  row.innerHTML = EXTRA_TIMES
    .filter(e => timings[e.key])
    .map(e => `
      <div class="extra-time-item">
        <span class="extra-time-emoji">${e.emoji}</span>
        <span class="extra-time-label">${e.label}</span>
        <span class="extra-time-value">${fmt12(parseTime(timings[e.key]))}</span>
      </div>
    `).join('');
}

// ── Live Clock & Countdown ────────────────────────────────────
function flipNum(el, newVal) {
  const str = String(newVal).padStart(2,'0');
  if (el.textContent !== str) {
    el.textContent = str;
    el.classList.remove('flip');
    void el.offsetWidth;
    el.classList.add('flip');
  }
}

function tick(timings) {
  const now = new Date();

  // Clock
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  $('liveClock').textContent =
    String(h).padStart(2,'0') + ':' +
    String(m).padStart(2,'0') + ':' +
    String(s).padStart(2,'0');

  // Countdown
  const next = getNextPrayer(timings);
  const diff = Math.max(0, next.time - now);
  const totalSec = Math.floor(diff / 1000);
  const hrs  = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  flipNum($('countHr'),  hrs);
  flipNum($('countMin'), mins);
  flipNum($('countSec'), secs);

  $('nextPrayerName').textContent        = next.key;
  $('nextPrayerTimeDisplay').textContent = fmt12(next.time);

  // Progress bar: between previous prayer and next
  const prayers = PRAYERS.map(p => parseTime(timings[p.key]));
  let prevTime = null;
  for (let i = prayers.length - 1; i >= 0; i--) {
    if (prayers[i] <= now) { prevTime = prayers[i]; break; }
  }
  if (!prevTime) {
    const isha = parseTime(timings['Isha']);
    isha.setDate(isha.getDate() - 1);
    prevTime = isha;
  }
  const span   = next.time - prevTime;
  const passed = now - prevTime;
  const pct    = Math.min(100, Math.max(0, (passed / span) * 100));
  $('progressFill').style.width = pct + '%';

  // Refresh grid every minute
  if (m !== prevMin || h !== prevHr) {
    renderPrayersGrid(timings);
    prevHr = h; prevMin = m;
  }
}

// ── Main Load Flow ────────────────────────────────────────────
async function loadPrayerTimes(lat, lon, cityLabel) {
  setLoading('Calculating prayer times…');
  try {
    const data = await fetchPrayerTimes(lat, lon);
    prayerTimings = data.timings;
    currentLat = lat; currentLon = lon; currentCity = cityLabel;

    // Show prayer screen
    showScreen('prayer');

    // Location bar
    $('locationText').textContent = cityLabel;

    // Hijri
    renderHijri(data.date?.hijri);

    // Method + Madhab badges
    $('methodBadge').textContent = 'Calculation: ' + (data.meta?.method?.name || 'ISNA');
    $('madhabBadge').textContent = settings.school === 1 ? 'Madhab: Hanafi' : 'Madhab: Standard (Shafiʿi)';

    // Initial render
    renderPrayersGrid(prayerTimings);
    renderExtraTimes(prayerTimings);

    // Start live ticker
    if (clockInterval) clearInterval(clockInterval);
    tick(prayerTimings);
    clockInterval = setInterval(() => tick(prayerTimings), 1000);

  } catch (e) {
    showError('Could not fetch prayer times. Check your connection and try again.\n' + e.message);
  }
}

async function startWithGeolocation() {
  setLoading('Detecting your location…');
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, timeout: 12000
      })
    );
    const { latitude: lat, longitude: lon } = pos.coords;
    const city = await reverseGeocode(lat, lon);
    await loadPrayerTimes(lat, lon, city);
  } catch (e) {
    if (e.code === 1) {
      showError('Location access denied. Use the manual city search instead.');
    } else {
      showError('Could not determine location. ' + (e.message || ''));
    }
  }
}

// ── Event Listeners ───────────────────────────────────────────
$('enableLocationBtn').addEventListener('click', startWithGeolocation);

$('manualToggle').addEventListener('click', () => {
  const wrap = $('manualInputWrap');
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none';
  if (wrap.style.display === 'flex') $('cityInput').focus();
});

async function doManualSearch() {
  const val = $('cityInput').value.trim();
  if (!val) return;
  setLoading('Searching for ' + val + '…');
  try {
    const { lat, lon, city } = await geocodeCity(val);
    await loadPrayerTimes(lat, lon, city);
  } catch (e) {
    showError('City not found. Please try a different name.');
  }
}

$('searchCityBtn').addEventListener('click', doManualSearch);
$('cityInput').addEventListener('keydown', e => { if (e.key === 'Enter') doManualSearch(); });

$('retryBtn').addEventListener('click', () => showScreen('location'));

$('refreshBtn').addEventListener('click', () => {
  if (currentLat) loadPrayerTimes(currentLat, currentLon, currentCity);
  else showScreen('location');
});

// ── Settings Drawer ────────────────────────────────────────────
function populateMethodSelect() {
  const sel = $('methodSelect');
  sel.innerHTML = METHODS.map(m =>
    `<option value="${m.id}"${m.id === settings.method ? ' selected' : ''}>${m.name}</option>`
  ).join('');
}

function setToggleGroup(groupId, val) {
  const group = $(groupId);
  group.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.val) === Number(val));
  });
}

function wireToggleGroup(groupId) {
  $(groupId).querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $(groupId).querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function openDrawer() {
  $('settingsDrawer').classList.add('open');
  $('settingsDrawer').setAttribute('aria-hidden', 'false');
  $('drawerOverlay').classList.add('active');
}

function closeDrawer() {
  $('settingsDrawer').classList.remove('open');
  $('settingsDrawer').setAttribute('aria-hidden', 'true');
  $('drawerOverlay').classList.remove('active');
}

populateMethodSelect();
$('latAdjSelect').value = settings.latitudeAdjustment;
setToggleGroup('schoolToggle', settings.school);
setToggleGroup('fmtToggle', settings.timeFormat);
setToggleGroup('midnightToggle', settings.midnightMode);
wireToggleGroup('schoolToggle');
wireToggleGroup('fmtToggle');
wireToggleGroup('midnightToggle');

$('settingsBtn').addEventListener('click', openDrawer);
$('closeSettings').addEventListener('click', closeDrawer);
$('drawerOverlay').addEventListener('click', closeDrawer);

$('presetNorway').addEventListener('click', () => {
  $('methodSelect').value = '3';   // Muslim World League
  $('latAdjSelect').value = '3';   // Angle Based (high latitude)
  setToggleGroup('schoolToggle', 1); // Hanafi
  $('applySettingsBtn').click();
});

$('applySettingsBtn').addEventListener('click', () => {
  settings.method       = Number($('methodSelect').value);
  settings.latitudeAdjustment = $('latAdjSelect').value;
  settings.school       = Number($('schoolToggle').querySelector('.toggle-btn.active').dataset.val);
  settings.timeFormat   = Number($('fmtToggle').querySelector('.toggle-btn.active').dataset.val);
  settings.midnightMode = Number($('midnightToggle').querySelector('.toggle-btn.active').dataset.val);
  localStorage.setItem('salahSettings', JSON.stringify(settings));
  closeDrawer();
  if (currentLat != null) loadPrayerTimes(currentLat, currentLon, currentCity);
});

// ── Init ──────────────────────────────────────────────────────
generateStars();
updateHeaderDate();
