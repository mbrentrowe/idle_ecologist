// main.js — UI layer and entry point for Idle Ecologist Text UI
import { createEngine, shortNumber, FARM_ZONE_DEFS, ARTISAN_ZONE_DEFS, DAY_REAL_SECS, YEAR_REAL_SECS, CALENDAR_MONTHS, SEASONS, calendarDate, acreUpgradeCost, workerUpgradeCost, workerMultiplier } from './game.js';
import { CROPS } from './crops.js';
import { RESEARCH, RESEARCH_CATEGORIES } from './research.js';
import { ECOREGIONS, WILDLIFE_TYPE_ICONS } from './ecoregions.js';
import { RANCH_ANIMALS, RANCH_ANIMAL_LIST } from './ranch.js';

// Module-level cache for the full plant list (avoid repeated flatMap across renders)
const ALL_PLANTS = ECOREGIONS.flatMap(e => e.plants);

// ── Crop emoji map ────────────────────────────────────────────────────────────
// Used only in <select> option text (HTML not supported there)
const CROP_EMOJI = {
  strawberry:  '🍓', greenOnion: '🌿', potato:     '🥔', onion:      '🧅',
  carrot:      '🥕', blueberry:  '🫐', parsnip:    '🟤', lettuce:    '🥬',
  cauliflower: '🥦', rice:       '🍚', broccoli:   '🌾', asparagus:  '🌱',
};

