import { connect, callHA, getState } from './ha-bridge.js';

// ── Global HA actions ──────────────────────────────────────────────────────
window.callHA        = callHA;
window.haToggle      = (e)   => callHA('homeassistant','toggle', e);
window.haSwitchOn    = (e)   => callHA('switch','turn_on', e);
window.haSwitchOff   = (e)   => callHA('switch','turn_off', e);
window.haClimateTemp = (e,t) => callHA('climate','set_temperature', e, {temperature:t});
window.haClimateMode = (e,m) => callHA('climate','set_hvac_mode',   e, {hvac_mode:m});
window.haScript      = (e)   => callHA('script','turn_on', e);
window.haInputBtn    = (e)   => callHA('input_button','press', e);
window.haBoolToggle  = (e)   => callHA(e.split('.')[0],'toggle', e);
window.haAlarm       = (a, code) => callHA('alarm_control_panel', a, 'alarm_control_panel.alarmo', code ? {code} : {});
window.haMediaCmd    = (e,a,x={}) => callHA('media_player', a, e, x);

const _mediaPauseTimers = new Map();

// ── Service worker + push notifications ───────────────────────────────────
async function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (e) { console.warn('[SW] registration failed', e); }
}

async function _subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // already subscribed

    const keyRes = await fetch('/api/push/vapid-key', { headers: { Authorization: `Bearer ${_token}` } });
    const { publicKey } = await keyRes.json();
    if (!publicKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(publicKey),
    });
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
      body: JSON.stringify(sub),
    });
  } catch (e) { console.warn('[Push] subscribe failed', e); }
}

async function _enableNotifications() {
  if (!('Notification' in window)) { alert('Push notifications are not supported in this browser.'); return; }
  if (Notification.permission === 'denied') { alert('Notifications are blocked. Enable them in browser settings.'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') { await _subscribePush(); }
}

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── Boot: load layout then connect ─────────────────────────────────────────
const _token = sessionStorage.getItem('ha_dash_token');
if (!_token) { window.location.href = '/login'; }

function _getTokenPayload() {
  try { return JSON.parse(atob(_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; }
}
const _tokenPayload = _getTokenPayload();

let _layout = null;

async function boot() {
  try {
    const r = await fetch('/api/layout', { headers: { Authorization: `Bearer ${_token}` } });
    if (r.status === 401) { sessionStorage.removeItem('ha_dash_token'); window.location.href = '/login'; return; }
    _layout = await r.json();
    window.__layout = _layout;
    applyLayout(_layout);
    _addUserChip();
    if (_tokenPayload?.role === 'admin') _addAdminChips();
  } catch (e) {
    console.error('[ha-controller] Could not load layout:', e);
    _layout = null;
  }
  connect();
}

function _addUserChip() {
  const chips = document.getElementById('chips');
  if (!chips) return;
  const name = _tokenPayload?.name || 'User';
  const initial = name[0].toUpperCase();
  const wrap = document.createElement('div');
  wrap.className = 'chip chip-user-menu';
  wrap.style.cssText = 'cursor:pointer;gap:6px;border-color:rgba(255,255,255,.15);position:relative;';
  wrap.innerHTML = `<span style="width:18px;height:18px;border-radius:50%;background:rgba(91,141,238,.3);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${initial}</span>${name}`;
  const menu = document.createElement('div');
  menu.style.cssText = 'position:absolute;top:calc(100% + 6px);right:0;background:#1e293b;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px;min-width:120px;z-index:200;display:none;box-shadow:0 8px 24px rgba(0,0,0,.5)';
  const notifItem = ('Notification' in window && 'PushManager' in window)
    ? `<div class="user-menu-item" id="notif-menu-item" onclick="window._enableNotifications()" style="padding:7px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:#f1f5f9">🔔 Enable Notifications</div>`
    : '';
  menu.innerHTML = `<div style="padding:6px 10px;font-size:11px;color:#64748b;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:4px">${name}</div>
    ${notifItem}
    <div class="user-menu-item" onclick="sessionStorage.removeItem('ha_dash_token');location.href='/login'" style="padding:7px 10px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:#f1f5f9">🚪 Sign Out</div>`;
  menu.querySelectorAll('.user-menu-item').forEach(it => {
    it.addEventListener('mouseenter', () => it.style.background = 'rgba(255,255,255,.08)');
    it.addEventListener('mouseleave', () => it.style.background = '');
  });
  wrap.appendChild(menu);
  wrap.addEventListener('click', e => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; });
  document.addEventListener('click', () => { menu.style.display = 'none'; });
  const clock = document.getElementById('clk');
  if (clock) chips.insertBefore(wrap, clock);
  else chips.appendChild(wrap);
}

function _addAdminChips() {
  const chips = document.getElementById('chips');
  if (!chips) return;
  const adminChip = document.createElement('a');
  adminChip.href = '/admin';
  adminChip.className = 'chip';
  adminChip.style.cssText = 'border-color:rgba(91,141,238,.35);color:#93c5fd;text-decoration:none';
  adminChip.textContent = '⚙️ Admin';
  const spacer = chips.querySelector('.chip-spacer');
  if (spacer) chips.insertBefore(adminChip, spacer);
  else chips.appendChild(adminChip);
}

// ── Apply layout to DOM ────────────────────────────────────────────────────
function applyLayout(L) {
  applyGridCols(L.grid);
  applyTabNames(L.tabs);
  renderRooms(L.rooms);
  renderSensors(L.security?.sensors ?? []);
  renderCameras(L.security?.cameras ?? []);
  setupTabCameras(L);
  setupCustomTabs(L.customTabs ?? [], L.security?.cameras ?? []);
  applyTabVisibility(L.tabs);
  updateRadioToggle();
  // Update greeting with actual user name
  const h1 = document.querySelector('#greet h1');
  if (h1 && _tokenPayload?.name) {
    const hr = new Date().getHours();
    const salut = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
    h1.textContent = `${salut}, ${_tokenPayload.name} 👋`;
  }
}

function applyGridCols(grid) {
  if (!grid) return;
  const rg = document.querySelector('.rg');
  if (!rg) return;
  // Build CSS from breakpoints
  let css = '';
  const bps = [...(grid.breakpoints ?? [])].sort((a,b) => a.minWidth - b.minWidth);
  for (const bp of bps) {
    if (bp.minWidth === 0) {
      css += `.rg{grid-template-columns:repeat(${bp.cols},1fr);}`;
    } else {
      css += `@media(min-width:${bp.minWidth}px){.rg{grid-template-columns:repeat(${bp.cols},1fr);}}`;
    }
  }
  let el = document.getElementById('layout-grid-style');
  if (!el) { el = document.createElement('style'); el.id = 'layout-grid-style'; document.head.appendChild(el); }
  el.textContent = css;
}

function applyTabNames(tabs) {
  if (!tabs) return;
  const map = { home:'ni-home', security:'ni-security', climate:'ni-climate', media:'ni-tv' };
  const names = { home: tabs.home?.name, security: tabs.security?.name, climate: tabs.climate?.name, media: tabs.media?.name };
  for (const [key, elId] of Object.entries(map)) {
    const el = document.getElementById(elId);
    if (!el || !names[key]) continue;
    // preserve svg, replace text node
    const svg = el.querySelector('svg');
    el.textContent = names[key];
    if (svg) el.prepend(svg);
  }
}

function applyTabVisibility(tabs) {
  if (!tabs) return;
  const map = { home:'ni-home', security:'ni-security', climate:'ni-climate', media:'ni-tv' };
  for (const [key, elId] of Object.entries(map)) {
    const el = document.getElementById(elId);
    if (el) el.style.display = tabs[key]?.visible === false ? 'none' : '';
  }
}

const _COLOR_CSS = {
  blue:   { bg:'rgba(22,50,100,.85),rgba(9,22,50,.9)',  border:'rgba(91,141,238,.4)',  shadow:'rgba(91,141,238,.12)',  glow:'rgba(91,141,238,.40)',  rico:'rgba(91,141,238,.25)',  rbtn:'rbtn-b', rb:'rb-on' },
  purple: { bg:'rgba(70,30,110,.85),rgba(35,12,60,.9)', border:'rgba(167,139,250,.4)', shadow:'rgba(167,139,250,.12)', glow:'rgba(167,139,250,.35)', rico:'rgba(167,139,250,.25)', rbtn:'rbtn-p', rb:'rb-on' },
  amber:  { bg:'rgba(90,50,10,.85),rgba(45,22,5,.9)',   border:'rgba(251,191,36,.4)',  shadow:'rgba(251,191,36,.10)',  glow:'rgba(251,191,36,.35)',  rico:'rgba(251,191,36,.22)',  rbtn:'rbtn-a', rb:'rb-on' },
  cyan:   { bg:'rgba(8,80,90,.85),rgba(4,40,50,.9)',    border:'rgba(6,182,212,.4)',   shadow:'rgba(6,182,212,.12)',   glow:'rgba(6,182,212,.35)',   rico:'rgba(6,182,212,.22)',   rbtn:'rbtn-c', rb:'rb-on' },
  pink:   { bg:'rgba(100,20,50,.75),rgba(55,8,28,.9)',  border:'rgba(251,113,133,.4)', shadow:'rgba(251,113,133,.10)', glow:'rgba(251,113,133,.35)', rico:'rgba(251,113,133,.22)', rbtn:'rbtn-r', rb:'rb-on' },
  green:  { bg:'rgba(5,80,55,.85),rgba(3,40,28,.9)',    border:'rgba(16,185,129,.4)',  shadow:'rgba(16,185,129,.12)',  glow:'rgba(16,185,129,.40)',  rico:'rgba(16,185,129,.22)',  rbtn:'rbtn-g', rb:'rb-on' },
  indigo: { bg:'rgba(30,30,55,.75),rgba(15,15,30,.9)',  border:'rgba(148,163,184,.3)', shadow:'',                     glow:'rgba(148,163,184,.20)', rico:'rgba(148,163,184,.18)', rbtn:'rbtn-off', rb:'rb-on' },
  rose:   { bg:'rgba(90,20,20,.75),rgba(45,8,8,.9)',    border:'rgba(248,113,113,.35)',shadow:'rgba(248,113,113,.10)', glow:'rgba(248,113,113,.35)', rico:'rgba(248,113,113,.22)', rbtn:'rbtn-r', rb:'rb-on' },
};

function renderRooms(rooms) {
  const rg = document.querySelector('.rg');
  if (!rg) return;
  const sorted = [...rooms].filter(r => r.visible).sort((a,b) => a.order - b.order);
  rg.innerHTML = '';
  for (const room of sorted) {
    const c = _COLOR_CSS[room.color] ?? _COLOR_CSS.blue;
    const haAc = !!room.ac;
    const hasTv = !!room.tv;
    const el = document.createElement('div');
    el.className = `room r-${room.id}`;
    el.style.cssText = `background:linear-gradient(148deg,${c.bg});border-color:${c.border};${c.shadow?`box-shadow:0 4px 28px ${c.shadow};`:''}`;
    if (room.colspan && room.colspan > 1) el.style.gridColumn = `span ${room.colspan}`;
    el.dataset.roomId = room.id;
    el.innerHTML = `
      <div class="glow" style="background:radial-gradient(circle,${c.glow},transparent);"></div>
      <div class="rt">
        <div class="rico" style="background:${c.rico};">${room.icon}</div>
        <div class="rbadges">
          ${haAc ? `<span class="rb rb-off" data-badge="ac">❄️ Off</span>` : ''}
          <span class="rb rb-off">💡 Off</span>
        </div>
      </div>
      <div>
        <div class="rname">${room.name}</div>
        <div class="rmeta">${room.lights.length} light${room.lights.length !== 1 ? 's' : ''}${haAc ? ' · AC' : ''}${hasTv ? ' · TV' : ''}</div>
        <div class="rbtns">
          <button class="rbtn rbtn-off" data-action="light" onclick="E(event)">💡 Off</button>
          ${haAc ? `<button class="rbtn rbtn-off" data-action="ac" onclick="E(event)">❄️ Off</button>` : ''}
          ${hasTv ? `<button class="rbtn rbtn-off" data-action="tv" onclick="E(event)">📺 TV</button>` : ''}
        </div>
      </div>
`;
    el.addEventListener('click', () => pop(room.id));
    el.querySelectorAll('.rbtn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'light') window.haToggle(room.lights[0]);
        else if (action === 'ac') window.haClimateMode(room.ac, btn.textContent.includes('Off') ? 'cool' : 'off');
        else if (action === 'tv') window.haToggle(room.tv);
      });
    });
    rg.appendChild(el);
  }
}


