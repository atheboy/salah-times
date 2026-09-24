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

let settings = { method: 2, school: 0, timeFormat: 12, midnightMode: 0, latitudeAdjustment: '', notifications: false };
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
  const rawDiff = next.time - now;
  checkPrayerNotification(next, rawDiff, timings);
  const diff = Math.max(0, rawDiff);
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
    updateSaveButtonState();

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

// ── Saved Locations ────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function loadSavedLocations() {
  try { return JSON.parse(localStorage.getItem('salahSavedLocations')) || []; }
  catch { return []; }
}
function persistSavedLocations() {
  localStorage.setItem('salahSavedLocations', JSON.stringify(savedLocations));
}
let savedLocations = loadSavedLocations();

function isSameLocation(loc, lat, lon) {
  return Math.abs(loc.lat - lat) < 0.01 && Math.abs(loc.lon - lon) < 0.01;
}
function findSavedIndex(lat, lon) {
  return savedLocations.findIndex(l => isSameLocation(l, lat, lon));
}

function updateSaveButtonState() {
  const btn = $('saveLocBtn');
  if (!btn || currentLat == null) return;
  const isSaved = findSavedIndex(currentLat, currentLon) !== -1;
  btn.classList.toggle('saved', isSaved);
  btn.innerHTML = isSaved ? '&#9733;' : '&#9734;';
  btn.title = isSaved ? 'Remove from saved locations' : 'Save this location';
}

function toggleSaveCurrentLocation() {
  if (currentLat == null) return;
  const idx = findSavedIndex(currentLat, currentLon);
  if (idx !== -1) savedLocations.splice(idx, 1);
  else savedLocations.push({ city: currentCity, lat: currentLat, lon: currentLon });
  persistSavedLocations();
  updateSaveButtonState();
  renderLocationsList();
}

function renderLocationsList() {
  const list = $('locationsList');
  if (!list) return;
  if (savedLocations.length === 0) {
    list.innerHTML = '<div class="no-locations">No saved locations yet — search a city below, or tap the ☆ on your current location.</div>';
    return;
  }
  list.innerHTML = savedLocations.map((loc, i) => {
    const isActive = currentLat != null && isSameLocation(loc, currentLat, currentLon);
    return `
      <div class="location-item${isActive ? ' active-loc' : ''}" data-index="${i}">
        <span class="loc-item-icon">📍</span>
        <div style="flex:1">
          <div class="loc-item-name">${escapeHtml(loc.city)}</div>
          <div class="loc-item-coords">${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}</div>
        </div>
        ${isActive ? '<span class="active-dot"></span>' : ''}
        <button class="loc-delete-btn" data-delete-index="${i}" title="Remove">&#10005;</button>
      </div>
    `;
  }).join('');
}

function openLocations() {
  closeDrawer();
  closeQibla();
  closeCalendar();
  renderLocationsList();
  $('locationsPanel').classList.add('open');
  $('locationsPanel').setAttribute('aria-hidden', 'false');
  $('drawerOverlay').classList.add('active');
}

function closeLocations() {
  $('locationsPanel').classList.remove('open');
  $('locationsPanel').setAttribute('aria-hidden', 'true');
  $('drawerOverlay').classList.remove('active');
}

async function addLocationFromInput() {
  const val = $('addLocationInput').value.trim();
  if (!val) return;
  const originalPlaceholder = $('addLocationInput').placeholder;
  try {
    const { lat, lon, city } = await geocodeCity(val);
    if (findSavedIndex(lat, lon) === -1) {
      savedLocations.push({ city, lat, lon });
      persistSavedLocations();
    }
    $('addLocationInput').value = '';
    renderLocationsList();
  } catch {
    $('addLocationInput').placeholder = 'City not found — try again';
    setTimeout(() => { $('addLocationInput').placeholder = originalPlaceholder; }, 2500);
  }
}

$('saveLocBtn').addEventListener('click', toggleSaveCurrentLocation);
$('locationsBtn').addEventListener('click', openLocations);
$('closeLocations').addEventListener('click', closeLocations);
$('addLocationBtn').addEventListener('click', addLocationFromInput);
$('addLocationInput').addEventListener('keydown', e => { if (e.key === 'Enter') addLocationFromInput(); });
$('useGpsBtn').addEventListener('click', () => { closeLocations(); startWithGeolocation(); });