// Tileset GIDs → CSS sprite icons (marketIconGID from canvas crops.js)
// Sheet: 125 cols × 16 px tiles, 2000 × 1568 px
const CROP_ICON_GID = {
  strawberry:  4486, greenOnion: 4736, potato:     4986, onion:      5236,
  carrot:      5486, blueberry:  5736, parsnip:    5986, lettuce:    6236,
  cauliflower: 6486, rice:       6736, broccoli:   6986, asparagus:  7236,
};
const _SHEET = { cols: 125, tile: 16, w: 2000, h: 1568 };
function cropIconHtml(gid, size = 24) {
  if (!gid) return '<span class="crop-icon-fallback">?</span>';
  const scale = size / _SHEET.tile;
  const col   = (gid - 1) % _SHEET.cols;
  const row   = Math.floor((gid - 1) / _SHEET.cols);
  const px    = Math.round(col * size);
  const py    = Math.round(row * size);
  const bw    = Math.round(_SHEET.w * scale);
  const bh    = Math.round(_SHEET.h * scale);
  return `<span class="crop-icon" style="width:${size}px;height:${size}px;background-position:-${px}px -${py}px;background-size:${bw}px ${bh}px"></span>`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const engine = createEngine();
const saved  = engine.loadSave();
if (saved) {
  engine.applyState(saved);
  if (saved.savedAt) {
    const offSecs = (Date.now() - saved.savedAt) / 1000;
    if (offSecs > 5) {
      const result = engine.simulateOffline(offSecs);
      showOfflineToast(result, offSecs);
    }
  }
}

setInterval(() => engine.tick(), 250);
setInterval(() => engine.save(), 10000);

// ── iNaturalist photo cache ───────────────────────────────────────────────────
const INAT_CACHE_KEY = 'inat-photo-cache-v2';
const inatPhotoCache = (() => {
  try { return JSON.parse(localStorage.getItem(INAT_CACHE_KEY) || '{}'); } catch { return {}; }
})();

// Hard-coded photo URLs for crops and ranch animals — bypass API for these
// entirely so they always load instantly and never risk a wrong/null result.
const STATIC_INAT_PHOTOS = {
  // Crops
  'Fragaria \u00d7 ananassa':              'https://inaturalist-open-data.s3.amazonaws.com/photos/74966564/square.jpg',
  'Allium fistulosum':                     'https://static.inaturalist.org/photos/37383663/square.jpeg',
  'Ipomoea batatas':                       'https://inaturalist-open-data.s3.amazonaws.com/photos/64415778/square.jpeg',
  'Abelmoschus esculentus':                'https://static.inaturalist.org/photos/78980367/square.jpg',
  'Arachis hypogaea':                      'https://inaturalist-open-data.s3.amazonaws.com/photos/105026294/square.jpeg',
  'Vaccinium virgatum':                    'https://inaturalist-open-data.s3.amazonaws.com/photos/122618869/square.jpeg',
  'Prunus persica':                        'https://inaturalist-open-data.s3.amazonaws.com/photos/188900677/square.jpeg',
  'Lactuca sativa':                        'https://inaturalist-open-data.s3.amazonaws.com/photos/75790/square.jpg',
  'Brassica oleracea var. acephala':       'https://inaturalist-open-data.s3.amazonaws.com/photos/30542720/square.jpg',
  'Oryza sativa':                          'https://inaturalist-open-data.s3.amazonaws.com/photos/48742632/square.jpg',
  'Brassica oleracea var. italica':        'https://static.inaturalist.org/photos/67937224/square.jpeg',
  'Solanum lycopersicum':                  'https://inaturalist-open-data.s3.amazonaws.com/photos/115407615/square.jpg',
  // Ranch animals
  'Gallus gallus domesticus':              'https://inaturalist-open-data.s3.amazonaws.com/photos/274681663/square.jpg',
  'Anas platyrhynchos domesticus':         'https://inaturalist-open-data.s3.amazonaws.com/photos/175267007/square.jpg',
  'Capra hircus':                          'https://inaturalist-open-data.s3.amazonaws.com/photos/6035700/square.jpeg',
  'Meleagris gallopavo':                   'https://inaturalist-open-data.s3.amazonaws.com/photos/114655826/square.jpg',
  'Sus scrofa domesticus':                 'https://inaturalist-open-data.s3.amazonaws.com/photos/267631414/square.jpeg',
  'Bos taurus':                            'https://inaturalist-open-data.s3.amazonaws.com/photos/29102489/square.jpg',
};

// 1×1 transparent GIF used as placeholder src until the real iNat photo loads
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Render an <img> that loads from the iNat photo cache (or fires an async fetch via loadInatThumbs). */
function inatThumbHtml(sciName, cls, alt = '') {
  if (!sciName) return '';
  const src = STATIC_INAT_PHOTOS[sciName] || inatPhotoCache[sciName] || BLANK_GIF;
  return `<img class="inat-thumb ${cls}" data-sci="${sciName}" src="${src}" alt="${alt}">`;
}

async function fetchInatPhoto(sciName) {
  if (!sciName) return null;
  if (STATIC_INAT_PHOTOS[sciName]) return STATIC_INAT_PHOTOS[sciName];
  if (sciName in inatPhotoCache) return inatPhotoCache[sciName];
  try {
    const resp = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(sciName)}&per_page=1&is_active=true`);
    const data = await resp.json();
    const url  = data.results?.[0]?.default_photo?.square_url ?? null;
    if (url !== null) {
      inatPhotoCache[sciName] = url;
      localStorage.setItem(INAT_CACHE_KEY, JSON.stringify(inatPhotoCache));
    }
    return url;
  } catch {
    return null; // don't cache on network error; will retry next render
  }
}

function loadInatThumbs() {
  content.querySelectorAll('img.inat-thumb[data-sci]').forEach(img => {
    const sci = img.dataset.sci;
    if (!sci) return;
    if (STATIC_INAT_PHOTOS[sci]) {
      img.src = STATIC_INAT_PHOTOS[sci];
      return; // static URL already set — no API call needed
    }
    if (sci in inatPhotoCache) {
      const url = inatPhotoCache[sci];
      if (url) { img.src = url; img.style.display = ''; }
    } else {
      fetchInatPhoto(sci).then(url => {
        if (url && img.isConnected) { img.src = url; img.style.display = ''; }
      });
    }
  });
}

// ── Wake Lock ───────────────────────────────────────────────────────────
let _wakeLock = null;
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch (_) { /* denied or unavailable */ }
}
let _resetting = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquireWakeLock();
  else if (!_resetting) engine.save(); // save immediately when tab goes to background
});
acquireWakeLock();

// ── Tab state ─────────────────────────────────────────────────────────────────
const TABS = ['crops', 'ranch', 'research', 'garden', 'collection', 'settings'];
let activeTab = 'crops';

// ── Tab toggle state ──────────────────────────────────────────────────────────
let hideCompletedResearch = localStorage.getItem('hideCompletedResearch') === 'true';
let hideCompletedGarden   = localStorage.getItem('hideCompletedGarden')   === 'true';
let hideLockedGarden      = localStorage.getItem('hideLockedGarden')      === 'true';
const collapsedGardenCards = new Set(); // plant IDs currently collapsed

// ── UI Construction ───────────────────────────────────────────────────────────
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Header
const header = document.getElementById('header');
// Row 1: economic stats
const hudRow1      = el('div', 'hud-row hud-row-stats');
const goldEl       = el('span', 'gold-amount');
const gpsEl        = el('span', 'gps');
const bioHeaderEl  = el('span', 'bio-header');
const rpHeaderEl   = el('span', 'rp-header');
[goldEl, gpsEl, bioHeaderEl, rpHeaderEl].forEach(e => hudRow1.appendChild(e));
// Row 2: calendar / time
const hudRow2      = el('div', 'hud-row hud-row-time');
const seasonEl     = el('span', 'season-badge-hud');
const dayEl        = el('span', 'day-counter');
const timeEl       = el('span', 'time-display');
const nextSeasonEl = el('span', 'next-season-hud');
[seasonEl, dayEl, timeEl, nextSeasonEl].forEach(e => hudRow2.appendChild(e));
// Row 3: next crop unlock
const nextCropEl = el('div', 'next-crop-bar');
[hudRow1, hudRow2, nextCropEl].forEach(e => header.appendChild(e));

// ── FAB Navigation ────────────────────────────────────────────────────────────
const TAB_LABELS = { crops: '🌾 Crops', ranch: '🐄 Ranch', research: '🌱 Conservation', garden: '🌿 Native Garden', collection: '📚 Collection', settings: '⚙️ Settings' };
const TAB_ICONS  = { crops: '🌾', ranch: '🐄', research: '🌱', garden: '🌿', collection: '📚', settings: '⚙️' };

const fabBtn      = document.getElementById('fab-btn');
const fabMenu     = document.getElementById('fab-menu');
const fabBackdrop = document.getElementById('fab-backdrop');
let fabOpen = false;

const tabBtns = {};

function setFabOpen(open) {
  fabOpen = open;
  fabBtn.classList.toggle('open', open);
  fabMenu.classList.toggle('open', open);
  fabBackdrop.classList.toggle('open', open);
  fabBtn.setAttribute('aria-expanded', open);
  if (open) fabBtn.classList.remove('has-alert'); // ❗ visible on items — no need for glow while open
}

TABS.forEach(tab => {
  const btn = el('button', 'fab-item', TAB_LABELS[tab]);
  btn.dataset.tab = tab;
  tabBtns[tab] = btn;
  btn.addEventListener('click', () => {
    activeTab = tab;
    setFabOpen(false);
    renderAll();
  });
  fabMenu.appendChild(btn);
});

fabBtn.addEventListener('click', () => setFabOpen(!fabOpen));
fabBackdrop.addEventListener('click', () => setFabOpen(false));

const content = document.getElementById('content');

// ── Render dispatcher ─────────────────────────────────────────────────────────
function renderAll() {
  // FAB item active state + FAB button icon
  fabMenu.querySelectorAll('.fab-item').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  fabBtn.textContent = TAB_ICONS[activeTab] ?? '☰';
  content.innerHTML = '';
  switch (activeTab) {
    case 'crops':    lastZonesFingerprint = zonesFingerprint(); renderCrops();    break;
    case 'ranch':    renderRanch();    break;
    case 'artisan':  lastZonesFingerprint = zonesFingerprint(); renderArtisan();  break;
    case 'research':   renderResearch();   break;
    case 'garden':     renderGarden();     break;
    case 'collection': renderCollection(); break;
    case 'settings':   renderSettings();   break;
  }
  loadInatThumbs();
}

// ── Header update ─────────────────────────────────────────────────────────────
function updateHeader() {
  goldEl.textContent = `🪙 ${shortNumber(engine.gold.amount)}`;
  gpsEl.textContent  = `+${shortNumber(engine.getTotalGPS() * engine.gameSpeed)}/s`;

  // Calendar date
  const cal = calendarDate(engine.inGameDay);
  document.body.dataset.season = cal.season.name;

  // Time of day derived from calendarAccum (0 → midnight, 1.0 → next midnight)
  const fracOfDay  = engine.calendarAccum / DAY_REAL_SECS;
  const totalMins  = Math.floor(fracOfDay * 24 * 60);
  const hr24       = Math.floor(totalMins / 60);
  const min        = totalMins % 60;
  const ampm       = hr24 < 12 ? 'AM' : 'PM';
  const hr12       = hr24 % 12 || 12;
  const timeStr    = `${hr12}:${String(min).padStart(2, '0')} ${ampm}`;
  const timeIcon   = hr24 < 5 || hr24 >= 21 ? '🌙'
                   : hr24 < 8               ? '🌅'
                   : hr24 < 18              ? '☀️'
                   :                          '🌇';
  seasonEl.textContent    = `${cal.season.emoji} ${cal.season.name}`;
  dayEl.textContent       = `${cal.month.abbr} ${cal.day}, Yr ${cal.year}`;
  timeEl.textContent      = `${timeIcon} ${timeStr}`;
  const _curSeasonIdx     = SEASONS.findIndex(s => s.name === cal.season.name);
  const _nxtSeason        = SEASONS[(_curSeasonIdx + 1) % SEASONS.length];
  const _daysToNxt        = _nxtSeason.startDoy > cal.dayOfYear
    ? _nxtSeason.startDoy - cal.dayOfYear
    : 365 - cal.dayOfYear + _nxtSeason.startDoy;
  nextSeasonEl.textContent = `${_daysToNxt}d → ${_nxtSeason.emoji} ${_nxtSeason.name}`;

  // Biosphere score + gold multiplier (combined badge)
  bioHeaderEl.textContent = `🌍 ${engine.getTotalBiosphereScore()} BP = ×${engine.getGoldMultiplier().toFixed(2)} 💰`;

  // Research points
  const pts = engine.researchPoints;

  // Check if any research project is affordable & available
  const _completedR = engine.completedResearch;
  const _activeR    = engine.activeResearchId;
  const hasAffordableResearch = RESEARCH.some(r =>
    !_completedR.has(r.id) && r.id !== _activeR &&
    r.requires.every(req => _completedR.has(req)) &&
    pts >= r.cost
  );

  // Check if any garden plant is affordable & not yet planted/active
  const _planted  = engine.plantedSpecies;
  const _activeP  = engine.activePlantingId;
  const hasAffordableGarden = ECOREGIONS.some(eco =>
    eco.plants.some(p =>
      !_planted.has(p.id) && p.id !== _activeP &&
      (p.requiresResearch ?? []).every(rid => _completedR.has(rid)) &&
      pts >= p.cost
    )
  );

  const rpAlert = (hasAffordableResearch && !engine.activeResearchId) || (hasAffordableGarden && !engine.activePlantingId);
  const _rpPerDay = engine.unlockedFarmZones.size;
  rpHeaderEl.textContent = `🌱 ${shortNumber(pts)} CP (+${_rpPerDay}/day)${rpAlert ? ' ❗' : ''}`;
  fabBtn.classList.toggle('has-alert', rpAlert && !fabOpen);

  // Update tab button labels with ❗ when relevant tab has affordable items
  if (tabBtns.research) tabBtns.research.textContent = `🌱 Conservation${hasAffordableResearch && !engine.activeResearchId ? ' ❗' : ''}`;
  if (tabBtns.garden)   tabBtns.garden.textContent   = `🌿 Native Garden${hasAffordableGarden   && !engine.activePlantingId ? ' ❗' : ''}`;

  // Next crop unlock progress
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
  const totalSoldAllCrops = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);
  const nextCrop = Object.values(CROPS).find(ct => !ct.isUnlocked(engine.cropStats));
  if (!nextCrop || !nextCrop.unlockCriteria) {
    nextCropEl.textContent = '🏆 All crops unlocked!';
    nextCropEl.className   = 'next-crop-bar all-unlocked';
  } else {
    const { totalSold: required } = nextCrop.unlockCriteria;
    const soldPct  = Math.min(1, totalSoldAllCrops / required);
    const dstThumb = nextCrop.sciName ? inatThumbHtml(nextCrop.sciName, 'next-thumb', nextCrop.name) : '';

    // Estimate crops-sold rate (per real second) across all active in-season auto-sell zones
    let _cropsPerRealSec = 0;
    for (const _zd of FARM_ZONE_DEFS) {
      if (!engine.unlockedFarmZones.has(_zd.name)) continue;
      const _inst = engine.zoneCrops.get(_zd.name);
      if (!_inst) continue;
      const _ct = _inst.cropType;
      if (!_ct.isInSeason(engine.currentSeasonName)) continue;
      const _cyc = (_ct.totalPhases - 1) * _ct.growthTimePerPhase;
      if (_cyc <= 0) continue;
      const _acres = engine.zoneAcres.get(_zd.name) ?? 1;
      const _wm    = workerMultiplier(engine.zoneWorkers.get(_zd.name) ?? 1);
      _cropsPerRealSec += (_acres * _wm * engine.gameSpeed) / _cyc;
    }
    const _remaining  = required - totalSoldAllCrops;
    const _etaStr     = (_cropsPerRealSec > 0 && _remaining > 0)
      ? ` · ~${fmtDays(_remaining / (_cropsPerRealSec * DAY_REAL_SECS))}`
      : '';

    nextCropEl.className = 'next-crop-bar';
    nextCropEl.innerHTML = `
      <span class="next-label">Next crop unlock: ${dstThumb} ${nextCrop.name}</span>
      <span class="next-req">
        ${shortNumber(totalSoldAllCrops)}<span class="next-sep">/</span>${shortNumber(required)} total crops sold
        <span class="next-mini-bar"><span class="next-mini-fill" style="width:${Math.round(soldPct*100)}%"></span></span>
        <span class="next-eta">${_etaStr}</span>
      </span>
    `;
    // Load iNat photos into the newly rendered next-crop bar
    nextCropEl.querySelectorAll('img.inat-thumb[data-sci]').forEach(img => {
      const sci = img.dataset.sci;
      if (sci in inatPhotoCache) {
        const url = inatPhotoCache[sci];
        if (url) img.src = url;
      } else {
        fetchInatPhoto(sci).then(url => { if (url && img.isConnected) img.src = url; });
      }
    });
  }
}

// ── Duration formatter (real seconds) ────────────────────────────────────────
function fmtDur(secs) {
  if (secs < 60)   return `${secs.toFixed(1)}s`;
  if (secs < 3600) { const m = Math.floor(secs / 60), s = Math.round(secs % 60); return s ? `${m}m ${s}s` : `${m}m`; }
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── Duration formatter (in-game days) ─────────────────────────────────────────
function fmtDays(days) {
  if (days < 1) return '< 1 day';
  const d = Math.round(days);
  if (d < 365) return `${d} day${d !== 1 ? 's' : ''}`;
  const yrs = Math.floor(d / 365);
  const rem = d % 365;
  if (rem === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${rem} day${rem !== 1 ? 's' : ''}`;
}

/** Returns the next SEASONS entry in which the given CropType is active (wraps around the year). */
function nextSeasonFor(ct) {
  const cur = SEASONS.findIndex(s => s.name === engine.currentSeasonName);
  for (let i = 1; i <= 4; i++) {
    const s = SEASONS[(cur + i) % 4];
    if (ct.isInSeason(s.name)) return s;
  }
  return null;
}

/** Generate an iNaturalist taxa-search URL for a scientific name. */
function inatUrl(sci) {
  return `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(sci)}`;
}

// ── Time-to-afford helper ────────────────────────────────────────────────────
function timeToUnlock(cost) {
  const needed = cost - engine.gold.amount;
  if (needed <= 0) return null;
  const gps = engine.getTotalGPS() * engine.gameSpeed;
  if (gps <= 0) return null;
  const secs = needed / gps;
  if (secs < 60)   return `~${Math.ceil(secs)}s`;
  if (secs < 3600) return `~${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`;
  return `~${(secs / 3600).toFixed(1)}h`;
}

// ── CROPS TAB ────────────────────────────────────────────────────────────────
function renderCrops() {
  // ── Farm Zones ──
  const farmHeader = el('h2', 'section-header', '🌾 Farm Zones');
  content.appendChild(farmHeader);

  const dormantZones = [];
  FARM_ZONE_DEFS.forEach(def => {
    const unlocked = engine.unlockedFarmZones.has(def.name);
    if (unlocked) {
      const _ct = CROPS[def.cropId];
      if (_ct && !_ct.isInSeason(engine.currentSeasonName)) {
        dormantZones.push({ def, ct: _ct });
        return;
      }
    }
    const card = el('div', `zone-card${unlocked ? '' : ' locked'}`);

    if (!unlocked) {
      const boundCrop = CROPS[def.cropId];
      const lockRow = el('div', 'lock-row');
      lockRow.innerHTML = `
        <span class="lock-icon">🔒</span>
        ${boundCrop?.sciName ? inatThumbHtml(boundCrop.sciName, 'lock-thumb', boundCrop.name) : ''}
        <span class="zone-name">${boundCrop?.name ?? def.cropId}</span>
      `;
      card.appendChild(lockRow);
      if (boundCrop?.unlockCriteria) {
        const { totalSold: required } = boundCrop.unlockCriteria;
        const soldNow = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);
        const soldPct = Math.min(100, Math.round(soldNow / required * 100));
        const reqsEl  = el('div', 'unlock-reqs');
        reqsEl.innerHTML = `
          <span class="unlock-req">${shortNumber(soldNow)}<span class="next-sep">/</span>${shortNumber(required)} total crops sold
            <span class="next-mini-bar"><span class="next-mini-fill" style="width:${soldPct}%"></span></span>
          </span>
        `;
        card.appendChild(reqsEl);
      }
    } else {
      const instance = engine.zoneCrops.get(def.name);
      const ct       = instance?.cropType;
      const progress = instance?.overallProgress ?? 0;
      const currentSeason = engine.currentSeasonName;

      // Top row: iNat photo + crop name/sci meta + GPS
      const topRow = el('div', 'zone-top-row');
      const _wm  = workerMultiplier(engine.zoneWorkers.get(def.name) ?? 1);
      const _cyc = ct ? ct.totalGrowthTime / (engine.gameSpeed * _wm * 4) : 0;
      topRow.innerHTML = `
        ${ct?.sciName ? inatThumbHtml(ct.sciName, 'zone-thumb', ct.name) : ''}
        <div class="zone-name-meta">
          <span class="zone-name">${ct?.name ?? '—'}</span>
          <span class="zone-meta">${ct?.sciName ? `<em>${ct.sciName}</em> · ` : ''}${engine.zoneAcres.get(def.name) ?? 4} acres${ct ? ` · ⏱ ${fmtDur(_cyc)}` : ''}</span>
        </div>
        <span class="zone-gps">🪙 ${shortNumber((ct?.yieldGold ?? 0) * (engine.zoneAcres.get(def.name) ?? 4))} / harvest</span>
      `;
      card.appendChild(topRow);

      // Season badges
      if (ct) {
        const seasonBadges = el('div', 'zone-seasons');
        seasonBadges.innerHTML = ct.seasons.map(s => {
          const sObj = SEASONS.find(x => x.name === s);
          return `<span class="zone-season-badge${s === currentSeason ? ' active' : ''}">${sObj?.emoji ?? ''} ${s}</span>`;
        }).join('');
        card.appendChild(seasonBadges);
      }

      // Progress bar
      const barWrap = el('div', 'progress-wrap');
      const bar     = el('div', 'progress-bar');
      bar.style.width = `${(progress * 100).toFixed(3)}%`;
      const _wm2      = workerMultiplier(engine.zoneWorkers.get(def.name) ?? 1);
      const _remGame  = (instance && ct && !instance.isFullyGrown)
        ? ((ct.totalPhases - instance.phase) * ct.growthTimePerPhase - instance.timer)
        : 0;
      const _nearHarvest = instance && !instance.isFullyGrown && (_remGame / (engine.gameSpeed * _wm2)) <= 1;
      bar.classList.add(instance?.isFullyGrown ? 'ready' : _nearHarvest ? 'near-harvest' : 'growing');
      if (_nearHarvest) barWrap.classList.add('near-harvest');
      barWrap.appendChild(bar);
      // Phase milestone ticks on the bar
      if (ct?.growthPhaseNames?.length > 0) {
        const _totalSteps = ct.totalPhases - 1;
        ct.growthPhaseNames.forEach((_, _ti) => {
          if (_ti === 0) return; // skip left edge
          const _pct = (_ti / _totalSteps) * 100;
          const _passed = instance?.isFullyGrown || (instance && _ti <= instance.phase);
          const _tick = el('div', 'phase-tick' + (_passed ? ' passed' : ''));
          _tick.style.left = `${_pct}%`;
          barWrap.appendChild(_tick);
        });
      }
      const pctLabel = el('span', 'progress-pct', instance?.isFullyGrown ? 'Ready!' : `${Math.round(progress * 100)}%`);
      barWrap.appendChild(pctLabel);
      card.appendChild(barWrap);

      // Phase labels row
      if (ct?.growthPhaseNames?.length > 0) {
        const _labelsRow = el('div', 'phase-labels-row');
        const _totalSteps2 = ct.totalPhases - 1;
        ct.growthPhaseNames.forEach((phaseName, _li) => {
          const _pct2 = (_li / _totalSteps2) * 100;
          const _isCur = instance && !instance.isFullyGrown && _li === instance.phase;
          const _isPast = instance?.isFullyGrown || (instance && _li < instance.phase);
          const _lbl = el('span', 'phase-label' + (_isCur ? ' active' : _isPast ? ' passed' : ''));
          _lbl.textContent = phaseName;
          _lbl.style.left = `${_pct2}%`;
          _lbl.style.transform = _li === 0 ? 'translateX(0)' : 'translateX(-50%)';
          _labelsRow.appendChild(_lbl);
        });
        card.appendChild(_labelsRow);
      } else {
        const phaseRow = el('div', 'phase-row');
        phaseRow.textContent = ct
          ? instance.isFullyGrown
            ? `✅ Ready to harvest`
            : `Growing — stage ${instance.phase + 1} of ${ct.totalPhases}`
          : '';
        card.appendChild(phaseRow);
      }

      // Acre upgrade row
      const currentAcres = engine.zoneAcres.get(def.name) ?? 1;
      const acreRow = el('div', 'acre-upgrade-row');
      const acreCost = acreUpgradeCost(def, currentAcres);
      acreRow.innerHTML = `<span class="acre-label">Acres: <strong>${currentAcres}</strong></span>`;
      const acreBtn = el('button', 'buy-btn acre-btn', `+1 acre \u2014 \ud83e\ude99 ${shortNumber(acreCost)}`);
      acreBtn.disabled = engine.gold.amount < acreCost;
      acreBtn.dataset.zoneName = def.name;
      acreBtn.addEventListener('click', () => { engine.upgradeZoneAcres(def.name); renderAll(); });
      acreRow.appendChild(acreBtn);
      const acreTta = timeToUnlock(acreCost);
      if (acreTta) acreRow.appendChild(el('span', 'tta-label', acreTta));
      card.appendChild(acreRow);

      // Worker upgrade row
      const currentWorkers = engine.zoneWorkers.get(def.name) ?? 1;
      const workerRow  = el('div', 'acre-upgrade-row');
      const workerCost = workerUpgradeCost(def, currentWorkers);
      const mult       = workerMultiplier(currentWorkers);
      workerRow.innerHTML = `<span class="acre-label">Workers: <strong>${currentWorkers}</strong> <span style="color:#aaa;font-size:11px">(${mult.toFixed(2)}\u00d7 speed)</span></span>`;
      const wBtn = el('button', 'buy-btn acre-btn worker-btn', `+1 worker \u2014 \ud83e\ude99 ${shortNumber(workerCost)}`);
      wBtn.disabled = engine.gold.amount < workerCost;
      wBtn.dataset.zoneNameW = def.name;
      wBtn.addEventListener('click', () => { engine.upgradeZoneWorkers(def.name); renderAll(); });
      workerRow.appendChild(wBtn);
      const workerTta = timeToUnlock(workerCost);
      if (workerTta) workerRow.appendChild(el('span', 'tta-label', workerTta));
      card.appendChild(workerRow);
    }

    content.appendChild(card);
  });

  if (dormantZones.length > 0) {
    const ds = el('div', 'dormant-summary');
    ds.innerHTML = `<span class="dormant-summary-label">💤 Dormant this season:</span> `
      + dormantZones.map(({ def, ct }) => {
          const ns = nextSeasonFor(ct);
          return `<span class="dormant-item">${ct.name} <span class="dormant-next">${ns?.emoji ?? ''} ${ns?.name ?? ''}</span></span>`;
        }).join('<span class="dormant-sep">·</span>');
    content.appendChild(ds);
  }
}