function renderSensors(sensors) {
  const row = document.querySelector('.sensor-row');
  if (!row || !sensors.length) return;
  // only replace the dynamic sensor slots — keep static ones
  const dynamic = row.querySelectorAll('[data-sensor-id]');
  dynamic.forEach(el => el.remove());
  for (const s of sensors) {
    const el = document.createElement('div');
    el.className = 'sensor';
    el.dataset.sensorId = s.id;
    el.innerHTML = `<span class="dot dok"></span>${s.icon} ${s.label}: ${s.okLabel}`;
    row.appendChild(el);
  }
}

function renderCameras(cameras) {
  const grid = document.querySelector('#page-security .cam-grid');
  if (!grid || !cameras.length) return;
  _fillCamGrid(grid, cameras);
}

function _fillCamGrid(grid, cameras) {
  grid.innerHTML = '';
  for (const cam of cameras) {
    const safeId = cam.id.replace(/[^a-z0-9_-]/gi, '_');
    const el = document.createElement('div');
    el.className = 'cam';
    el.dataset.camId = safeId;
    el.innerHTML = `
      <img class="cam-img" id="cam-img-${safeId}" data-entity="${cam.entity}" alt="${cam.label}">
      <div class="cam-ph" id="cam-ph-${safeId}">📷</div>
      <div class="cam-lbl">${cam.label}</div>
      <div class="cam-live"><span class="dlive"></span>LIVE</div>`;
    el.addEventListener('click', () => openCamStream(cam.entity, cam.label));
    grid.appendChild(el);
  }
}

function setupTabCameras(L) {
  const allCams = L.security?.cameras ?? [];
  // fixed tabs: home→page-home, security skipped (renderCameras handles it), climate→page-climate, media→page-tv
  const fixedMap = { home: 'page-home', climate: 'page-climate', media: 'page-tv' };
  for (const [key, pageId] of Object.entries(fixedMap)) {
    const entities = L.tabs?.[key]?.cameras ?? [];
    const cams = entities.map(e => allCams.find(c => c.entity === e)).filter(Boolean);
    const page = document.getElementById(pageId);
    if (!page) continue;
    // Remove previously injected camera section
    page.querySelector('.injected-cam-section')?.remove();
    if (!cams.length) continue;
    const sec = document.createElement('div');
    sec.className = 'injected-cam-section';
    sec.innerHTML = '<div class="sh"><h2>📷 Cameras</h2></div><div class="cam-grid"></div>';
    page.insertBefore(sec, page.firstChild);
    _fillCamGrid(sec.querySelector('.cam-grid'), cams);
  }
}

function setupCustomTabs(customTabs, allCams) {
  // Remove previously created custom tabs
  document.querySelectorAll('.custom-tab-ni, .custom-tab-page').forEach(el => el.remove());
  const navWrap = document.getElementById('extra-navs');
  const pagesWrap = document.getElementById('extra-pages');
  if (!navWrap || !pagesWrap) return;
  navWrap.innerHTML = '';
  pagesWrap.innerHTML = '';

  for (const ct of customTabs) {
    // Nav button
    const ni = document.createElement('div');
    ni.className = 'ni custom-tab-ni';
    ni.id = `ni-${ct.id}`;
    ni.setAttribute('onclick', `go('${ct.id}')`);
    ni.innerHTML = `<span style="font-size:20px;line-height:1">${ct.icon || '📌'}</span>${ct.name}`;
    navWrap.appendChild(ni);

    // Page
    const page = document.createElement('div');
    page.className = 'page custom-tab-page';
    page.id = `page-${ct.id}`;
    const cams = (ct.cameras ?? []).map(e => allCams.find(c => c.entity === e)).filter(Boolean);
    if (cams.length) {
      const sec = document.createElement('div');
      sec.innerHTML = `<div class="sh"><h2>${ct.icon || '📷'} ${ct.name}</h2></div><div class="cam-grid"></div>`;
      page.appendChild(sec);
      _fillCamGrid(sec.querySelector('.cam-grid'), cams);
    } else {
      page.innerHTML = `<div style="text-align:center;padding:80px 20px;color:var(--muted);font-size:14px">No cameras on this tab yet.<br><span style="font-size:12px">Add cameras via the Admin panel → Layout & Tabs.</span></div>`;
    }
    pagesWrap.appendChild(page);
  }
}