$('locationsList').addEventListener('click', (e) => {
  const delBtn = e.target.closest('.loc-delete-btn');
  if (delBtn) {
    const idx = parseInt(delBtn.dataset.deleteIndex, 10);
    savedLocations.splice(idx, 1);
    persistSavedLocations();
    renderLocationsList();
    updateSaveButtonState();
    return;
  }
  const item = e.target.closest('.location-item');
  if (item) {
    const loc = savedLocations[parseInt(item.dataset.index, 10)];
    if (loc) {
      closeLocations();
      loadPrayerTimes(loc.lat, loc.lon, loc.city);
    }
  }
});

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
  closeQibla();
  closeLocations();
  closeCalendar();
  $('settingsDrawer').classList.add('open');
  $('settingsDrawer').setAttribute('aria-hidden', 'false');
  $('drawerOverlay').classList.add('active');
}

function closeDrawer() {
  $('settingsDrawer').classList.remove('open');
  $('settingsDrawer').setAttribute('aria-hidden', 'true');
  $('drawerOverlay').classList.remove('active');
}

// ── Qibla Direction ─────────────────────────────────────────────
const KAABA_LAT = 21.4225, KAABA_LON = 39.8262;
let qiblaBearing = null;   // degrees from true North to Mecca, for the current location
let deviceHeading = null;  // live compass heading from the device, if granted

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function computeQiblaBearing(lat, lon) {
  const φ1 = toRad(lat), φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LON - lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function computeDistanceToMeccaKm(lat, lon) {
  const R = 6371;
  const φ1 = toRad(lat), φ2 = toRad(KAABA_LAT);
  const Δφ = toRad(KAABA_LAT - lat), Δλ = toRad(KAABA_LON - lon);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderQiblaNeedle() {
  if (qiblaBearing == null) return;
  const rotation = deviceHeading != null ? (qiblaBearing - deviceHeading + 360) % 360 : qiblaBearing;
  $('qiblaNeedle').style.transform = `rotate(${rotation}deg)`;
  $('qiblaHint').textContent = deviceHeading != null
    ? 'Point the top of your phone this way'
    : 'from North — enable live compass to point it for you';
}

function updateQiblaPanel() {
  if (currentLat == null) {
    $('qiblaBearing').textContent = '—°';
    $('qiblaDistance').textContent = 'Set a location first';
    return;
  }
  qiblaBearing = computeQiblaBearing(currentLat, currentLon);
  const distKm = computeDistanceToMeccaKm(currentLat, currentLon);
  $('qiblaBearing').textContent = Math.round(qiblaBearing) + '°';
  $('qiblaDistance').textContent = Math.round(distKm).toLocaleString() + ' km to Mecca';

  const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function'
    && deviceHeading == null;
  $('enableCompassBtn').style.display = needsPermission ? '' : 'none';

  renderQiblaNeedle();
}

function handleDeviceOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number') {
    heading = e.webkitCompassHeading; // iOS Safari: already a compass heading (0 = North)
  } else if (e.alpha != null) {
    heading = (360 - e.alpha) % 360; // Android: alpha increases counter-clockwise from North
  }
  if (heading != null) {
    deviceHeading = heading;
    renderQiblaNeedle();
  }
}

async function enableLiveCompass() {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') return;
    } catch { return; }
  }
  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(eventName, handleDeviceOrientation, true);
  $('enableCompassBtn').style.display = 'none';
}

function openQibla() {
  closeDrawer();
  closeLocations();
  closeCalendar();
  updateQiblaPanel();
  $('qiblaPanel').classList.add('open');
  $('qiblaPanel').setAttribute('aria-hidden', 'false');
  $('drawerOverlay').classList.add('active');
}

function closeQibla() {
  $('qiblaPanel').classList.remove('open');
  $('qiblaPanel').setAttribute('aria-hidden', 'true');
  $('drawerOverlay').classList.remove('active');
}

$('qiblaBtn').addEventListener('click', openQibla);
$('closeQibla').addEventListener('click', closeQibla);
$('enableCompassBtn').addEventListener('click', enableLiveCompass);

// ── Prayer Notifications ──────────────────────────────────────
// Fires while this tab stays open — not a background/service-worker push,
// just a same-tab Notification the moment a prayer's start time is reached.
let lastNotifiedPrayerKey = null;

function updateNotifToggleLabel() {
  const btn = $('notifToggleBtn');
  if (!btn) return;
  if (typeof Notification === 'undefined') {
    btn.textContent = 'Notifications not supported in this browser';
    btn.disabled = true;
  } else if (settings.notifications && Notification.permission === 'granted') {
    btn.textContent = '🔕 Disable Prayer Notifications';
  } else {
    btn.textContent = '🔔 Enable Prayer Notifications';
  }
}