// ── RANCH TAB ────────────────────────────────────────────────────────────────
function renderRanch() {
  const unlocked   = engine.unlockedRanchAnimals;
  const ranchAcres = engine.ranchAcres;
  const ranchWorkers = engine.ranchWorkers;
  const ranchStats = engine.ranchStats;
  const totalSoldAllCrops = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);

  const header = el('div', 'ranch-header');
  header.innerHTML = `
    <h2 class="ranch-title">🐄 Ranch</h2>
    <p class="ranch-subtitle">Unlock farm animals by selling crops. Each animal produces gold passively — expand with more acreage and hire workers to increase output.</p>
  `;
  content.appendChild(header);

  for (const animal of RANCH_ANIMAL_LIST) {
    const isUnlocked = unlocked.has(animal.id);

    if (!isUnlocked) {
      // ── Locked animal card ─────────────────────────────────────────────────
      const required = animal.unlockCriteria.totalSold;
      const pct      = Math.min(100, Math.round(totalSoldAllCrops / required * 100));
      const card = el('div', 'ranch-card ranch-card-locked');
      card.innerHTML = `
        <div class="ranch-card-head">
          <span class="ranch-animal-icon">${animal.icon}</span>
          ${inatThumbHtml(animal.sci, 'ranch-thumb', animal.name)}
          <div class="ranch-animal-names">
            <span class="ranch-animal-name">${animal.name}</span>
            <span class="ranch-animal-sci">${animal.sci}</span>
          </div>
          <span class="ranch-badge locked">🔒 Locked</span>
        </div>
        <div class="unlock-reqs">
          <span class="unlock-req">
            🌾 ${shortNumber(totalSoldAllCrops)}<span class="next-sep">/</span>${shortNumber(required)} total crops sold
            <span class="next-mini-bar"><span class="next-mini-fill" style="width:${pct}%"></span></span>
          </span>
        </div>
      `;
      content.appendChild(card);
      continue;
    }

    // ── Unlocked animal card ───────────────────────────────────────────────
    const acres   = ranchAcres.get(animal.id) ?? 1;
    const workers = ranchWorkers.get(animal.id) ?? 1;
    const wm      = workerMultiplier(workers);
    const stats   = ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
    const gps     = (animal.goldPerCycle * acres * wm * engine.getGoldMultiplier()) / animal.productionIntervalSecs;

    const acreCost   = acreUpgradeCost({ cost: animal.baseCost }, acres);
    const workerCost = workerUpgradeCost({ cost: animal.baseCost }, workers);
    const canAffordAcre   = engine.gold.amount >= acreCost;
    const canAffordWorker = engine.gold.amount >= workerCost;

    const card = el('div', 'ranch-card ranch-card-unlocked');

    // Header row
    const cardHead = el('div', 'ranch-card-head');
    cardHead.innerHTML = `
      ${inatThumbHtml(animal.sci, 'ranch-thumb', animal.name)}
      <div class="ranch-animal-names">
        <span class="ranch-animal-name">${animal.name}</span>
        <a class="ranch-animal-sci inat-link" href="${inatUrl(animal.sci)}" target="_blank" rel="noopener noreferrer">${animal.sci} ↗</a>
        <span class="ranch-product-label">📦 ${animal.product}</span>
      </div>
      <div class="ranch-gps">+${shortNumber(gps)}<span class="ranch-gps-unit">/s</span></div>
    `;
    card.appendChild(cardHead);

    // Care info
    const careEl = el('p', 'ranch-care', animal.care);
    card.appendChild(careEl);

    // Upgrades row
    const upgradeRow = el('div', 'ranch-upgrade-row');

    const acreGroup = el('div', 'ranch-upgrade-group');
    acreGroup.innerHTML = `<span class="ranch-upgrade-label">🌿 Acreage: <strong>${acres}</strong></span>`;
    const acreBtn = el('button', `action-btn ranch-upgrade-btn${canAffordAcre ? '' : ' disabled'}`,
      `+1 acre — 🪙 ${shortNumber(acreCost)}`);
    if (canAffordAcre) {
      acreBtn.addEventListener('click', () => { engine.upgradeRanchAcres(animal.id); renderAll(); });
    } else {
      acreBtn.disabled = true;
      const tta = el('span', 'upgrade-tta', `TTA: ${ttaLabel(acreCost - engine.gold.amount, engine.getTotalGPS() * engine.gameSpeed)}`);
      acreGroup.appendChild(tta);
    }
    acreGroup.appendChild(acreBtn);
    upgradeRow.appendChild(acreGroup);

    const workerGroup = el('div', 'ranch-upgrade-group');
    workerGroup.innerHTML = `<span class="ranch-upgrade-label">👷 Workers: <strong>${workers}</strong> <span class="worker-mult">(${wm.toFixed(2)}× speed)</span></span>`;
    const workerBtn = el('button', `action-btn ranch-upgrade-btn${canAffordWorker ? '' : ' disabled'}`,
      `+1 worker — 🪙 ${shortNumber(workerCost)}`);
    if (canAffordWorker) {
      workerBtn.addEventListener('click', () => { engine.upgradeRanchWorkers(animal.id); renderAll(); });
    } else {
      workerBtn.disabled = true;
      const tta = el('span', 'upgrade-tta', `TTA: ${ttaLabel(workerCost - engine.gold.amount, engine.getTotalGPS() * engine.gameSpeed)}`);
      workerGroup.appendChild(tta);
    }
    workerGroup.appendChild(workerBtn);
    upgradeRow.appendChild(workerGroup);

    card.appendChild(upgradeRow);

    // Stats row
    const statsEl = el('div', 'ranch-stats-row');
    statsEl.innerHTML = `
      <span>📦 Produced: <strong>${shortNumber(stats.produced)}</strong></span>
      <span>💰 Sold: <strong>${shortNumber(stats.sold)}</strong></span>
      <span>🪙 Earned: <strong>${shortNumber(stats.lifetimeSales)}g</strong></span>
    `;
    card.appendChild(statsEl);

    content.appendChild(card);
  }
}