// ── Live state updates ──────────────────────────────────────────────────────
document.addEventListener('ha-states-updated', (ev) => {
  const s = ev.detail;
  const L = window.__layout;

  // rooms
  const rooms = L?.rooms ?? _FALLBACK_ROOMS;
  for (const r of rooms) {
    if (!r.visible) continue;
    updateRoomCard(s, r);
  }

  // status row — non-admins only count entities from their accessible rooms
  const _isAdmin = _tokenPayload?.role === 'admin';
  const _visRooms = (L?.rooms ?? _FALLBACK_ROOMS).filter(r => r.visible);
  const lightEntities = _isAdmin ? (L?.status?.lights ?? _FALLBACK_LIGHTS) : _visRooms.flatMap(r => r.lights);
  const acEntities    = _isAdmin ? (L?.status?.acs ?? ['climate.1e05049f','climate.1e050116','climate.1e51b62f','climate.1e51bb2c']) : _visRooms.filter(r => r.ac).map(r => r.ac);
  const lightsOn = lightEntities.filter(e => s[e]?.state === 'on').length;
  const svEls = document.querySelectorAll('.sv');
  if (svEls[0]) {
    svEls[0].textContent = lightsOn > 0 ? `${lightsOn} On` : 'Off';
    const ico = document.getElementById('sc-light-ico');
    if (ico) ico.style.opacity = lightsOn > 0 ? '1' : '0.35';
  }
  const _activeAcs = acEntities.filter(e => s[e]?.state && s[e].state !== 'off').length;
  const _lrAcTemp  = s[acEntities[0]]?.attributes?.current_temperature;
  if (svEls[1]) svEls[1].textContent = _activeAcs === 0 ? 'All Off' : (_lrAcTemp ? `${_lrAcTemp}°C` : `${_activeAcs} Active`);
  const svAcSl = document.querySelectorAll('.sl')[1];
  if (svAcSl) svAcSl.textContent = _activeAcs === 0 ? 'All ACs Off' : `${_activeAcs} AC${_activeAcs > 1?'s':''} Active`;

  // presence
  const persons = L?.chips?.presence?.persons ?? [{ entity:'person.raed', name:'Raed' }, { entity:'person.rola', name:'Rola' }];
  if (svEls[2]) svEls[2].textContent = persons.map(p => s[p.entity]?.state === 'home' ? p.name : '').filter(Boolean).join(', ') || 'Away';

  // water filter
  const wf = L?.status?.waterFilter ?? 'switch.athom_smart_plug_v3_50b5b0_power';
  if (svEls[3]) svEls[3].textContent = s[wf]?.state === 'on' ? 'On' : 'Off';

  // chips
  updateChips(s, L);

  // battery
  const battThreshold = parseFloat(s['input_number.threshold_battery']?.state ?? 40);
  updateBatteryDynamic(s, battThreshold);

  // greeting sub
  const _roomDefs = rooms.map(r => ({ name: r.name, lights: r.lights, ac: r.ac }));
  const _active = _roomDefs.filter(r => {
    const lit = r.lights?.some(e => s[e]?.state === 'on');
    const cool = r.ac ? ['cool','heat','fan_only'].includes(s[r.ac]?.state) : false;
    return lit || cool;
  });
  const _day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
  const _gSub = document.getElementById('greet-sub');
  if (_gSub) {
    _gSub.textContent = !_active.length
      ? `${_day} · All rooms off`
      : `${_day} · ${_active.length} room${_active.length>1?'s':''} active · ${_active.slice(0,3).map(r=>r.name).join(', ')}${_active.length>3?` +${_active.length-3} more`:''}`;
  }

  // security sensors
  const sensors = L?.security?.sensors ?? [];
  for (const cfg of sensors) {
    const el = document.querySelector(`[data-sensor-id="${cfg.id}"]`);
    if (!el) continue;
    const state = s[cfg.entity]?.state;
    const isOk = state === cfg.okState;
    const dot = el.querySelector('.dot');
    if (dot) dot.className = `dot ${isOk ? 'dok' : 'dwarn'}`;
    el.childNodes[el.childNodes.length - 1].textContent = ` ${cfg.icon} ${cfg.label}: ${isOk ? cfg.okLabel : cfg.warnLabel}`;
  }

  // lock
  const lock = L?.security?.lock;
  if (lock) {
    const lockState = s[lock.entity]?.state ?? 'unknown';
    const lockBatt  = lock.batteryEntity ? (s[lock.batteryEntity]?.state ?? '?') : null;
    document.querySelectorAll('.sensor').forEach(el => {
      if (el.textContent.includes('Smart Lock')) {
        el.childNodes[el.childNodes.length-1].textContent = ` 🔒 Smart Lock: ${lockState}${lockBatt ? ' · ' + lockBatt + '%' : ''}`;
      }
    });
  }

  // NAS
  const nasEntity = L?.security?.nasEntity;
  if (nasEntity) {
    const nas = parseFloat(s[nasEntity]?.state ?? 0);
    document.querySelectorAll('.sensor').forEach(el => {
      if (el.textContent.includes('NAS')) {
        const dot = el.querySelector('.dot');
        if (dot) dot.className = `dot ${nas > 90 ? 'dwarn' : 'dok'}`;
        el.childNodes[el.childNodes.length-1].textContent = ` 💾 NAS Storage: ${nas.toFixed(1)}%`;
      }
    });
  }

  // alarm page
  const alarmEntity = L?.security?.alarm ?? 'alarm_control_panel.alarmo';
  const alarmState  = s[alarmEntity]?.state ?? 'unknown';
  const almEl = document.querySelector('.alm-s');
  if (almEl) {
    const alarmMap = { disarmed:'✓ Disarmed', armed_away:'🚨 Armed Away', armed_home:'🏠 Armed Home', triggered:'🚨 TRIGGERED' };
    almEl.textContent = alarmMap[alarmState] ?? alarmState;
    almEl.style.color = alarmState === 'disarmed' ? '#4ade80' : '#f87171';
  }

  // AC cards
  const acDefs = [
    { cls:'ac-lr', entity:'climate.1e05049f' },
    { cls:'ac-bd', entity:'climate.1e050116' },
    { cls:'ac-of', entity:'climate.1e51b62f' },
    { cls:'ac-ln', entity:'climate.1e51bb2c' },
  ];
  for (const d of acDefs) updateAcCard(s, d.cls, d.entity);

  // media
  updateMedia(s,'media_player.lg_webos_tv_uj670v','.mc-tv','LG TV · Living Room');
  updateMedia(s,'media_player.appletv','.mc-atv','Apple TV');
  updateMedia(s,'media_player.homepod_mini','#homepod-card','🍎 HomePod Mini');

  const _anyMedia = ['.mc-tv','.mc-atv','#homepod-card'].some(sel => {
    const c = document.querySelector(sel); return c && c.style.display !== 'none';
  });
  const _npSh = document.getElementById('now-playing-sh');
  const _npRow = document.getElementById('now-playing-row');
  if (_npSh) _npSh.style.display = _anyMedia ? '' : 'none';
  if (_npRow) _npRow.style.display = _anyMedia ? '' : 'none';

  // radio
  syncRadio(s[_radioEntity()]?.state === 'on');

  // prayer
  const praySensors = L?.chips?.prayer?.sensors ?? {
    fajr:'sensor.islamic_prayer_times_fajr_prayer', dhuhr:'sensor.islamic_prayer_times_dhuhr_prayer',
    asr:'sensor.islamic_prayer_times_asr_prayer',   maghrib:'sensor.islamic_prayer_times_maghrib_prayer',
    isha:'sensor.islamic_prayer_times_isha_prayer',
  };
  const prayerNames = { fajr:'Fajr', dhuhr:'Dhuhr', asr:'Asr', maghrib:'Maghrib', isha:'Isha' };
  const prayerIcons = { fajr:'🌙', dhuhr:'☀️', asr:'🌤️', maghrib:'🌇', isha:'🌃' };
  const now = Date.now();
  let next = null;
  for (const [key, entity] of Object.entries(praySensors)) {
    const t = new Date(s[entity]?.state).getTime();
    if (!isNaN(t) && t > now) { next = { name: prayerNames[key], icon: prayerIcons[key], time: t }; break; }
  }
  if (!next) { const k = 'fajr'; const t = new Date(s[praySensors[k]]?.state).getTime(); if (!isNaN(t)) next = { name: prayerNames[k], icon: prayerIcons[k], time: t }; }
  const pEl = document.getElementById('prayer-chip');
  if (pEl && next) {
    const d = new Date(next.time);
    const localStr = d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
    const diffMs = next.time - now;
    const hrs = Math.floor(diffMs / 3600000); const mins = Math.floor((diffMs % 3600000) / 60000);
    const left = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    pEl.innerHTML = `🕌 ${next.icon} <strong>${next.name}</strong> · ${localStr} &nbsp;<span style="opacity:.75;font-size:11px;">in ${left}</span>`;
  }

  // sync open popup toggles
  if (document.getElementById('popup')?.classList.contains('open')) {
    document.getElementById('pcontent')?.querySelectorAll('.tog[data-entity]').forEach(tog => {
      const ent = tog.dataset.entity;
      const tst = s[ent];
      if (!tst) return;
      const ton = tst.state !== 'off' && tst.state !== 'unavailable' && tst.state !== 'unknown';
      tog.classList.toggle('on', ton); tog.classList.toggle('off', !ton);
      const crow = tog.closest('.crow');
      if (crow) { const cv = crow.querySelector('.cval'); if (cv) cv.textContent = ton ? 'On' : 'Off'; }
    });
  }
});