async function toggleNotifications() {
  if (typeof Notification === 'undefined') return;

  if (settings.notifications && Notification.permission === 'granted') {
    settings.notifications = false;
    localStorage.setItem('salahSettings', JSON.stringify(settings));
    updateNotifToggleLabel();
    return;
  }

  if (Notification.permission === 'granted') {
    settings.notifications = true;
  } else if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    settings.notifications = perm === 'granted';
  }
  localStorage.setItem('salahSettings', JSON.stringify(settings));
  updateNotifToggleLabel();
}

function checkPrayerNotification(next, diffMs, timings) {
  if (!settings.notifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (diffMs > 1000) return; // only right at (or just past) the moment it begins

  const dateKey = next.time.toISOString().slice(0, 10) + '-' + next.key;
  if (lastNotifiedPrayerKey === dateKey) return;
  lastNotifiedPrayerKey = dateKey;

  try {
    new Notification(`${next.key} — it's time`, {
      body: `${next.key} begins now at ${fmt12(next.time)} in ${currentCity || 'your location'}.`,
      tag: dateKey,
    });
  } catch { /* some browsers restrict Notification() outside a user gesture in edge cases */ }
}

$('notifToggleBtn').addEventListener('click', toggleNotifications);
updateNotifToggleLabel();

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
$('drawerOverlay').addEventListener('click', () => { closeDrawer(); closeQibla(); closeLocations(); closeCalendar(); });

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

// ── Monthly Calendar ────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_COLUMNS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
let calYear = null, calMonth = null; // calMonth is 1-indexed, matching Aladhan's API

function stripTz(timeStr) {
  return timeStr.split(' ')[0]; // "03:15 (CEST)" -> "03:15"
}

async function fetchCalendarMonth(year, month, lat, lon) {
  const latAdjParam = settings.latitudeAdjustment !== '' ? `&latitudeAdjustmentMethod=${settings.latitudeAdjustment}` : '';
  const url = `https://api.aladhan.com/v1/calendar/${year}/${month}?latitude=${lat}&longitude=${lon}` +
    `&method=${settings.method}&school=${settings.school}&midnightMode=${settings.midnightMode}${latAdjParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('API error: ' + res.status);
  const json = await res.json();
  return json.data;
}

async function renderCalendarMonth() {
  $('calMonthLabel').textContent = `${MONTH_NAMES[calMonth - 1]} ${calYear}`;
  const body = $('calendarTableBody');
  body.innerHTML = `<tr><td colspan="7" class="calendar-loading">Loading…</td></tr>`;

  if (currentLat == null) {
    body.innerHTML = `<tr><td colspan="7" class="calendar-error">Set a location first.</td></tr>`;
    return;
  }

  try {
    const days = await fetchCalendarMonth(calYear, calMonth, currentLat, currentLon);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === calYear && (today.getMonth() + 1) === calMonth;

    body.innerHTML = days.map(day => {
      const isToday = isCurrentMonth && parseInt(day.date.gregorian.day, 10) === today.getDate();
      const cells = CAL_COLUMNS.map(key => `<td>${fmt12(parseTime(stripTz(day.timings[key])))}</td>`).join('');
      return `<tr class="${isToday ? 'cal-today' : ''}"><td>${day.date.gregorian.day} ${day.date.gregorian.weekday.en.slice(0, 3)}</td>${cells}</tr>`;
    }).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="calendar-error">Could not load calendar. Check your connection.</td></tr>`;
  }
}

function openCalendar() {
  closeDrawer();
  closeQibla();
  closeLocations();
  if (calYear == null) {
    const today = new Date();
    calYear = today.getFullYear();
    calMonth = today.getMonth() + 1;
  }
  renderCalendarMonth();
  $('calendarPanel').classList.add('open');
  $('calendarPanel').setAttribute('aria-hidden', 'false');
  $('drawerOverlay').classList.add('active');
}

function closeCalendar() {
  $('calendarPanel').classList.remove('open');
  $('calendarPanel').setAttribute('aria-hidden', 'true');
  $('drawerOverlay').classList.remove('active');
}

$('calendarBtn').addEventListener('click', openCalendar);
$('closeCalendar').addEventListener('click', closeCalendar);
$('calPrevMonth').addEventListener('click', () => {
  calMonth--;
  if (calMonth < 1) { calMonth = 12; calYear--; }
  renderCalendarMonth();
});
$('calNextMonth').addEventListener('click', () => {
  calMonth++;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  renderCalendarMonth();
});

// ── Init ──────────────────────────────────────────────────────
generateStars();
updateHeaderDate();