// ── ARTISAN TAB ─────────────────────────────────────────────────────
function renderArtisan() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);

  // ── Artisan Workshops ──
  const artHeader = el('h2', 'section-header', '🏺 Artisan Workshops');
  content.appendChild(artHeader);

  ARTISAN_ZONE_DEFS.forEach(def => {
    const unlocked  = engine.artisanWS.unlockedSet.has(def.name);
    const card = el('div', `zone-card${unlocked ? '' : ' locked'}`);

    if (!unlocked) {
      const crop = CROPS[def.cropId];
      const ap   = crop?.artisanProduct;
      const lockRow = el('div', 'lock-row');
      lockRow.innerHTML = `
        <span class="lock-icon">🔒</span>
        <span class="zone-name">${def.name}</span>
        <span class="lock-crop">${cropIconHtml(CROP_ICON_GID[def.cropId], 16)} ${ap?.name ?? def.cropId}</span>
      `;
      card.appendChild(lockRow);
      if (ap) {
        const soldNow = engine.cropStats.get(def.cropId)?.sold ?? 0;
        const pct     = Math.min(100, Math.round(soldNow / ap.unlockCropSold * 100));
        const srcIcon = cropIconHtml(CROP_ICON_GID[def.cropId], 14);
        const reqsEl  = el('div', 'unlock-reqs');
        reqsEl.innerHTML = `
          <span class="unlock-req">${srcIcon} ${shortNumber(soldNow)}<span class="next-sep">/</span>${shortNumber(ap.unlockCropSold)} ${crop.name} sold
            <span class="next-mini-bar"><span class="next-mini-fill" style="width:${pct}%"></span></span>
          </span>
        `;
        card.appendChild(reqsEl);
      }
    } else {
      const cropId      = engine.artisanWS.zoneProductMap.get(def.name);
      const ct          = cropId ? CROPS[cropId] : null;
      const ap          = ct?.artisanProduct ?? null;
      const apUnlocked  = ap && (engine.cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold;
      const artProgress = (engine.artisanTimers.get(def.name) ?? 0) / engine.artisanWS.act.productionIntervalSecs;
      const artWorkers  = engine.artisanWorkers.get(def.name) ?? 1;
      const artMult     = workerMultiplier(artWorkers);

      const _batchSecs = engine.artisanWS.act.productionIntervalSecs / (engine.gameSpeed * artMult * 4);
      const topRow = el('div', 'zone-top-row');
      topRow.innerHTML = `
        ${cropId && apUnlocked ? cropIconHtml(CROP_ICON_GID[cropId]) : '<span class="zone-emoji">🏺</span>'}
        <span class="zone-name">${def.name}</span>
        <span class="zone-meta">${apUnlocked ? `${ap.name} · ⏱ ${fmtDur(_batchSecs)}` : (ap ? '⏳ Unlocking…' : '— unassigned —')}</span>
        ${apUnlocked ? `<span class="zone-gps">🪙 ${shortNumber(ap.goldValue)} / batch</span>` : ''}
      `;
      card.appendChild(topRow);

      const barWrap = el('div', 'progress-wrap');
      const bar     = el('div', 'progress-bar amber');
      bar.style.width = apUnlocked ? `${Math.round(artProgress * 100)}%` : '0%';
      barWrap.appendChild(bar);
      if (!apUnlocked && ap) {
        const sold     = engine.cropStats.get(cropId)?.sold ?? 0;
        const pctLabel = el('span', 'progress-pct', `${shortNumber(sold)} / ${shortNumber(ap.unlockCropSold)} sold`);
        barWrap.appendChild(pctLabel);
      } else if (apUnlocked) {
        const inv = engine.artisanWS.productInventory.get(`${cropId}_artisan`) || 0;
        const pctLabel = el('span', 'progress-pct', `${Math.round(artProgress * 100)}% · Inv: ${inv}`);
        barWrap.appendChild(pctLabel);
      }
      card.appendChild(barWrap);

      // Worker upgrade row
      const artWorkerCost  = workerUpgradeCost(def, artWorkers);
      const artWorkerRow   = el('div', 'acre-upgrade-row');
      artWorkerRow.innerHTML = `<span class="acre-label">Workers: <strong>${artWorkers}</strong> <span style="color:#aaa;font-size:11px">(${artMult.toFixed(2)}× speed)</span></span>`;
      const wBtn = el('button', 'buy-btn acre-btn worker-btn', `+1 worker — 🪙 ${shortNumber(artWorkerCost)}`);
      wBtn.disabled = engine.gold.amount < artWorkerCost;
      wBtn.dataset.artZoneNameW = def.name;
      wBtn.addEventListener('click', () => { engine.upgradeArtisanWorkers(def.name); renderAll(); });
      artWorkerRow.appendChild(wBtn);
      const artWorkerTta = timeToUnlock(artWorkerCost);
      if (artWorkerTta) artWorkerRow.appendChild(el('span', 'tta-label', artWorkerTta));
      card.appendChild(artWorkerRow);
    }

    content.appendChild(card);
  });
}