// ── Room card updater ───────────────────────────────────────────────────────
function updateRoomCard(s, room) {
  const el = document.querySelector(`.room.r-${room.id}`);
  if (!el) return;
  const lightsOn = room.lights.some(e => s[e]?.state === 'on');
  const acSt = room.ac ? s[room.ac] : null;
  const acOn = acSt?.state === 'cool' || acSt?.state === 'heat' || acSt?.state === 'fan_only';
  const acTemp = acSt?.attributes?.temperature;
  el.classList.toggle('r-off', !lightsOn && !acOn);

  const c = _COLOR_CSS[room.color] ?? _COLOR_CSS.blue;

  // light badge
  el.querySelectorAll('.rbadges .rb:not([data-badge])').forEach(b => {
    if (b.textContent.includes('💡') || b.textContent.includes('Off') || b.textContent.includes('On')) {
      b.textContent = lightsOn ? '💡 On' : '💡 Off';
      b.className = lightsOn ? `rb ${c.rb}` : 'rb rb-off';
    }
  });

  // ac badge
  const acBadge = el.querySelector('[data-badge="ac"]');
  if (acBadge) {
    const modeIcon = { cool:'❄️', heat:'🌡️', fan_only:'💨' }[acSt?.state ?? ''] ?? '❄️';
    acBadge.textContent = acOn ? `${modeIcon} ${acTemp ?? '--'}°` : '❄️ Off';
    acBadge.className = acOn ? 'rb rb-ac' : 'rb rb-off';
  }

  // quick buttons
  el.querySelectorAll('.rbtn').forEach(btn => {
    const action = btn.dataset.action;
    if (action === 'light') {
      btn.textContent = lightsOn ? '💡 On' : '💡 Off';
      btn.className = `rbtn ${lightsOn ? c.rbtn : 'rbtn-off'}`;
    } else if (action === 'ac') {
      btn.textContent = acOn ? `❄️ ${acTemp ?? '--'}°` : '❄️ Off';
      btn.className = `rbtn ${acOn ? c.rbtn : 'rbtn-off'}`;
    }
  });
}

// ── Chip updater ────────────────────────────────────────────────────────────
function updateChips(s, L) {
  const alarmState = s['alarm_control_panel.alarmo']?.state ?? 'unknown';
  const almMap = { disarmed:'✓ Disarmed', armed_away:'🚨 Armed Away', armed_home:'🏠 Armed Home', triggered:'🚨 TRIGGERED' };
  const almChip = document.getElementById('alarm-chip') ?? document.querySelector('.chip-grn');
  if (almChip) almChip.textContent = `🛡️ ${almMap[alarmState] ?? alarmState}`;

  const doorEntity = L?.chips?.door?.entity ?? 'binary_sensor.maindoorsensor_contact';
  const doorSt = s[doorEntity]?.state;
  const doorEl = document.getElementById('door-chip');
  if (doorEl) {
    const doorOpen = doorSt === 'on';
    doorEl.textContent = doorOpen ? '🚪 Door · Open' : '🚪 Door · Closed';
    doorEl.style.borderColor = doorOpen ? 'rgba(239,68,68,.5)' : '';
    doorEl.style.color = doorOpen ? '#f87171' : '';
  }

  const wxEntity = L?.chips?.weather?.entity ?? 'weather.forecast_home';
  const wx = s[wxEntity];
  if (wx) {
    const wIcons = { sunny:'☀️','clear-day':'☀️','clear-night':'🌙',cloudy:'☁️',partlycloudy:'⛅',fog:'🌫️',rainy:'🌧️',snowy:'❄️',windy:'🌬️',lightning:'⛈️' };
    const icon = wIcons[wx.state] ?? '🌡️';
    const condRaw = wx.state.replace(/-/g,' ');
    const cond = condRaw.charAt(0).toUpperCase() + condRaw.slice(1);
    const wEl = document.querySelector('.chip-blu') ?? document.getElementById('weather-chip');
    if (wEl) wEl.textContent = `${icon} ${wx.attributes.temperature}°C · ${cond}`;
  }

  const persons = L?.chips?.presence?.persons ?? [{ entity:'person.raed', name:'Raed' }, { entity:'person.rola', name:'Rola' }];
  const presEl = document.querySelector('.chip-pur');
  if (presEl) presEl.textContent = '👤 ' + persons.map(p => `${p.name} · ${s[p.entity]?.state === 'home' ? 'Home' : 'Away'}`).join('  |  ');
}

// ── Popup rooms ──────────────────────────────────────────────────────────────
// Dynamic popup content generated from layout config
window.pop = function(id) {
  const L = window.__layout;
  const room = L?.rooms?.find(r => r.id === id) ?? _FALLBACK_ROOMS.find(r => r.id === id);
  if (!room) return;

  const pico = document.getElementById('pico');
  const pname = document.getElementById('pname');
  const psub = document.getElementById('psub');
  const pcontent = document.getElementById('pcontent');
  if (!pname || !pcontent) return;

  const c = _COLOR_CSS[room.color] ?? _COLOR_CSS.blue;
  if (pico) { pico.textContent = room.icon; pico.style.background = c.rico; }
  if (pname) pname.textContent = room.name;
  if (psub) psub.textContent = `${room.lights.length} light${room.lights.length !== 1 ? 's' : ''}${room.ac ? ' · AC' : ''}`;

  // Generate popup HTML from room's entity list
  let html = '';

  // Lights section
  html += `<div class="psec">💡 Lights</div><div class="pc">`;
  for (const entity of room.lights) {
    const label = entity.split('.')[1].replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    html += `<div class="ctrl"><div class="clbl">${label}</div>
      <div class="crow"><div><div class="cval">--</div><div class="csub">${entity}</div></div>
      <button class="tog off" data-entity="${entity}"></button></div></div>`;
  }
  html += `</div>`;

  // AC section
  if (room.ac) {
    const acColors = { blue:'#38bdf8', purple:'#a78bfa', amber:'#fbbf24', cyan:'#22d3ee', pink:'#fb7185', green:'#4ade80', indigo:'#94a3b8', rose:'#fb7185' };
    const acColor = acColors[room.color] ?? '#38bdf8';
    html += `<div class="psec">❄️ Air Conditioning</div><div class="pc">
      <div class="ctrl full">
        <div class="clbl">${room.name} AC — ${room.ac}</div>
        <div class="tempd"><span class="tbig" style="color:${acColor}">--</span><span class="tunit">°C</span></div>
        <div class="csub">Standby</div>
        <input class="tslider" type="range" min="16" max="30" value="23" style="--c:${acColor}" oninput="slup(this)" data-ac="${room.ac}">
        <div class="scenes">
          <button class="scene off">❄️ Cool</button>
          <button class="scene off">💨 Fan</button>
          <button class="scene off">🌡️ Heat</button>
          <button class="scene off">Off</button>
        </div>
      </div></div>`;
  }

  // Extras section
  if (room.extras?.length) {
    html += `<div class="psec">⚙️ Extra Entities</div><div class="pc">`;
    for (const ex of room.extras) {
      html += `<div class="ctrl"><div class="clbl">${ex.label}</div>
        <div class="crow"><div><div class="cval">--</div><div class="csub">${ex.entity}</div></div>
        <button class="tog off" data-entity="${ex.entity}"></button></div></div>`;
    }
    html += `</div>`;
  }

  pcontent.innerHTML = html;
  document.getElementById('overlay').classList.add('open');
  document.getElementById('popup').classList.add('open');
  bindPopupControls();
};

// For legacy popup IDs used in AC page
window.pop = (function(_orig) {
  return function(id) {
    if (id.startsWith('ac-')) { openAcPopup(id); return; }
    _orig(id);
  };
})(window.pop);

function openAcPopup(id) {
  const acMap = { 'ac-lr': { entity:'climate.1e05049f', name:'Living Room', color:'#38bdf8' },
    'ac-bd': { entity:'climate.1e050116', name:'Bedroom', color:'#a78bfa' },
    'ac-of': { entity:'climate.1e51b62f', name:'Office', color:'#22d3ee' },
    'ac-ln': { entity:'climate.1e51bb2c', name:'Laundry', color:'#fb7185' } };
  const def = acMap[id]; if (!def) return;
  const pico = document.getElementById('pico');
  const pname = document.getElementById('pname');
  const psub = document.getElementById('psub');
  if (pico) { pico.textContent = '❄️'; pico.style.background = 'rgba(56,189,248,.22)'; }
  if (pname) pname.textContent = def.name + ' AC';
  if (psub) psub.textContent = def.entity;
  document.getElementById('pcontent').innerHTML = `
    <div class="pc"><div class="ctrl full">
      <div class="tempd"><span class="tbig" style="color:${def.color}">--</span><span class="tunit">°C</span></div>
      <div class="csub">Standby</div>
      <input class="tslider" type="range" min="16" max="30" value="23" style="--c:${def.color}" oninput="slup(this)" data-ac="${def.entity}">
      <div class="scenes"><button class="scene off">❄️ Cool</button><button class="scene off">💨 Fan</button><button class="scene off">🌡️ Heat</button><button class="scene off">Off</button></div>
    </div></div>`;
  document.getElementById('overlay').classList.add('open');
  document.getElementById('popup').classList.add('open');
  bindPopupControls();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function updateAcCard(s, cls, entity) {
  const card = document.querySelector(`.${cls}`);
  if (!card) return;
  const st = s[entity]; if (!st) return;
  const mode = st.state; const setTemp = st.attributes?.temperature ?? '--'; const curTemp = st.attributes?.current_temperature ?? '--';
  const isOn = mode !== 'off';
  const badge = card.querySelector('.badge');
  const tempEl = card.querySelector('.actemp');
  const subEl  = card.querySelector('.acsub');
  const modeLabel = { cool:'❄️ Cool', heat:'🌡️ Heat', fan_only:'💨 Fan', dry:'💧 Dry' }[mode] ?? mode;
  if (badge) { badge.textContent = isOn ? modeLabel : 'Off'; badge.className = isOn ? 'badge badge-c' : 'badge badge-off'; }
  if (tempEl) tempEl.textContent = isOn ? `${setTemp}°` : '--°';
  if (subEl) subEl.textContent = isOn ? `Set ${setTemp}°C · Room ${curTemp}°C · ${st.attributes?.fan_mode ?? ''}` : 'Off';
}

function updateMedia(s, entity, selector, label) {
  const card = document.querySelector(selector);
  if (!card) return;
  const st = s[entity];
  const isOff = !st || st.state === 'off' || st.state === 'unavailable' || st.state === 'standby';
  if (isOff) {
    card.style.display = 'none';
    if (_mediaPauseTimers.has(entity)) { clearTimeout(_mediaPauseTimers.get(entity)); _mediaPauseTimers.delete(entity); }
    return;
  }
  const isIdleOrPaused = st.state === 'idle' || st.state === 'paused';
  if (!isIdleOrPaused) {
    if (_mediaPauseTimers.has(entity)) { clearTimeout(_mediaPauseTimers.get(entity)); _mediaPauseTimers.delete(entity); }
  } else if (!_mediaPauseTimers.has(entity)) {
    const tid = setTimeout(() => {
      const c = document.querySelector(selector); if (c) c.style.display = 'none';
      _mediaPauseTimers.delete(entity);
      const any = ['.mc-tv','.mc-atv','#homepod-card'].some(sel => { const c2 = document.querySelector(sel); return c2 && c2.style.display !== 'none'; });
      const _np1 = document.getElementById('now-playing-sh'); if (_np1) _np1.style.display = any ? '' : 'none';
      const _np2 = document.getElementById('now-playing-row'); if (_np2) _np2.style.display = any ? '' : 'none';
    }, 5 * 60 * 1000);
    _mediaPauseTimers.set(entity, tid);
  }
  card.style.display = '';
  const playing = st.state === 'playing';
  const titleEl = card.querySelector('.mtit'); const subEl = card.querySelector('.msub'); const playBtn = card.querySelector('.mcc.play');
  if (titleEl) titleEl.textContent = st.attributes?.media_title ?? (playing ? 'Playing' : st.state.charAt(0).toUpperCase()+st.state.slice(1));
  if (subEl) { const vol = Math.round((st.attributes?.volume_level ?? 0) * 100); subEl.textContent = `Vol ${vol}% · ${st.state}`; }
  if (playBtn) playBtn.textContent = playing ? '⏸' : '▶️';
  const volFill = card.querySelector('.volf');
  if (volFill) volFill.style.width = Math.round((st.attributes?.volume_level ?? 0.65) * 100) + '%';
}

function syncRadio(isOn) {
  const tog2 = document.getElementById('radio-tog2');
  if (tog2) { tog2.classList.toggle('on', isOn); tog2.classList.toggle('off', !isOn); }
  const map = { 'radio-tv-title': isOn?'Radio — On':'Radio — Off', 'radio-app-lbl': isOn?'Radio On':'Radio Off' };
  for (const [id, txt] of Object.entries(map)) { const el = document.getElementById(id); if (el) el.textContent = txt; }
  const dot = document.getElementById('radio-app-dot');
  if (dot) dot.style.background = isOn ? '#4ade80' : '#6b7280';
  const ico = document.getElementById('radio-app-ico');
  if (ico) ico.style.opacity = isOn ? '1' : '0.4';
  const sub = document.getElementById('radio-tv-sub');
  if (sub) sub.textContent = _radioEntity() + ' · Tap to toggle';
}
window.updateRadioToggle = () => {};

function updateBatteryDynamic(s, threshold) {
  const wrap = document.getElementById('notif-wrap'); if (!wrap) return;
  const low = [];
  for (const [entityId, state] of Object.entries(s)) {
    if (!state || !entityId.startsWith('sensor.')) continue;
    const attrs = state.attributes ?? {};
    const isBatt = attrs.device_class === 'battery' || entityId.includes('_battery') || entityId.includes('_batt_');
    if (!isBatt) continue;
    const pct = parseFloat(state.state);
    if (isNaN(pct) || pct > threshold) continue;
    low.push({ entityId, pct, name: attrs.friendly_name ?? entityId.replace('sensor.','').replace(/_/g,' ') });
  }
  wrap.querySelectorAll('.notif-card[data-entity]').forEach(card => {
    const pct = parseFloat(s[card.dataset.entity]?.state);
    if (!isNaN(pct) && pct > threshold) { window._battDismissed?.delete(card.id); card.remove(); }
  });
  low.forEach(({ entityId, pct, name }) => {
    const cardId = 'nbatt_' + entityId.replace(/[^a-z0-9]/gi, '_');
    if ((window._battDismissed ?? new Set()).has(cardId)) return;
    const isCrit = pct <= Math.round(threshold * 0.5);
    const icon = _battIcon(entityId, name); const level = isCrit ? 'crit' : 'warn';
    let card = document.getElementById(cardId);
    if (card) {
      const fill = card.querySelector('.batt-fill-crit, .batt-fill-warn'); if (fill) fill.style.width = pct + '%';
      const label = card.querySelector('[class^="batt-pct"]'); if (label) label.textContent = pct + '%';
    } else {
      card = document.createElement('div');
      card.className = `notif-card notif-${level}`; card.id = cardId; card.dataset.entity = entityId;
      card.innerHTML = `<div class="notif-ico">${icon}</div><div class="notif-body"><div class="notif-title">${name} — ${isCrit?'Critical':'Low'} Battery</div><div class="notif-sub">${entityId}</div><div class="notif-batt"><div class="batt-bar"><div class="batt-fill-${level}" style="width:${pct}%"></div></div><div class="batt-pct batt-pct-${level}">${pct}%</div></div></div><button class="notif-x" onclick="dismissNotif('${cardId}')">✕</button>`;
      wrap.appendChild(card);
    }
  });
  const bar = document.getElementById('notif-bar'); if (bar) bar.style.display = wrap.children.length ? '' : 'none';
  if (typeof updateBell === 'function') updateBell();
}

function _battIcon(entityId, name) {
  const n = (entityId + ' ' + name).toLowerCase();
  if (n.includes('ipad')||n.includes('tablet')) return '📱';
  if (n.includes('iphone')||n.includes('phone')||n.includes('mobile')) return '📱';
  if (n.includes('brush')||n.includes('toothbrush')) return '🪥';
  if (n.includes('lock')) return '🔒';
  if (n.includes('door')||n.includes('contact')) return '🚪';
  if (n.includes('motion')) return '🏃';
  if (n.includes('remote')||n.includes('button')) return '🎮';
  if (n.includes('watch')) return '⌚';
  return '🔋';
}

// ── Popup HA binding ────────────────────────────────────────────────────────
function bindPopupControls() {
  const pc = document.getElementById('pcontent'); if (!pc) return;

  pc.querySelectorAll('.tog[data-entity]').forEach(tog => {
    const entity = tog.dataset.entity; const domain = entity.split('.')[0];
    const st = getState(entity);
    if (st) {
      const isOn = st.state !== 'off' && st.state !== 'unavailable' && st.state !== 'unknown';
      tog.classList.toggle('on', isOn); tog.classList.toggle('off', !isOn);
      const crow = tog.closest('.crow');
      if (crow) { const cval = crow.querySelector('.cval'); if (cval && cval.textContent === '--') cval.textContent = isOn ? 'On' : 'Off'; }
    }
    tog.onclick = (e) => {
      e.stopPropagation();
      const isOn = tog.classList.contains('on');
      tog.classList.toggle('on', !isOn); tog.classList.toggle('off', isOn);
      const crow = tog.closest('.crow');
      if (crow) { const cv = crow.querySelector('.cval'); if (cv) cv.textContent = isOn ? 'Off' : 'On'; }
      if (domain === 'climate') window.haClimateMode(entity, isOn ? 'off' : 'cool');
      else if (domain === 'automation') callHA('automation','toggle',entity);
      else window.haToggle(entity);
    };
  });

  pc.querySelectorAll('[data-script]').forEach(btn => { btn.onclick = () => window.haScript(btn.dataset.script); });

  pc.querySelectorAll('[data-ac-sw]').forEach(btn => {
    const entity = btn.dataset.acSw;
    const st = getState(entity);
    if (st?.state === 'on') btn.style.opacity = '1';
    btn.onclick = () => window.haToggle(entity);
  });

  pc.querySelectorAll('.tslider[data-ac]').forEach(slider => {
    const entity = slider.dataset.ac; const st = getState(entity);
    const tbig = slider.closest('.ctrl')?.querySelector('.tbig');
    const csub = slider.closest('.ctrl')?.querySelector('.csub');
    if (st) {
      const setTemp = st.attributes?.temperature; const curTemp = st.attributes?.current_temperature;
      if (setTemp) { slider.value = setTemp; if (tbig) tbig.textContent = setTemp; }
      if (csub) csub.textContent = st.state === 'off' ? 'Off' : `Set ${setTemp}°C · Current ${curTemp ?? '--'}°C · ${st.state}`;
      const scenes = slider.closest('.ctrl')?.querySelector('.scenes');
      if (scenes) _updateAcScenes(scenes, entity, st.state);
    }
    slider.removeEventListener('change', slider._acChange);
    slider._acChange = () => { window.haClimateTemp(entity, parseInt(slider.value)); if (tbig) tbig.textContent = slider.value; };
    slider.addEventListener('change', slider._acChange);
    slider.addEventListener('input', () => { if (tbig) tbig.textContent = slider.value; });
  });

  pc.querySelectorAll('.ctrl').forEach(ctrl => {
    const slider = ctrl.querySelector('.tslider[data-ac]'); if (!slider) return;
    const entity = slider.dataset.ac;
    const scenes = ctrl.querySelector('.scenes'); if (!scenes) return;
    const modeMap = { '❄️ Cool':'cool', '💨 Fan':'fan_only', '🌡️ Heat':'heat', 'Off':'off', '⏹ Off':'off' };
    scenes.querySelectorAll('.scene').forEach(btn => {
      const mode = modeMap[btn.textContent.trim()]; if (!mode) return;
      btn.onclick = () => { window.haClimateMode(entity, mode); _updateAcScenes(scenes, entity, mode); };
    });
  });
}

function _updateAcScenes(scenes, entity, mode) {
  const modeMap = { cool:'❄️ Cool', fan_only:'💨 Fan', heat:'🌡️ Heat', off:'Off' };
  const activeLabel = modeMap[mode] ?? 'Off';
  scenes.querySelectorAll('.scene').forEach(s => {
    const txt = s.textContent.trim();
    const isActive = txt === activeLabel || (mode === 'off' && (txt === 'Off' || txt === '⏹ Off'));
    s.classList.toggle('on', isActive); s.classList.toggle('off', !isActive);
  });
}

const _origPop = window.pop;
// pop() is defined in index.html inline as well — override on module load
document.addEventListener('DOMContentLoaded', () => {
  // bind app icons from layout
  const L = window.__layout;
  if (L?.media?.apps) {
    document.querySelectorAll('.app').forEach(app => {
      const appId = app.id?.replace('app-','') || [...app.classList].find(c => c !== 'app');
      const cfg = L.media.apps.find(a => a.id === appId);
      if (!cfg) return;
      if (cfg.actionType === 'input_button') app.onclick = () => window.haInputBtn(cfg.entity);
      else if (cfg.actionType === 'boolean') app.onclick = () => window.haBoolToggle(cfg.entity);
      else if (cfg.actionType === 'script') app.onclick = () => window.haScript(cfg.entity);
    });
  }
  // bind TV page app grid
  document.querySelectorAll('.ta').forEach(ta => {
    const cls = [...ta.classList].find(c => c !== 'ta');
    const appMap = { nf:'input_button.netflix', yt:'input_button.youtube', sh:'input_button.shahid', px:'input_button.plex', st:'input_button.stc_tv' };
    if (appMap[cls]) ta.onclick = () => window.haInputBtn(appMap[cls]);
    if (cls === 'mk') ta.onclick = () => window.toggleRadio();
  });
  // bind guest AC scripts (climate page)
  document.querySelectorAll('#page-climate .sbtn').forEach(btn => {
    const scriptMap = { '▶️ Turn ON':'script.guestac_on','⏹ Turn OFF':'script.guestac',
      '19°C':'script.guesac_temp19','20°C':'script.guesac_temp20','21°C':'script.guesac_temp21',
      '22°C':'script.guesac_temp22','23°C':'script.guesac_temp23',
      '▲ Up':'script.guestac_tempup','▼ Down':'script.guesac_tempdown' };
    const sid = scriptMap[btn.textContent.trim()];
    if (sid) btn.onclick = () => window.haScript(sid);
  });
  // alarm arm buttons
  document.querySelectorAll('.alm-btn').forEach(btn => {
    if (btn.classList.contains('alm-away')) btn.onclick = () => { window.alarmPopup?.(); window.almShowPin?.('alarm_arm_away','🚨 Arm Away — press ✓ to confirm'); };
    if (btn.classList.contains('alm-home')) btn.onclick = () => { window.alarmPopup?.(); window.almShowPin?.('alarm_arm_home','🏠 Arm Home — press ✓ to confirm'); };
  });
  // media controls
  bindMediaControls('media_player.lg_webos_tv_uj670v','.mc-tv');
  bindMediaControls('media_player.appletv','.mc-atv');
  bindMediaControls('media_player.homepod_mini','#homepod-card');
  // TV remote
  const tvEntity = L?.media?.tvRemote ?? 'media_player.lg_webos_tv_uj670v';
  document.querySelectorAll('.rk2').forEach(btn => {
    const t = btn.textContent.trim();
    if (t.includes('⏮')) btn.onclick = () => window.haMediaCmd(tvEntity,'media_previous_track');
    if (t.includes('⏸')) btn.onclick = () => window.haMediaCmd(tvEntity,'media_play_pause');
    if (t.includes('⏭')) btn.onclick = () => window.haMediaCmd(tvEntity,'media_next_track');
    if (t.includes('Home')) btn.onclick = () => window.haMediaCmd(tvEntity,'select_source',{source:'Home'});
    if (t.includes('Back')) btn.onclick = () => window.haMediaCmd(tvEntity,'select_source',{source:'Back'});
    if (t.includes('Mute')) btn.onclick = () => window.haMediaCmd(tvEntity,'volume_mute',{is_volume_muted:true});
  });
});

function bindMediaControls(entity, selector) {
  const card = document.querySelector(selector); if (!card) return;
  card.querySelectorAll('.mcc').forEach(btn => {
    const txt = btn.textContent;
    if (txt==='⏸'||txt==='⏯'||txt==='▶️') btn.onclick = () => window.haMediaCmd(entity,'media_play_pause');
    if (txt==='⏮') btn.onclick = () => window.haMediaCmd(entity,'media_previous_track');
    if (txt==='⏭') btn.onclick = () => window.haMediaCmd(entity,'media_next_track');
    if (txt==='⏹') btn.onclick = () => window.haMediaCmd(entity,'media_stop');
    if (txt==='🔇') btn.onclick = () => window.haMediaCmd(entity,'volume_mute',{is_volume_muted:true});
  });
}

// ── Radio ────────────────────────────────────────────────────────────────────
const _radioEntity = () => {
  const L = window.__layout;
  const radioApp = L?.media?.apps?.find(a => a.id === 'mk');
  return radioApp?.entity ?? L?.media?.radioBoolean ?? 'switch.radio_on_sw';
};
window.toggleRadio = () => { const e = _radioEntity(); callHA(e.split('.')[0],'toggle',e); };

// ── Camera ───────────────────────────────────────────────────────────────────
window.loadCamImages = function() {
  const tk = sessionStorage.getItem('ha_dash_token'); if (!tk) return;
  const cameras = window.__layout?.security?.cameras ?? [
    { id:'doorbell', entity:'camera.g4_doorbell_pro_poe_high_resolution_channel', label:'G4 Doorbell' },
    { id:'package',  entity:'camera.g4_doorbell_pro_poe_package_camera',          label:'Package Cam' },
  ];
  cameras.forEach(cam => {
    const img = document.getElementById(`cam-img-${cam.id}`);
    const ph  = document.getElementById(`cam-ph-${cam.id}`);
    if (!img) return;
    img.onload = () => { img.style.display = 'block'; if (ph) ph.style.display = 'none'; };
    img.onerror = () => { img.style.display = 'none'; if (ph) ph.style.display = ''; };
    img.src = `/api/camera/${cam.entity}?token=${encodeURIComponent(tk)}&_=${Date.now()}`;
  });
};

window.closeCamPopup = function() {
  clearInterval(window._camStillInt);
  const popup = document.getElementById('cam-popup');
  if (!popup) return;
  if (popup._hls) { popup._hls.destroy(); popup._hls = null; }
  if (popup._pc)  { popup._pc.close();    popup._pc  = null; }
  const v = popup.querySelector('video');
  if (v) { v.pause(); v.srcObject = null; v.src = ''; v.load(); }
  popup.remove();
};

function _camPopupShell(label, entity) {
  window.closeCamPopup();
  const popup = document.createElement('div');
  popup.id = 'cam-popup';
  popup.innerHTML = `
    <div class="cam-popup-inner">
      <div class="cam-popup-hd">
        <span id="cam-popup-title" style="color:#fff;font-weight:700;font-size:15px;">${label ?? entity}</span>
        <button class="cam-close-btn" onclick="window.closeCamPopup()">✕</button>
      </div>
      <video id="cam-video" autoplay playsinline controls
        style="width:100%;border-radius:16px;background:#000;max-height:70vh;display:none;"></video>
      <div id="cam-msg" style="text-align:center;padding:40px 20px;color:#94a3b8;font-size:14px;">⏳ Connecting…</div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) window.closeCamPopup(); });
  return popup;
}

function _camMjpegFallback(popup, entity, tk) {
  const video = document.getElementById('cam-video');
  const msg   = document.getElementById('cam-msg');
  if (video) video.style.display = 'none';
  if (popup._pc) { popup._pc.close(); popup._pc = null; }

  const img = document.createElement('img');
  img.style.cssText = 'width:100%;border-radius:16px;object-fit:contain;max-height:70vh;display:block;';
  if (msg) { msg.style.display = 'none'; popup.querySelector('.cam-popup-inner').insertBefore(img, msg); }

  const title = document.getElementById('cam-popup-title');
  if (title && !title.nextElementSibling?.classList?.contains('cam-snap-badge')) {
    title.insertAdjacentHTML('afterend',
      '<span class="cam-snap-badge" style="font-size:10px;color:#4ade80;background:rgba(74,222,128,.15);padding:3px 9px;border-radius:50px;border:1px solid rgba(74,222,128,.3);margin-left:8px;">↻ Snapshot</span>');
  }

  const load = () => { img.src = `/api/camera/${entity}?token=${encodeURIComponent(tk)}&_t=${Date.now()}`; };
  load();
  window._camStillInt = setInterval(load, 3000);
}

async function _tryScryptedFallback(popup, entity, tk) {
  try {
    const r = await fetch(`/api/camera/${entity}/scrypted-stream`, { headers: { Authorization: `Bearer ${tk}` } });
    const data = await r.json();
    if (data.error || !data.url) throw new Error(data.error ?? 'no url');
    // Reuse HLS playback logic
    const video = document.getElementById('cam-video');
    const msg   = document.getElementById('cam-msg');
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      popup._hls = hls;
      hls.loadSource(data.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (msg) msg.style.display = 'none';
        video.style.display = 'block';
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) { hls.destroy(); popup._hls = null; _tryHlsFallback(popup, entity, tk); }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = data.url;
      video.style.display = 'block';
      if (msg) msg.style.display = 'none';
      video.play().catch(() => {});
    } else {
      throw new Error('HLS not supported');
    }
  } catch {
    _tryHlsFallback(popup, entity, tk);
  }
}

async function _tryHlsFallback(popup, entity, tk) {
  const video = document.getElementById('cam-video');
  const msg   = document.getElementById('cam-msg');
  try {
    const r = await fetch(`/api/camera/${entity}/stream`, { headers: { Authorization: `Bearer ${tk}` } });
    const data = await r.json();
    if (data.error || !data.url) throw new Error(data.error ?? 'no url');

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      popup._hls = hls;
      hls.loadSource(data.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        msg.style.display = 'none';
        video.style.display = 'block';
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) { hls.destroy(); popup._hls = null; _camMjpegFallback(popup, entity, tk); }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = data.url;
      video.style.display = 'block';
      msg.style.display = 'none';
      video.play().catch(() => {});
    } else {
      throw new Error('HLS not supported');
    }
  } catch {
    _camMjpegFallback(popup, entity, tk);
  }
}

window.openCamStream = async function(entity, label) {
  const tk = sessionStorage.getItem('ha_dash_token'); if (!tk) return;
  const popup = _camPopupShell(label, entity);
  const video = document.getElementById('cam-video');
  const msg   = document.getElementById('cam-msg');

  try {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    popup._pc = pc;

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Gather ICE candidates (up to 5 s)
    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') return resolve(null);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(null); };
      setTimeout(resolve, 5000, null);
    });

    const r = await fetch(`/api/camera/${entity}/webrtc-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: JSON.stringify({ offer: pc.localDescription?.sdp }),
    });
    const data = await r.json();
    if (data.error || !data.answer) throw new Error(data.error ?? 'No WebRTC answer');

    await pc.setRemoteDescription({ type: 'answer', sdp: data.answer });

    // If no video track arrives in 10 s, try Scrypted HLS → HA HLS → snapshots
    const fallbackTimer = setTimeout(() => {
      if (video && video.style.display === 'none') {
        pc.close(); popup._pc = null;
        _tryScryptedFallback(popup, entity, tk);
      }
    }, 10_000);

    pc.ontrack = e => {
      clearTimeout(fallbackTimer);
      if (!video.srcObject) {
        video.srcObject = new MediaStream();
        msg.style.display = 'none';
        video.style.display = 'block';
        video.play().catch(() => {});
      }
      video.srcObject.addTrack(e.track);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        clearTimeout(fallbackTimer);
        _tryScryptedFallback(popup, entity, tk);
      }
    };

  } catch {
    _tryScryptedFallback(popup, entity, tk);
  }
};