// ── RESEARCH TAB ─────────────────────────────────────────────────────────────
function renderResearch() {
  const completed  = engine.completedResearch;
  const activeId   = engine.activeResearchId;
  const activeTimer= engine.activeResearchTimer;
  const pts        = engine.researchPoints;
  const planted    = engine.plantedSpecies;
  const biosphere    = engine.getBiosphereScore();
  const gardenBio    = engine.getGardenBiosphereScore();
  const creatureBio  = engine.getCreatureBiosphereScore();
  const totalBio     = biosphere + gardenBio + creatureBio;
  const maxBiosphere = RESEARCH.reduce((s, r) => s + (r.effect?.biosphereBonus ?? 0), 0);
  const maxGardenBio = ALL_PLANTS.reduce((s, p) => s + (p.biosphereBonus ?? 0), 0);
  const maxCreatureBio = ALL_PLANTS.reduce((s, p) => s + (p.insectsHosted?.length ?? 0), 0);
  const maxTotal     = maxBiosphere + maxGardenBio + maxCreatureBio;
  const goldMult     = engine.getGoldMultiplier();

  // ── Biosphere Score banner ──────────────────────────────────────────────────
  const banner = el('div', 'research-banner');
  const bioPct    = Math.round(totalBio / maxTotal * 100);
  const gardenPct = maxGardenBio > 0 ? Math.round(gardenBio / maxGardenBio * 100) : 0;
  banner.innerHTML = `
    <div class="research-banner-row">
      <span class="bio-label">🌍 Biosphere Score</span>
      <span class="bio-score">${totalBio} <span class="bio-max">/ ${maxTotal}</span></span>
      <span class="research-pts">🌱 ${pts} CP</span>
    </div>
    <div class="bio-bar-track"><div class="bio-bar-fill" style="width:${bioPct}%"></div></div>
    <div class="bio-breakdown">
      <span>🌱 Conservation: <strong>${biosphere}</strong></span>
      <span>🌿 Garden: <strong>${gardenBio}</strong> / ${maxGardenBio} &nbsp;<span style="color:#aaa;font-size:11px">(${gardenPct}%)</span></span>
      <span>🦋 Creatures: <strong>${creatureBio}</strong> / ${maxCreatureBio}</span>
      <span>💰 Gold Bonus: <strong>${goldMult.toFixed(2)}×</strong></span>
    </div>
    <p class="research-hint">Conservation points are earned passively — ${engine.unlockedFarmZones.size} CP/day from your ${engine.unlockedFarmZones.size} unlocked farm zone${engine.unlockedFarmZones.size !== 1 ? 's' : ''}. Plant native species in the 🌿 Garden tab to add more.</p>
  `;
  content.appendChild(banner);

  // ── Active research card ────────────────────────────────────────────────────
  if (activeId) {
    const project = RESEARCH.find(r => r.id === activeId);
    const pct     = project ? Math.min(100, Math.round(activeTimer / project.duration * 100)) : 0;
    const remaining = project ? Math.max(0, project.duration - activeTimer) : 0;

    const activeCard = el('div', 'research-active-card');
    activeCard.innerHTML = `
      <div class="research-active-header">
        <span class="research-active-icon">${project?.icon ?? '🌱'}</span>
        <span class="research-active-name">${project?.name ?? activeId}</span>
        <span class="research-active-time">${fmtDays(remaining)} remaining</span>
      </div>
      <div class="research-progress-track">
        <div class="research-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="research-active-footer">
        <span class="research-active-pct">${pct}% complete</span>
        <button class="action-btn danger research-cancel-btn">✕ Cancel</button>
      </div>
    `;
    activeCard.querySelector('.research-cancel-btn').addEventListener('click', () => {
      engine.cancelResearch();
      renderAll();
    });
    content.appendChild(activeCard);
  } else {
    const idleNote = el('p', 'research-idle-note', '— No project in progress. Start one below. —');
    content.appendChild(idleNote);
  }

  // ── Hide-completed toggle ────────────────────────────────────────────────
  const researchDoneCount = RESEARCH.filter(r => completed.has(r.id)).length;
  const researchToggleBar = el('div', 'tab-toggle-bar');
  const researchToggleBtn = el('button',
    `tab-toggle-btn${hideCompletedResearch ? ' active' : ''}`,
    hideCompletedResearch
      ? `👁 Show completed (${researchDoneCount})`
      : `✓ Hide completed (${researchDoneCount})`
  );
  researchToggleBtn.addEventListener('click', () => {
    hideCompletedResearch = !hideCompletedResearch;
    localStorage.setItem('hideCompletedResearch', hideCompletedResearch);
    renderAll();
  });
  researchToggleBar.appendChild(researchToggleBtn);
  content.appendChild(researchToggleBar);

  // ── Category sections ──────────────────────────────────────────────────────
  for (const cat of Object.values(RESEARCH_CATEGORIES)) {
    const catProjects = RESEARCH.filter(r => r.category === cat.id);
    const section = el('div', 'research-section');

    const catHeader = el('h2', 'section-header', cat.label);
    section.appendChild(catHeader);

    const catDesc = el('p', 'research-cat-desc', cat.desc);
    section.appendChild(catDesc);

    for (const project of catProjects) {
      const isDone   = completed.has(project.id);
      if (hideCompletedResearch && isDone) continue;
      const isActive = activeId === project.id;
      const prereqsMet = project.requires.every(req => completed.has(req));
      const canAfford  = pts >= project.cost;
      const canStart   = prereqsMet && canAfford && !isDone && !activeId;

      const card = el('div', `research-card${isDone ? ' research-done' : ''}${isActive ? ' research-in-progress' : ''}${!prereqsMet ? ' research-locked' : ''}`);

      // Header row
      const cardHead = el('div', 'research-card-head');
      cardHead.innerHTML = `<span class="research-icon">${project.icon}</span><span class="research-name">${project.name}</span>`;

      // Status badge
      const badge = el('span', 'research-badge');
      if (isDone) {
        badge.className = 'research-badge done';
        badge.textContent = '✅ Complete';
      } else if (isActive) {
        badge.className = 'research-badge active';
        badge.textContent = '🌱 In Progress…';
      } else if (!prereqsMet) {
        badge.className = 'research-badge locked';
        badge.textContent = '🔒 Locked';
      } else {
        badge.className = 'research-badge available';
        badge.textContent = `🌱 ${project.cost} CP · ${fmtDays(project.duration)}`;
      }
      cardHead.appendChild(badge);
      card.appendChild(cardHead);

      // Description + flavor
      const descEl = el('p', 'research-desc', project.desc);
      card.appendChild(descEl);
      const flavor = el('p', 'research-flavor', project.flavorText);
      card.appendChild(flavor);

      // Effect & prerequisites
      const meta = el('div', 'research-meta');
      meta.innerHTML = `<span class="research-effect">✨ ${project.effect.label}</span>`;
      if (project.requires.length > 0) {
        const reqNames = project.requires.map(req => {
          const r = RESEARCH.find(p => p.id === req);
          const met = completed.has(req);
          return `<span class="research-req${met ? ' met' : ''}">${met ? '✅' : '🔒'} ${r?.name ?? req}</span>`;
        });
        meta.innerHTML += `&nbsp;·&nbsp; Requires: ${reqNames.join(', ')}`;
      }

      // Plants unlocked by this research
      const unlockedByThis = ALL_PLANTS.filter(p =>
        (p.requiresResearch ?? []).includes(project.id)
      );
      if (unlockedByThis.length > 0) {
        const plantNames = unlockedByThis.map(p => {
          const isPlanted = planted.has(p.id);
          return `<span class="research-unlocks-plant${isPlanted ? ' planted' : ''}">${p.icon ?? '🌿'} ${p.name}${isPlanted ? ' ✅' : ''}</span>`;
        }).join(', ');
        meta.innerHTML += `<br><span class="research-unlocks-label">🌿 Unlocks plants:</span> ${plantNames}`;
      }

      card.appendChild(meta);

      // Action button
      if (!isDone && !isActive) {
        const btnRow = el('div', 'btn-row');
        const btn = el('button', `action-btn${canStart ? '' : ' disabled'}`, canStart ? '▶ Start Project' : (!prereqsMet ? '🔒 Prerequisites needed' : `🌱 Need ${project.cost - pts} more CP`));
        if (canStart) {
          btn.addEventListener('click', () => { engine.startResearch(project.id); renderAll(); });
        } else {
          btn.disabled = true;
        }
        btnRow.appendChild(btn);
        card.appendChild(btnRow);
      }

      section.appendChild(card);
    }

    content.appendChild(section);
  }
}
// ── NATIVE GARDEN TAB ───────────────────────────────────────────────────────
function renderGarden() {
  const planted           = engine.plantedSpecies;
  const activePId         = engine.activePlantingId;
  const activePTimer      = engine.activePlantingTimer;
  const pts               = engine.researchPoints;
  const completedResearch = engine.completedResearch;
  const researchById      = Object.fromEntries(RESEARCH.map(r => [r.id, r]));

  // ── Hide-planted toggle ─────────────────────────────────────────────────
  const gardenPlantedCount = ALL_PLANTS.filter(p => planted.has(p.id)).length;
  const gardenToggleBar = el('div', 'tab-toggle-bar');
  const gardenToggleBtn = el('button',
    `tab-toggle-btn${hideCompletedGarden ? ' active' : ''}`,
    hideCompletedGarden
      ? `👁 Show planted (${gardenPlantedCount})`
      : `✓ Hide planted (${gardenPlantedCount})`
  );
  gardenToggleBtn.addEventListener('click', () => {
    hideCompletedGarden = !hideCompletedGarden;
    localStorage.setItem('hideCompletedGarden', hideCompletedGarden);
    renderAll();
  });
  gardenToggleBar.appendChild(gardenToggleBtn);

  // ── Hide-locked toggle ──────────────────────────────────────────────────
  const gardenLockedCount = ALL_PLANTS.filter(p =>
    !(p.requiresResearch ?? []).every(rid => completedResearch.has(rid))
  ).length;
  const gardenLockedBtn = el('button',
    `tab-toggle-btn${hideLockedGarden ? ' active' : ''}`,
    hideLockedGarden
      ? `👁 Show locked (${gardenLockedCount})`
      : `🔒 Hide locked (${gardenLockedCount})`
  );
  gardenLockedBtn.addEventListener('click', () => {
    hideLockedGarden = !hideLockedGarden;
    localStorage.setItem('hideLockedGarden', hideLockedGarden);
    renderAll();
  });
  gardenToggleBar.appendChild(gardenLockedBtn);

  const allPlantIds = ALL_PLANTS.map(p => p.id);
  const allCollapsed = allPlantIds.every(id => collapsedGardenCards.has(id));
  const collapseAllBtn = el('button', 'tab-toggle-btn', allCollapsed ? '▶ Expand all' : '▼ Collapse all');
  collapseAllBtn.addEventListener('click', () => {
    if (allCollapsed) allPlantIds.forEach(id => collapsedGardenCards.delete(id));
    else              allPlantIds.forEach(id => collapsedGardenCards.add(id));
    renderAll();
  });
  gardenToggleBar.appendChild(collapseAllBtn);
  content.appendChild(gardenToggleBar);

  for (const ecoregion of ECOREGIONS) {
    // ── Ecoregion header ─────────────────────────────────────────────────────────
    const plantedCount = ecoregion.plants.filter(p => planted.has(p.id)).length;
    const totalCount   = ecoregion.plants.length;
    const ecoComplete  = plantedCount === totalCount;
    const ecoPct       = Math.round(plantedCount / totalCount * 100);

    const ecoHeader = el('div', `eco-header${ecoComplete ? ' eco-complete' : ''}`);
    ecoHeader.innerHTML = `
      <div class="eco-header-row">
        <span class="eco-icon">${ecoregion.icon}</span>
        <span class="eco-name">${ecoregion.label}</span>
        <span class="eco-progress-text">${plantedCount} / ${totalCount} planted</span>
        ${ecoComplete ? '<span class="eco-badge-complete">🏆 Complete!</span>' : ''}
      </div>
      <p class="eco-desc">${ecoregion.desc}</p>
      <div class="bio-bar-track" style="margin-top:8px">
        <div class="bio-bar-fill garden-fill" style="width:${ecoPct}%"></div>
      </div>
      <p class="eco-hnp-link">Source: <a href="${ecoregion.hnpUrl}" target="_blank" rel="noopener noreferrer" class="eco-link">Homegrown National Park – Keystone Plants ↗</a></p>
    `;
    content.appendChild(ecoHeader);

    // ── Active planting card ──────────────────────────────────────────────────────────
    const activePlant = activePId ? ecoregion.plants.find(p => p.id === activePId) : null;
    if (activePlant) {
      const pct       = Math.min(100, Math.round(activePTimer / activePlant.duration * 100));
      const remaining = Math.max(0, activePlant.duration - activePTimer);
      const activeCard = el('div', 'research-active-card garden-active-card');
      activeCard.innerHTML = `
        <div class="research-active-header">
          <span class="research-active-icon">${activePlant.icon}</span>
          <span class="research-active-name">Planting ${activePlant.name}…</span>
          <span class="research-active-time">${fmtDays(remaining)} remaining</span>
        </div>
        <div class="research-progress-track">
          <div class="research-progress-fill garden-progress" style="width:${pct}%"></div>
        </div>
        <div class="research-active-footer">
          <span class="research-active-pct">${pct}% established</span>
          <button class="action-btn danger research-cancel-btn">✕ Cancel</button>
        </div>
      `;
      activeCard.querySelector('.research-cancel-btn').addEventListener('click', () => {
        engine.cancelPlanting();
        renderAll();
      });
      content.appendChild(activeCard);
    } else if (!activePId) {
      const idleNote = el('p', 'research-idle-note', '— No plant being established. Choose one below. —');
      content.appendChild(idleNote);
    }

    // ── Plant type sections ──────────────────────────────────────────────────────────────
    const typeGroups = [
      { type: 'flower',  label: '🌸 Wildflowers & Groundcovers' },
      { type: 'shrub',   label: '🌿 Shrubs' },
      { type: 'tree',    label: '🌳 Trees' },
    ];

    for (const { type, label } of typeGroups) {
      const groupPlants = ecoregion.plants.filter(p => p.type === type);
      if (groupPlants.length === 0) continue;

      const groupHeader = el('h2', 'section-header', label);
      content.appendChild(groupHeader);

      for (const plant of groupPlants) {
        const isPlanted  = planted.has(plant.id);
        if (hideCompletedGarden && isPlanted) continue;
        const isActive   = activePId === plant.id;
        const canAfford  = pts >= plant.cost;
        const canPlant   = canAfford && !isPlanted && !activePId;
        const isUnlocked = (plant.requiresResearch ?? []).every(rid => completedResearch.has(rid));

        // ── Locked card (research prerequisite not met) ───────────────────────────
        if (!isUnlocked) {
          if (hideLockedGarden) continue;
          const lockedReqs = (plant.requiresResearch ?? []).filter(rid => !completedResearch.has(rid));
          const reqNames   = lockedReqs.map(rid => researchById[rid]?.name ?? rid).join(', ');
          const lockedCard = el('div', 'garden-card garden-card-locked');
          lockedCard.innerHTML = `
            <div class="garden-card-head">
              <span class="garden-plant-icon">🔒</span>
              ${inatThumbHtml(plant.sci, 'garden-thumb', plant.name)}
              <div class="garden-plant-names">
                <span class="garden-plant-name">${plant.name}</span>
                <a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>
              </div>
              <div class="garden-badges">
                <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
              </div>
            </div>
            <p class="garden-locked-msg">🌱 Requires project: <strong>${reqNames}</strong></p>
          `;
          content.appendChild(lockedCard);
          continue;
        }

        const card = el('div', `garden-card${isPlanted ? ' garden-planted' : ''}${isActive ? ' garden-active' : ''}`);
        const isCollapsed = collapsedGardenCards.has(plant.id);

        // ── Card header row: iNat photo + name + badges + collapse toggle ───────────────
        const cardHead = el('div', 'garden-card-head garden-card-head-clickable');
        cardHead.innerHTML = `
          ${inatThumbHtml(plant.sci, 'garden-thumb', plant.name)}
          <div class="garden-plant-names">
            <span class="garden-plant-name">${plant.name}</span>
            <a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>
          </div>
          <div class="garden-badges">
            <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
            ${isPlanted ? '<span class="garden-status-badge planted">✅ Planted</span>' : ''}
            ${isActive  ? '<span class="garden-status-badge active">🌱 Establishing…</span>' : ''}
          </div>
          <button class="garden-collapse-btn" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '▶' : '▼'}</button>
        `;
        // Toggle on header click (but not on inat link clicks)
        cardHead.addEventListener('click', e => {
          if (e.target.closest('.inat-link')) return;
          if (collapsedGardenCards.has(plant.id)) collapsedGardenCards.delete(plant.id);
          else collapsedGardenCards.add(plant.id);
          renderAll();
        });
        card.appendChild(cardHead);

        // ── Collapsible body ──────────────────────────────────────────────────────
        if (isCollapsed) { content.appendChild(card); continue; }
        const cardBody = el('div', 'garden-card-body');

        // ── Plant description ─────────────────────────────────────────────────────
        const plantMeta = el('div', 'garden-plant-meta');
        plantMeta.innerHTML = `
          <span class="garden-meta-item">↕️ ${plant.height}</span>
          <span class="garden-meta-item">🌱 ${plant.seasonOfInterest}</span>
          ${plant.caterpillarSpp ? `<span class="garden-meta-item caterpillar-count">🐦 ${plant.caterpillarSpp}+ caterpillar species</span>` : ''}
        `;
        cardBody.appendChild(plantMeta);

        const descEl = el('p', 'garden-desc', plant.desc);
        cardBody.appendChild(descEl);

        // ── Insects & Wildlife hosted (educational section) ───────────────────────
        const insectSection = el('div', 'garden-insect-section');
        insectSection.innerHTML = '<div class="garden-insect-header">🦸 Insects & Wildlife Hosted</div>';

        for (const creature of plant.insectsHosted) {
          const typeIcon = WILDLIFE_TYPE_ICONS[creature.type] ?? '🐞';
          const insectRow = el('div', `garden-insect-row insect-type-${creature.type}`);
          insectRow.innerHTML = `
            <div class="garden-insect-label">
              <span class="insect-type-icon">${typeIcon}</span>
              <span class="insect-name">${creature.name}</span>
              ${creature.sci ? `<a class="insect-sci inat-link" href="${inatUrl(creature.sci)}" target="_blank" rel="noopener noreferrer">(${creature.sci}) ↗</a>` : ''}
            </div>
            <div class="insect-role-badge">${creature.role}</div>
            <p class="insect-note">${creature.note}</p>
          `;
          insectSection.appendChild(insectRow);
        }

        if (plant.wildlifeNote) {
          const wildlifeEl = el('div', 'garden-wildlife-note');
          wildlifeEl.innerHTML = `<span class="wildlife-note-icon">🌿</span> ${plant.wildlifeNote}`;
          insectSection.appendChild(wildlifeEl);
        }

        cardBody.appendChild(insectSection);

        // ── Cost & action row ──────────────────────────────────────────────────────────────
        if (!isPlanted) {
          const actionRow = el('div', 'garden-action-row');
          const bonusLabel = el('span', 'garden-bonus-label', `🌍 +${plant.biosphereBonus} Biosphere`);
          actionRow.appendChild(bonusLabel);

          const btn = el('button',
            `action-btn${canPlant ? ' garden-plant-btn' : ' disabled'}`,
            isActive ? `🌱 Establishing… ${fmtDays(Math.max(0, plant.duration - activePTimer))}`
            : canPlant ? `🌱 Establish — ${plant.cost} CP · ${fmtDays(plant.duration)}`
            : !activePId ? `🌱 Need ${plant.cost - pts} more CP`
            : 'Busy establishing another plant'
          );
          if (canPlant) {
            btn.addEventListener('click', () => {
              const result = engine.startPlanting(plant.id);
              if (result.ok) renderAll();
            });
          } else {
            btn.disabled = true;
          }
          actionRow.appendChild(btn);
          cardBody.appendChild(actionRow);
        }

        card.appendChild(cardBody);
        content.appendChild(card);
      }
    }
  }
}

// ── Creature type display config ──────────────────────────────────────────────
const CREATURE_TYPE_META = {
  butterfly: { label: 'Butterfly', icon: '🦋', plural: 'Butterflies' },
  moth:      { label: 'Moth',      icon: '🌙', plural: 'Moths'       },
  bee:       { label: 'Bee',       icon: '🐝', plural: 'Bees'        },
  fly:       { label: 'Fly',       icon: '🪰', plural: 'Flies'       },
  beetle:    { label: 'Beetle',    icon: '🪲', plural: 'Beetles'     },
  wasp:      { label: 'Wasp',      icon: '⚗️',  plural: 'Wasps'      },
  bird:      { label: 'Bird',      icon: '🐦', plural: 'Birds'       },
  mammal:    { label: 'Mammal',    icon: '🐿️', plural: 'Mammals'     },
};