// ── Fallback entity lists (used if /api/layout fails) ──────────────────────
const _FALLBACK_ROOMS = [
  { id:'lr', name:'Living Room', icon:'🛋️', color:'blue',   visible:true, order:0, lights:['switch.livingroomswitchgroup','light.tv_led','light.yeelight_colorb_0x1b35f509'], ac:'climate.1e05049f', tv:'media_player.lg_webos_tv_uj670v', extras:[] },
  { id:'bd', name:'Bedroom',     icon:'🛏️', color:'purple', visible:true, order:1, lights:['switch.masterroom_group_switch','switch.master_lights_left','switch.master_bath_left'], ac:'climate.1e050116', extras:[] },
  { id:'kt', name:'Kitchen',     icon:'🍳', color:'amber',  visible:true, order:2, lights:['switch.kitchen_group_switch','switch.kitchenlights_left','switch.kitchenlights_right','light.wled_2'], extras:[] },
  { id:'of', name:'Office',      icon:'💼', color:'cyan',   visible:true, order:3, lights:['switch.office_group_swithces','switch.office_light_left','switch.office_light_right'], ac:'climate.1e51b62f', extras:[] },
  { id:'br', name:'Baby Room',   icon:'👶', color:'pink',   visible:true, order:4, lights:['switch.baby_room'], extras:[] },
  { id:'gr', name:'Guest Room',  icon:'🚪', color:'green',  visible:true, order:5, lights:['switch.guest_room_switches','switch.guest_light_left','switch.guest_light_right','switch.guest_light_center'], extras:[] },
  { id:'hw', name:'Hallway',     icon:'🏠', color:'indigo', visible:true, order:6, lights:['switch.hallway_switches','switch.collidor','switch.entrance_light_left','switch.entrance_light_right'], extras:[] },
  { id:'ln', name:'Laundry',     icon:'🧺', color:'rose',   visible:true, order:7, lights:['switch.laundry_light_left','switch.laundry_light_right'], ac:'climate.1e51bb2c', extras:[] },
];
const _FALLBACK_LIGHTS = [
  'switch.livingroomswitchgroup','light.tv_led','light.yeelight_colorb_0x1b35f509',
  'switch.kitchenlights_left','switch.kitchenlights_right','light.wled_2',
  'switch.master_lights_left','switch.master_lights_center','switch.master_lights_right',
  'switch.master_lights1_left','switch.master_lights1_center','switch.master_lights1_right',
  'switch.master_bath_left','switch.master_bath_center','switch.master_bath_right',
  'switch.office_light_left','switch.office_light_right','switch.baby_room',
  'switch.guest_light_left','switch.guest_light_right','switch.guest_light_center',
  'switch.hallway_switches','switch.entrance_light_left','switch.entrance_light_right',
  'switch.collidor','switch.betweenroomslights_left','switch.betweenroomslights_right',
  'switch.laundry_light_left','switch.laundry_light_right',
];