// ── COLLECTION TAB ────────────────────────────────────────────────────────────
function renderCollection() {
  const planted    = engine.plantedSpecies;
  const discovered = engine.discoveredCreatures;
  const pityMap    = engine.creaturePity;
  const PITY_DAYS  = engine.CREATURE_PITY_DAYS;

  // Build flat lookup: creatureKey → { creature, plant, eco }
  const creatureMap = new Map();
  for (const eco of ECOREGIONS) {
    for (const plant of eco.plants) {
      for (const creature of (plant.insectsHosted ?? [])) {
        creatureMap.set(engine.creatureKey(plant.id, creature.name), { creature, plant, eco });
      }
    }
  }
  const totalCreatures  = creatureMap.size;
  const discoveredCount = [...discovered].filter(k => creatureMap.has(k)).length;
  const unlockedCrops        = Object.values(CROPS).filter(ct => ct.isUnlocked(engine.cropStats));
  const unlockedRanchAnimals = engine.unlockedRanchAnimals;

  // ── Biosphere banner ────────────────────────────────────────────────────────
  const researchBio      = engine.getBiosphereScore();
  const gardenBio        = engine.getGardenBiosphereScore();
  const creatureBio      = engine.getCreatureBiosphereScore();
  const totalBio         = researchBio + gardenBio + creatureBio;
  const maxResearchBio   = RESEARCH.reduce((s, r) => s + (r.effect?.biosphereBonus ?? 0), 0);
  const maxGardenBio     = ALL_PLANTS.reduce((s, p) => s + (p.biosphereBonus ?? 0), 0);
  const maxTotal         = maxResearchBio + maxGardenBio + totalCreatures;
  const goldMult         = engine.getGoldMultiplier();
  const bioPct           = maxTotal > 0 ? Math.round(totalBio / maxTotal * 100) : 0;
  const completedResearchCount = engine.completedResearch.size;
  const totalResearchCount     = RESEARCH.length;
  const plantedCount           = planted.size;
  const totalPlantCount        = ALL_PLANTS.length;

  const banner = el('div', 'research-banner');
  banner.innerHTML = `
    <div class="research-banner-row">
      <span class="bio-label">🌍 Biosphere Score</span>
      <span class="bio-score">${totalBio} <span class="bio-max">/ ${maxTotal}</span></span>
    </div>
    <div class="bio-bar-track"><div class="bio-bar-fill" style="width:${bioPct}%"></div></div>
    <div class="bio-breakdown">
      <span>🌱 Conservation: <strong>${completedResearchCount}</strong> / ${totalResearchCount}</span>
      <span>🌿 Plants: <strong>${plantedCount}</strong> / ${totalPlantCount}</span>
      <span>🦋 Creatures: <strong>${discoveredCount}</strong> / ${totalCreatures}</span>
      <span>💰 Gold Bonus: <strong>${goldMult.toFixed(2)}×</strong></span>
    </div>
  `;
  content.appendChild(banner);

  const showCrops     = collectionFilter === 'all' || collectionFilter === 'crops';
  const showPlants    = collectionFilter === 'all' || collectionFilter === 'plants';
  const showCreatures = collectionFilter === 'all' || collectionFilter === 'creatures';
  const showRanch     = collectionFilter === 'all' || collectionFilter === 'ranch';
  const showHistory   = collectionFilter === 'history';

  // ── Filter bar ──────────────────────────────────────────────────────────────
  const filterBar = el('div', 'collection-filter-bar');
  const filterDefs = [
    { key: 'all',       label: 'All'                                                  },
    { key: 'crops',     label: `🌾 Crops (${unlockedCrops.length})`                 },
    { key: 'plants',    label: `🌿 Native Plants (${planted.size})`                 },
    { key: 'creatures', label: `🦋 Creatures (${discoveredCount})`                  },
    { key: 'ranch',     label: `🐄 Ranch Animals (${unlockedRanchAnimals.size})`   },
    { key: 'history',   label: `📊 History (${discoveredCount})` },
  ];
  for (const fd of filterDefs) {
    const btn = el('button', `collection-filter-btn${collectionFilter === fd.key ? ' active' : ''}`, fd.label);
    btn.addEventListener('click', () => { collectionFilter = fd.key; renderAll(); });
    filterBar.appendChild(btn);
  }

  // Collapse-all / expand-all toggle (only relevant when plants section is shown)
  if (showPlants && planted.size > 0) {
    const toggleAllBtn = el('button', `collection-filter-btn collection-collapse-all-btn`, collectionAllCollapsed ? '▶ Expand All' : '▼ Collapse All');
    toggleAllBtn.addEventListener('click', () => {
      collectionAllCollapsed = !collectionAllCollapsed;
      if (collectionAllCollapsed) {
        for (const eco of ECOREGIONS) for (const p of eco.plants) if (planted.has(p.id)) collectionCreaturesCollapsed.add(p.id);
      } else {
        collectionCreaturesCollapsed.clear();
      }
      renderAll();
    });
    filterBar.appendChild(toggleAllBtn);
  }

  content.appendChild(filterBar);

  // ── Crops ───────────────────────────────────────────────────────────────────
  if (showCrops) {
    content.appendChild(el('h2', 'section-header', `🌾 Crops — ${unlockedCrops.length} of ${Object.keys(CROPS).length} unlocked`));
    if (unlockedCrops.length === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Sell crops in the 🌾 Crops tab to unlock new varieties. —'));
    }
    for (const ct of unlockedCrops) {
      const stats = engine.cropStats.get(ct.id) ?? { grown: 0, sold: 0, lifetimeSales: 0 };
      const ap    = ct.artisanProduct;
      const apUnlocked = ap && stats.sold >= ap.unlockCropSold;
      const card = el('div', 'collection-crop-card');
      const cardHead = el('div', 'collection-crop-head');
      const seasonHtml = ct.seasons.map(s => {
        const sObj = SEASONS.find(x => x.name === s);
        return `<span class="zone-season-badge active">${sObj?.emoji ?? ''} ${s}</span>`;
      }).join('');
      cardHead.innerHTML = `
        ${ct.sciName ? inatThumbHtml(ct.sciName, 'collection-crop-thumb', ct.name) : ''}
        <div class="collection-crop-names">
          <span class="collection-plant-name">${ct.name}</span>
          ${ct.sciName ? `<a class="garden-plant-sci inat-link" href="${inatUrl(ct.sciName)}" target="_blank" rel="noopener noreferrer">${ct.sciName} ↗</a>` : ''}
          <div class="collection-crop-seasons">${seasonHtml}</div>
        </div>
        <div class="collection-crop-stats">
          <span class="collection-crop-stat">🌾 Harvested: <strong>${shortNumber(stats.grown)}</strong></span>
          <span class="collection-crop-stat">💰 Sold: <strong>${shortNumber(stats.sold)}</strong></span>
          <span class="collection-crop-stat">🪙 Earned: <strong>${shortNumber(stats.lifetimeSales)}g</strong></span>
          ${ap ? `<span class="collection-crop-stat collection-crop-artisan${apUnlocked ? ' unlocked' : ''}">
            🏺 ${ap.name}${apUnlocked ? ' ✅' : ` — unlock at ${shortNumber(ap.unlockCropSold)} sold`}
          </span>` : ''}
        </div>
      `;
      card.appendChild(cardHead);
      content.appendChild(card);
    }
  }

  // ── Ranch Animals ──────────────────────────────────────────────────────────
  if (showRanch) {
    content.appendChild(el('h2', 'section-header', `🐄 Ranch Animals — ${unlockedRanchAnimals.size} of ${RANCH_ANIMAL_LIST.length} unlocked`));
    if (unlockedRanchAnimals.size === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Sell crops in the 🌾 Crops tab to unlock ranch animals. —'));
    }
    for (const animal of RANCH_ANIMAL_LIST) {
      if (!unlockedRanchAnimals.has(animal.id)) continue;
      const stats = engine.ranchStats.get(animal.id) ?? { produced: 0, sold: 0, lifetimeSales: 0 };
      const card = el('div', 'collection-crop-card');
      const cardHead = el('div', 'collection-crop-head');
      cardHead.innerHTML = `
        ${animal.sci ? inatThumbHtml(animal.sci, 'collection-crop-thumb', animal.name) : `<span style="font-size:48px;flex-shrink:0">${animal.icon}</span>`}
        <div class="collection-crop-names">
          <span class="collection-plant-name">${animal.name}</span>
          ${animal.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(animal.sci)}" target="_blank" rel="noopener noreferrer">${animal.sci} ↗</a>` : ''}
          <span style="font-size:12px;color:#aaa;display:block;margin-top:4px">Product: ${animal.product}</span>
        </div>
        <div class="collection-crop-stats">
          <span class="collection-crop-stat">🐄 Cycles: <strong>${shortNumber(stats.produced)}</strong></span>
          <span class="collection-crop-stat">💰 Sold: <strong>${shortNumber(stats.sold)}</strong></span>
          <span class="collection-crop-stat">🪙 Earned: <strong>${shortNumber(stats.lifetimeSales)}g</strong></span>
        </div>
      `;
      card.appendChild(cardHead);
      const careP = el('p', 'ranch-care', animal.care);
      card.appendChild(careP);
      content.appendChild(card);
    }
  }

  // ── Native Plants ───────────────────────────────────────────────────────────
  if (showPlants) {
    content.appendChild(el('h2', 'section-header', `🌿 Native Plants — ${planted.size} established`));

    if (planted.size === 0) {
      content.appendChild(el('p', 'research-idle-note', '— Plant native species in the 🌿 Garden tab to begin your collection. —'));
    }

    for (const eco of ECOREGIONS) {
      for (const plant of eco.plants) {
        if (!planted.has(plant.id)) continue;

        const plantCreatures  = plant.insectsHosted ?? [];
        const discoveredHere  = plantCreatures.filter(c => discovered.has(engine.creatureKey(plant.id, c.name))).length;
        const totalHere       = plantCreatures.length;
        const allFound        = discoveredHere === totalHere;

        const card = el('div', 'collection-plant-card');

        // Card head: photo + name + meta + badges
        const cardHead = el('div', 'collection-plant-head');
        cardHead.innerHTML = `
          ${inatThumbHtml(plant.sci, 'collection-plant-thumb', plant.name)}
          <div class="collection-plant-names">
            <span class="collection-plant-name">${plant.name}</span>
            <a class="garden-plant-sci inat-link" href="${inatUrl(plant.sci)}" target="_blank" rel="noopener noreferrer">${plant.sci} ↗</a>
            <span class="collection-plant-meta">↕️ ${plant.height ?? '—'} · 🌱 ${plant.seasonOfInterest ?? '—'}${plant.caterpillarSpp ? ` · 🐦 ${plant.caterpillarSpp}+ species` : ''}</span>
          </div>
          <div class="collection-plant-badges">
            <span class="garden-type-badge garden-type-${plant.type}">${plant.type}</span>
            <span class="collection-creature-count${allFound ? ' complete' : ''}">${discoveredHere}/${totalHere} observed</span>
            <span class="collection-plant-bp">🌍 +${plant.biosphereBonus} BP</span>
          </div>
        `;
        card.appendChild(cardHead);
        card.appendChild(el('p', 'garden-desc', plant.desc));

        // Creature list
        const isCollapsed = collectionCreaturesCollapsed.has(plant.id);
        const creatureList = el('div', `collection-creature-list${isCollapsed ? ' collapsed' : ''}`);
        const listHeader = el('button', 'collection-creature-list-header');
        listHeader.innerHTML = `<span class="collection-creature-list-chevron">${isCollapsed ? '▶' : '▼'}</span> 🦋 Insects &amp; Wildlife Hosted <span class="collection-creature-list-count">(${discoveredHere}/${totalHere})</span>`;
        listHeader.addEventListener('click', () => {
          if (collectionCreaturesCollapsed.has(plant.id)) {
            collectionCreaturesCollapsed.delete(plant.id);
            collectionAllCollapsed = false;
          } else {
            collectionCreaturesCollapsed.add(plant.id);
            // Update global state if all are now collapsed
            let allNowCollapsed = true;
            for (const eco2 of ECOREGIONS) for (const p2 of eco2.plants) if (planted.has(p2.id) && !collectionCreaturesCollapsed.has(p2.id)) { allNowCollapsed = false; break; }
            collectionAllCollapsed = allNowCollapsed;
          }
          renderAll();
        });
        creatureList.appendChild(listHeader);
        const creatureBody = el('div', 'collection-creature-list-body');
        creatureList.appendChild(creatureBody);

        for (const creature of plantCreatures) {
          const ckey         = engine.creatureKey(plant.id, creature.name);
          const isDiscovered = discovered.has(ckey);
          const pity         = pityMap.get(ckey) ?? 0;
          const typeInfo     = CREATURE_TYPE_META[creature.type] ?? { label: creature.type, icon: '🐞', plural: creature.type };

          const row = el('div', `collection-creature-row${isDiscovered ? ' discovered' : ' undiscovered'}`);
          if (isDiscovered) {
            row.innerHTML = `
              ${creature.sci ? inatThumbHtml(creature.sci, 'collection-creature-thumb', creature.name) : `<span class="collection-creature-thumb-icon">${typeInfo.icon}</span>`}
              <div class="collection-creature-info">
                <div class="collection-creature-head">
                  <span class="collection-creature-name">${creature.name}</span>
                  <span class="collection-creature-type-badge type-${creature.type}">${typeInfo.icon} ${typeInfo.label}</span>
                </div>
                ${creature.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(creature.sci)}" target="_blank" rel="noopener noreferrer">${creature.sci} ↗</a>` : ''}
                <span class="collection-creature-role">${creature.role}</span>
                <p class="collection-creature-note">${creature.note}</p>
              </div>
              <span class="collection-creature-bp">+1 BP</span>
            `;
          } else {
            const pityPct = Math.min(100, Math.round((pity / PITY_DAYS) * 100));
            row.innerHTML = `
              <div class="collection-creature-shadow">${typeInfo.icon}</div>
              <div class="collection-creature-info">
                <div class="collection-creature-head">
                  <span class="collection-creature-name undiscovered-name">❓ Not yet observed</span>
                  <span class="collection-creature-type-badge type-${creature.type}">${typeInfo.icon} ${typeInfo.label}</span>
                </div>
                <span class="collection-creature-role">Keep your land planted — this creature may appear over time.</span>
                <div class="collection-pity-bar-track"><div class="collection-pity-bar-fill" style="width:${pityPct}%"></div></div>
                <span class="collection-pity-label">${pity > 0 ? `${pity} day${pity !== 1 ? 's' : ''} scouted · ${pityPct}% to guaranteed discovery` : 'Not yet scouted'}</span>
              </div>
            `;
          }
          creatureBody.appendChild(row);
        }

        if (plant.wildlifeNote) {
          const wildEl = el('div', 'garden-wildlife-note');
          wildEl.innerHTML = `<span class="wildlife-note-icon">🌿</span> ${plant.wildlifeNote}`;
          creatureBody.appendChild(wildEl);
        }

        card.appendChild(creatureList);
        content.appendChild(card);
      }
    }
  }

  // ── Discovered creatures index ──────────────────────────────────────────────
  if (showCreatures) {
    if (discoveredCount > 0) {
      content.appendChild(el('h2', 'section-header', `🦋 Observed Creatures — ${discoveredCount} of ${totalCreatures}`));

      const byType = new Map();
      for (const ckey of discovered) {
        const entry = creatureMap.get(ckey);
        if (!entry) continue;
        const { creature } = entry;
        if (!byType.has(creature.type)) byType.set(creature.type, []);
        byType.get(creature.type).push({ ckey, ...entry });
      }

      const typeOrder = ['butterfly', 'moth', 'bee', 'wasp', 'fly', 'beetle', 'bird', 'mammal'];
      for (const type of typeOrder) {
        if (!byType.has(type)) continue;
        const entries  = byType.get(type);
        const typeInfo = CREATURE_TYPE_META[type] ?? { label: type, icon: '🐞', plural: type };

        content.appendChild(el('h3', 'collection-type-header', `${typeInfo.icon} ${typeInfo.plural} (${entries.length})`));

        const grid = el('div', 'collection-creature-grid');
        for (const { creature, plant } of entries) {
          const ccard = el('div', 'collection-creature-card');
          ccard.innerHTML = `
            ${creature.sci ? inatThumbHtml(creature.sci, 'collection-creature-card-thumb', creature.name) : `<span class="collection-creature-card-thumb-icon">${typeInfo.icon}</span>`}
            <div class="collection-creature-card-body">
              <div class="collection-creature-head">
                <span class="collection-creature-name">${creature.name}</span>
                <span class="collection-creature-type-badge type-${type}">${typeInfo.icon}</span>
              </div>
              ${creature.sci ? `<a class="garden-plant-sci inat-link" href="${inatUrl(creature.sci)}" target="_blank" rel="noopener noreferrer">${creature.sci} ↗</a>` : ''}
              <span class="collection-host-label">Host: <strong>${plant.name}</strong></span>
              <span class="collection-creature-role">${creature.role}</span>
              <p class="collection-creature-note">${creature.note}</p>
              <span class="collection-creature-bp">+1 🌍 BP</span>
            </div>
          `;
          grid.appendChild(ccard);
        }
        content.appendChild(grid);
      }
    } else {
      content.appendChild(el('h2', 'section-header', '🦋 Observed Creatures — none yet'));
      content.appendChild(el('p', 'research-idle-note', '— Establish native plants to attract insects and wildlife. —'));
    }
  }

  // ── Discovery history ──────────────────────────────────────────────
  if (showHistory) {
    content.appendChild(el('h2', 'section-header', `📊 Discovery Log — ${discoveredCount} creature${discoveredCount !== 1 ? 's' : ''} observed`));

    if (discoveredCount === 0) {
      content.appendChild(el('p', 'research-idle-note', '— No discoveries yet. Establish native plants in the 🌿 Garden tab to begin. —'));
    } else {
      // Build sorted entries: ascending by discovery day
      const discoveryLog = engine.creatureDiscoveryLog;
      const historyEntries = [];
      for (const ckey of discovered) {
        const entry = creatureMap.get(ckey);
        if (!entry) continue;
        historyEntries.push({ ckey, ...entry, day: discoveryLog.get(ckey) ?? 0 });
      }
      historyEntries.sort((a, b) => a.day - b.day);

      const historyList = el('ol', 'discovery-history-list');
      historyEntries.forEach(({ creature, plant, day }, idx) => {
        const typeInfo = CREATURE_TYPE_META[creature.type] ?? { label: creature.type, icon: '🐞' };
        const cal = day > 0 ? calendarDate(day) : null;
        const dateStr = cal ? `${cal.month.abbr} ${cal.day}, Year ${cal.year}` : 'Year 1 (legacy)';
        const row = el('li', 'discovery-history-row');
        row.innerHTML = `
          <span class="dh-num">${idx + 1}</span>
          <span class="dh-icon">${typeInfo.icon}</span>
          <div class="dh-details">
            <span class="dh-name">${creature.name}</span>
            ${creature.sci ? `<span class="dh-sci">${creature.sci}</span>` : ''}
            <span class="dh-host">Host: ${plant.name}</span>
          </div>
          <span class="dh-date">${dateStr}</span>
        `;
        historyList.appendChild(row);
      });
      content.appendChild(historyList);
    }
  }
}

// ── SETTINGS TAB ─────────────────────────────────────────────────────────────
function renderSettings() {
  content.appendChild(el('h2', 'section-header', '⚙️ Settings'));

  // Game speed
  const speedSection = el('div', 'settings-section');
  speedSection.appendChild(el('div', 'settings-label', 'Game Speed'));
  const speedRow = el('div', 'btn-row');
  [1, 3, 6, 12].forEach(spd => {
    const btn = el('button', `speed-btn${engine.gameSpeed === spd ? ' active' : ''}`, `${spd}×`);
    btn.addEventListener('click', () => { engine.setGameSpeed(spd); renderAll(); });
    speedRow.appendChild(btn);
  });
  speedSection.appendChild(speedRow);
  content.appendChild(speedSection);

  // Auto-pilot
  const apSection = el('div', 'settings-section');
  apSection.appendChild(el('div', 'settings-label', '🤖 Auto-pilot'));
  apSection.appendChild(el('p', 'settings-desc',
    'Automatically assigns best crops, routes artisan products, and buys the cheapest available upgrade.'));
  const apBtn = el('button', `ap-btn${engine.autoPilot ? ' ap-on' : ''}`,
    engine.autoPilot ? '🤖 ON' : '🤖 OFF');
  apBtn.addEventListener('click', () => { engine.setAutoPilot(!engine.autoPilot); renderAll(); });
  apSection.appendChild(apBtn);
  content.appendChild(apSection);

  // Screen (fullscreen + wake lock)
  const screenSection = el('div', 'settings-section');
  screenSection.appendChild(el('div', 'settings-label', '📱 Screen'));
  const screenBtnRow = el('div', 'btn-row');
  if (document.fullscreenEnabled) {
    const fsBtn = el('button', 'action-btn', document.fullscreenElement ? '⛶ Exit Fullscreen' : '⛶ Fullscreen');
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      setTimeout(() => renderAll(), 300);
    });
    screenBtnRow.appendChild(fsBtn);
  } else {
    screenSection.appendChild(el('p', 'settings-desc',
      '📱 iOS: tap Share → “Add to Home Screen” to play fullscreen.'));
  }
  if ('wakeLock' in navigator) {
    const wlOn = _wakeLock !== null;
    const wlBtn = el('button', `action-btn${wlOn ? ' wl-on' : ''}`, wlOn ? '🔆 Keep screen on: ON' : '🔅 Keep screen on: OFF');
    wlBtn.addEventListener('click', async () => {
      if (_wakeLock) { await _wakeLock.release(); _wakeLock = null; }
      else { await acquireWakeLock(); }
      renderAll();
    });
    screenBtnRow.appendChild(wlBtn);
  }
  screenSection.appendChild(screenBtnRow);
  content.appendChild(screenSection);

  // Save / Reset
  const saveSection = el('div', 'settings-section');
  saveSection.appendChild(el('div', 'settings-label', 'Save Data'));
  const saveBtn  = el('button', 'action-btn', '💾 Save Now');
  const resetBtn = el('button', 'action-btn danger', '🗑 Reset Game');
  saveBtn.addEventListener('click', () => { engine.save(); saveBtn.textContent = '✅ Saved!'; setTimeout(() => { saveBtn.textContent = '💾 Save Now'; }, 1500); });
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      _resetting = true;
      engine.clearSave();
      location.reload();
    }
  });
  const btnRow = el('div', 'btn-row');
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(resetBtn);
  saveSection.appendChild(btnRow);
  content.appendChild(saveSection);
}

// ── Offline toast ─────────────────────────────────────────────────────────────
function showOfflineToast(result, realSecs) {
  const fmt = s => s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
                 : s >= 60   ? `${Math.floor(s/60)}m ${s%60}s`
                 : `${s}s`;

  const toast = el('div', 'offline-toast');
  const cap   = result.capped ? ` (capped at 2h)` : '';
  toast.innerHTML = `
    <div class="offline-title">Welcome back!</div>
    <div>Away for ${fmt(Math.floor(realSecs))}${cap}</div>
    <div style="color:#ffd700;margin-top:6px">🪙 +${shortNumber(result.goldEarned)} earned</div>
    <button class="offline-close">×</button>
  `;
  toast.querySelector('.offline-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

// ── Update loop ───────────────────────────────────────────────────────────────
let lastZonesFingerprint    = '';
let lastResearchFingerprint   = '';
let lastGardenFingerprint     = '';
let lastCollectionFingerprint = '';
let collectionFilter = 'all'; // 'all' | 'crops' | 'plants' | 'creatures' | 'history'
let collectionCreaturesCollapsed = new Set(); // plant IDs whose creature list is collapsed
let collectionAllCollapsed = false;

// ── Discovery popup queue ─────────────────────────────────────────
let _knownDiscovered = null;  // null = not yet initialised; synced silently on first tick
const _discoveryQueue = [];
let _discoveryActive = false;

function _queueDiscovery(ckey) {
  _discoveryQueue.push(ckey);
  if (!_discoveryActive) _showNextDiscovery();
}

function _showNextDiscovery() {
  if (_discoveryQueue.length === 0) { _discoveryActive = false; return; }
  _discoveryActive = true;
  const ckey = _discoveryQueue.shift();
  // Find the creature and its host plant
  for (const eco of ECOREGIONS) {
    for (const plant of eco.plants) {
      const creature = (plant.insectsHosted ?? []).find(
        c => engine.creatureKey(plant.id, c.name) === ckey
      );
      if (creature) {
        _showDiscoveryPopup(creature, plant, engine.creatureDiscoveryLog.get(ckey) ?? engine.inGameDay);
        return;
      }
    }
  }
  // ckey not resolved — skip to next
  _showNextDiscovery();
}

function _showDiscoveryPopup(creature, plant, discoveryDay) {
  const typeInfo = CREATURE_TYPE_META[creature.type] ?? { label: creature.type, icon: '🐞' };
  const cal = calendarDate(discoveryDay);
  const dateStr = `${cal.month.abbr} ${cal.day}, Year ${cal.year}`;

  const popup = el('div', 'discovery-popup');
  popup.innerHTML = `
    <div class="discovery-header">
      <span class="discovery-new-badge">🔍 New Discovery!</span>
      <button class="discovery-close" aria-label="Close">×</button>
    </div>
    <div class="discovery-body">
      <span class="discovery-type-icon">${typeInfo.icon}</span>
      <div class="discovery-info">
        <div class="discovery-name">${creature.name}</div>
        ${creature.sci ? `<a class="garden-plant-sci inat-link discovery-sci" href="${inatUrl(creature.sci)}" target="_blank" rel="noopener noreferrer">${creature.sci} \u2197</a>` : ''}
        <div class="discovery-host">Host: <strong>${plant.name}</strong></div>
        <div class="discovery-role">${creature.role}</div>
        <p class="discovery-note">${creature.note}</p>
        <div class="discovery-footer-row">
          <span class="discovery-date">📅 ${dateStr}</span>
          <span class="discovery-bp">+1 🌍 BP</span>
        </div>
      </div>
    </div>
    <div class="discovery-timer-track"><div class="discovery-timer-fill"></div></div>
  `;

  let autoTimer;
  const close = () => {
    clearTimeout(autoTimer);
    popup.classList.add('discovery-exit');
    setTimeout(() => { popup.remove(); _showNextDiscovery(); }, 300);
  };
  popup.querySelector('.discovery-close').addEventListener('click', close);
  document.body.appendChild(popup);

  // Kick off shrinking timer bar
  requestAnimationFrame(() => {
    const fill = popup.querySelector('.discovery-timer-fill');
    if (fill) { fill.style.transition = 'width 11s linear'; fill.style.width = '0%'; }
  });
  autoTimer = setTimeout(close, 11000);
}

function zonesFingerprint() {
  const lifetimeGold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.lifetimeSales, 0);
  const farmParts = FARM_ZONE_DEFS
    .filter(d => engine.unlockedFarmZones.has(d.name))
    .map(d => `${d.name}:${engine.zoneAcres.get(d.name) ?? 1}:${engine.zoneWorkers.get(d.name) ?? 1}`).join(',');
  const artParts = ARTISAN_ZONE_DEFS
    .filter(d => engine.artisanWS.unlockedSet.has(d.name))
    .map(d => `${d.name}:${engine.artisanWorkers.get(d.name) ?? 1}`).join(',');
  // Sample sold/gold (bucketed) so locked-card criteria bars re-render as progress advances
  const totalSold = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);
  return `f${engine.unlockedFarmZones.size}|a${engine.artisanWS.unlockedSet.size}|${farmParts}|${artParts}|s${Math.floor(totalSold / 10)}|g${Math.floor(lifetimeGold / 10000)}|season:${engine.currentSeasonName}`;
}

function liveUpdate() {
  // ── Detect new creature discoveries and queue popups ───────────────────────
  const _currentDiscovered = engine.discoveredCreatures;
  if (_knownDiscovered === null) {
    // First tick after load — sync silently so we don't re-notify existing saves
    _knownDiscovered = new Set(_currentDiscovered);
  } else if (_currentDiscovered.size > _knownDiscovered.size) {
    for (const _ck of _currentDiscovered) {
      if (!_knownDiscovered.has(_ck)) _queueDiscovery(_ck);
    }
    _knownDiscovered = new Set(_currentDiscovered);
  }

  updateHeader();
  if (activeTab === 'crops' || activeTab === 'artisan') {
    const fp = zonesFingerprint();
    if (fp !== lastZonesFingerprint) {
      lastZonesFingerprint = fp;
      renderAll();
    } else {
      updateZoneProgressBars();
      // Patch upgrade button disabled states as gold changes
      content.querySelectorAll('.acre-btn[data-zone-name]').forEach(btn => {
        const def = FARM_ZONE_DEFS.find(d => d.name === btn.dataset.zoneName);
        if (!def) return;
        const cur = engine.zoneAcres.get(def.name) ?? 1;
        btn.disabled = engine.gold.amount < acreUpgradeCost(def, cur);
      });
      content.querySelectorAll('.worker-btn[data-zone-name-w]').forEach(btn => {
        const def = FARM_ZONE_DEFS.find(d => d.name === btn.dataset.zoneNameW);
        if (!def) return;
        const cur = engine.zoneWorkers.get(def.name) ?? 1;
        btn.disabled = engine.gold.amount < workerUpgradeCost(def, cur);
      });
      content.querySelectorAll('.worker-btn[data-art-zone-name-w]').forEach(btn => {
        const def = ARTISAN_ZONE_DEFS.find(d => d.name === btn.dataset.artZoneNameW);
        if (!def) return;
        const cur = engine.artisanWorkers.get(def.name) ?? 1;
        btn.disabled = engine.gold.amount < workerUpgradeCost(def, cur);
      });
    }
  } else if (activeTab === 'research') {
    // Re-render fully when completions, pts, or active project change
    const rfp = `${engine.completedResearch.size}|${engine.activeResearchId}|${Math.floor(engine.researchPoints)}`;
    if (rfp !== lastResearchFingerprint) {
      lastResearchFingerprint = rfp;
      renderAll();
    } else if (engine.activeResearchId) {
      // In-place: update progress bar and time remaining
      const project = RESEARCH.find(r => r.id === engine.activeResearchId);
      if (project) {
        const pct       = Math.min(100, Math.round(engine.activeResearchTimer / project.duration * 100));
        const remaining = Math.max(0, project.duration - engine.activeResearchTimer);
        const fill    = content.querySelector('.research-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
        const timeEl  = content.querySelector('.research-active-time');
        if (timeEl) timeEl.textContent = `${fmtDays(remaining)} remaining`;
        const pctEl   = content.querySelector('.research-active-pct');
        if (pctEl) pctEl.textContent = `${pct}% complete`;
      }
    }
  } else if (activeTab === 'garden') {
    // Re-render fully when planted set or active plant changes
    const gfp = `${engine.plantedSpecies.size}|${engine.activePlantingId}`;
    if (gfp !== lastGardenFingerprint) {
      lastGardenFingerprint = gfp;
      renderAll();
    } else if (engine.activePlantingId) {
      // In-place: update planting progress bar and time remaining
      let plantDuration = null;
      for (const region of ECOREGIONS) {
        const p = region.plants.find(pl => pl.id === engine.activePlantingId);
        if (p) { plantDuration = p.duration; break; }
      }
      if (plantDuration) {
        const pct       = Math.min(100, Math.round(engine.activePlantingTimer / plantDuration * 100));
        const remaining = Math.max(0, plantDuration - engine.activePlantingTimer);
        const fill    = content.querySelector('.garden-progress');
        if (fill) fill.style.width = `${pct}%`;
        const timeEl  = content.querySelector('.research-active-time');
        if (timeEl) timeEl.textContent = `${fmtDays(remaining)} remaining`;
        const pctEl   = content.querySelector('.research-active-pct');
        if (pctEl) pctEl.textContent = `${pct}% established`;
      }
    }
  } else if (activeTab === 'collection') {
    const unlockedCropCount = Object.values(CROPS).filter(ct => ct.isUnlocked(engine.cropStats)).length;
    const totalSoldForCrops = Array.from(engine.cropStats.values()).reduce((s, v) => s + v.sold, 0);
    const cfp = `${engine.discoveredCreatures.size}|${engine.plantedSpecies.size}|${unlockedCropCount}|${Math.floor(totalSoldForCrops / 5)}`;
    if (cfp !== lastCollectionFingerprint) {
      lastCollectionFingerprint = cfp;
      renderAll();
    }
  }
}

function updateZoneProgressBars() {
  content.querySelectorAll('.zone-card:not(.locked)').forEach((card, i) => {
    const bar   = card.querySelector('.progress-bar');
    const pctEl = card.querySelector('.progress-pct');
    if (!bar || !pctEl) return;

    if (activeTab === 'crops') {
      const zoneDef  = FARM_ZONE_DEFS.filter(d => engine.unlockedFarmZones.has(d.name) && CROPS[d.cropId]?.isInSeason(engine.currentSeasonName))[i];
      if (!zoneDef) return;
      const instance = engine.zoneCrops.get(zoneDef.name);
      if (!instance)  return;
      if (!instance.cropType.isInSeason(engine.currentSeasonName)) return; // dormant — static
      const prog = instance.overallProgress;
      bar.style.width = `${(prog * 100).toFixed(3)}%`;
      const ct2      = instance.cropType;
      const wm2      = workerMultiplier(engine.zoneWorkers.get(zoneDef.name) ?? 1);
      const remGame  = instance.isFullyGrown ? 0
        : ((ct2.totalPhases - instance.phase) * ct2.growthTimePerPhase - instance.timer);
      const nearHarvest = !instance.isFullyGrown && (remGame / (engine.gameSpeed * wm2)) <= 1;
      bar.className = 'progress-bar ' + (instance.isFullyGrown ? 'ready' : nearHarvest ? 'near-harvest' : 'growing');
      const wrap = bar.parentElement;
      if (wrap) wrap.classList.toggle('near-harvest', nearHarvest);
      pctEl.textContent = instance.isFullyGrown ? 'Ready!' : `${Math.round(prog * 100)}%`;
      // Update phase tick and label classes
      const _phase2 = instance.phase;
      const _grown2 = instance.isFullyGrown;
      card.querySelectorAll('.phase-tick').forEach((_tick2, _ti2) => {
        const _passed2 = _grown2 || _phase2 > _ti2;
        _tick2.className = 'phase-tick' + (_passed2 ? ' passed' : '');
      });
      card.querySelectorAll('.phase-label').forEach((_lbl2, _li2) => {
        const _isCur2  = !_grown2 && _li2 === _phase2;
        const _isPast2 = _grown2 || _li2 < _phase2;
        _lbl2.className = 'phase-label' + (_isCur2 ? ' active' : _isPast2 ? ' passed' : '');
      });
      const _phaseEl = card.querySelector('.phase-row');
      if (_phaseEl) {
        _phaseEl.textContent = _grown2
          ? '\u2705 Ready to harvest'
          : instance.cropType.growthPhaseNames?.[_phase2] ?? `Growing \u2014 stage ${_phase2 + 1} of ${instance.cropType.totalPhases}`;
      }
    } else if (activeTab === 'artisan') {
      const def = ARTISAN_ZONE_DEFS.filter(d => engine.artisanWS.unlockedSet.has(d.name))[i];
      if (!def) return;
      const cropId  = engine.artisanWS.zoneProductMap.get(def.name);
      const ap      = cropId ? CROPS[cropId]?.artisanProduct : null;
      const apUnlocked = ap && (engine.cropStats.get(cropId)?.sold ?? 0) >= ap.unlockCropSold;
      const artProgress = (engine.artisanTimers.get(def.name) ?? 0) / engine.artisanWS.act.productionIntervalSecs;
      bar.style.width = apUnlocked ? `${Math.round(artProgress * 100)}%` : '0%';
      if (apUnlocked) {
        const inv = engine.artisanWS.productInventory.get(`${cropId}_artisan`) || 0;
        pctEl.textContent = `${Math.round(artProgress * 100)}% \u00b7 Inv: ${inv}`;
      } else if (ap) {
        const sold = engine.cropStats.get(cropId)?.sold ?? 0;
        pctEl.textContent = `${shortNumber(sold)} / ${shortNumber(ap.unlockCropSold)} sold`;
      }
    }
  });
}

// Initial render + live update every 250ms (matches tick rate)
renderAll();
setInterval(liveUpdate, 250);