// ── Doorbell alert ───────────────────────────────────────────────────────────
(function() {
  // Inject keyframe CSS once
  const style = document.createElement('style');
  style.textContent = `
    @keyframes db-pop  { from{opacity:0;transform:scale(.88)} to{opacity:1;transform:scale(1)} }
    @keyframes db-ring { 0%,100%{transform:rotate(0) scale(1)} 20%{transform:rotate(-18deg) scale(1.1)} 60%{transform:rotate(16deg) scale(1.1)} }
    @keyframes db-pulse{ 0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,.5)} 50%{box-shadow:0 0 0 12px rgba(251,191,36,0)} }
  `;
  document.head.appendChild(style);

  let _lastDoorbellState = null;
  let _alertShowing = false;

  document.addEventListener('ha-states-updated', () => {
    const L = window.__layout?.security ?? {};
    // Entity to watch — configured in admin or fallback to discovered UniFi entity
    const triggerId = L.doorbellEntity || 'event.g4_doorbell_pro_poe_doorbell';
    const cameraId  = L.doorbellCamera || 'camera.g4_doorbell_pro_poe_high_resolution_channel';
    const camLabel  = (window.__layout?.security?.cameras ?? []).find(c => c.entity === cameraId)?.label || 'Doorbell Camera';

    const ent = window.__haEntities?.[triggerId];
    if (!ent) return;

    const cur = ent.state;
    if (_lastDoorbellState === null) { _lastDoorbellState = cur; return; } // first load — store, don't fire
    if (cur === _lastDoorbellState) return;
    _lastDoorbellState = cur;
    if (cur === 'unknown' || cur === 'unavailable') return;

    _showDoorbellAlert(cameraId, camLabel);
  });

  function _showDoorbellAlert(cameraId, cameraLabel) {
    if (_alertShowing) return;
    _alertShowing = true;

    document.getElementById('doorbell-alert')?.remove();
    clearInterval(window._doorbellSnapInt);
    clearInterval(window._doorbellCdInt);

    const tk = sessionStorage.getItem('ha_dash_token');
    const el = document.createElement('div');
    el.id = 'doorbell-alert';
    el.style.cssText = 'position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:20px;';
    el.innerHTML = `
      <div style="background:#0d1526;border:1px solid rgba(251,191,36,.35);border-radius:24px;padding:28px 26px;
        max-width:480px;width:100%;box-shadow:0 0 0 1px rgba(251,191,36,.1),0 32px 64px rgba(0,0,0,.7);
        animation:db-pop .35s cubic-bezier(.34,1.56,.64,1)">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
          <div style="width:54px;height:54px;border-radius:16px;background:rgba(251,191,36,.15);
            border:1px solid rgba(251,191,36,.4);display:flex;align-items:center;justify-content:center;
            font-size:28px;flex-shrink:0;animation:db-ring .5s ease-in-out 4,db-pulse 1.5s ease-in-out infinite">🔔</div>
          <div style="flex:1">
            <div style="font-size:19px;font-weight:800;color:#fff;line-height:1.2">Someone at the door!</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">${cameraLabel}</div>
          </div>
          <div id="db-cd" style="font-size:13px;color:#475569;font-variant-numeric:tabular-nums;flex-shrink:0">30s</div>
        </div>
        <div style="position:relative;border-radius:14px;overflow:hidden;background:#000;min-height:100px;margin-bottom:18px">
          <img id="db-snap" style="width:100%;display:block;border-radius:14px;min-height:100px;object-fit:cover"/>
          <div id="db-snap-ph" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#475569;font-size:13px">Loading…</div>
        </div>
        <div style="display:flex;gap:10px">
          <button id="db-open" style="flex:1;padding:13px;border-radius:12px;border:none;cursor:pointer;
            background:rgba(91,141,238,.9);color:#fff;font-size:14px;font-weight:700;font-family:inherit;
            transition:filter .15s">📹 Open Live Camera</button>
          <button id="db-dismiss" style="padding:13px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.1);
            cursor:pointer;background:rgba(255,255,255,.05);color:#94a3b8;font-size:14px;font-weight:600;font-family:inherit">
            Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    // Snapshot refresh
    if (tk) {
      const img = document.getElementById('db-snap');
      const ph  = document.getElementById('db-snap-ph');
      const load = () => {
        const url = `/api/camera/${cameraId}?token=${encodeURIComponent(tk)}&_t=${Date.now()}`;
        const tmp = new Image();
        tmp.onload = () => { img.src = url; if (ph) ph.style.display = 'none'; };
        tmp.src = url;
      };
      load();
      window._doorbellSnapInt = setInterval(load, 3000);
    }

    // Countdown
    let secs = 30;
    const cd = document.getElementById('db-cd');
    window._doorbellCdInt = setInterval(() => {
      secs--;
      if (cd) cd.textContent = secs + 's';
      if (secs <= 0) _dismissDoorbellAlert();
    }, 1000);

    document.getElementById('db-open').onclick = () => {
      _dismissDoorbellAlert();
      window.openCamStream?.(cameraId, cameraLabel);
    };
    document.getElementById('db-dismiss').onclick = _dismissDoorbellAlert;
    el.addEventListener('click', e => { if (e.target === el) _dismissDoorbellAlert(); });
  }

  function _dismissDoorbellAlert() {
    clearInterval(window._doorbellSnapInt);
    clearInterval(window._doorbellCdInt);
    _alertShowing = false;
    const el = document.getElementById('doorbell-alert');
    if (!el) return;
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }

  window._testDoorbellAlert = () => {
    _lastDoorbellState = 'test_trigger';
    _alertShowing = false;
    _showDoorbellAlert(
      window.__layout?.security?.doorbellCamera || 'camera.g4_doorbell_pro_poe_high_resolution_channel',
      'Doorbell Camera'
    );
  };
})();

// ── Start ────────────────────────────────────────────────────────────────────
window._enableNotifications = _enableNotifications;
_registerSW();
boot();
