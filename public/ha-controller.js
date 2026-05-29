import { connect, callHA, getState, getAttr } from './ha-bridge.js';

// ── Expose HA actions to global scope (used by onclick attrs & regular script) ──
window.callHA        = callHA;
window.haToggle      = (e) => callHA('homeassistant','toggle', e);
window.haSwitchOn    = (e) => callHA('switch','turn_on', e);
window.haSwitchOff   = (e) => callHA('switch','turn_off', e);
window.haClimateTemp = (e,t)=> callHA('climate','set_temperature', e, {temperature:t});
window.haClimateMode = (e,m)=> callHA('climate','set_hvac_mode',   e, {hvac_mode:m});
window.haScript      = (e)  => callHA('script','turn_on', e);
window.haInputBtn    = (e)  => callHA('input_button','press', e);
window.haBoolToggle  = (e)  => callHA('input_boolean','toggle', e);
window.haAlarm       = (a, code='') => callHA('alarm_control_panel', a, 'alarm_control_panel.alarmo', {code});
window.haMediaCmd    = (e,a,x={}) => callHA('media_player', a, e, x);

// ── Connect ──
connect();

// ── Bind interactive elements after DOM ready ──
document.addEventListener('DOMContentLoaded', bindButtons);
if (document.readyState !== 'loading') bindButtons();

function bindButtons() {
  // Room card quick-buttons (stop propagation + call HA)
  const roomMap = {
    'r-living': { light:'switch.livingroomswitchgroup', ac:'climate.1e05049f' },
    'r-bed':    { light:'switch.masterroom_group_switch', ac:'climate.1e050116' },
    'r-kit':    { light:'switch.kitchen_group_switch' },
    'r-office': { light:'switch.office_group_swithces',  ac:'climate.1e51b62f' },
    'r-baby':   { light:'switch.baby_room' },
    'r-guest':  { light:'switch.guest_room_switches',    acOn:'script.guestac_on', acOff:'script.guestac' },
    'r-hall':   { light:'switch.hallway_switches' },
    'r-laundry':{ light:'switch.laundry_light_left',   ac:'climate.1e51bb2c' },
  };
  const _btnColorMap = { 'r-living':'rbtn-b','r-bed':'rbtn-p','r-kit':'rbtn-a','r-office':'rbtn-c','r-baby':'rbtn-r','r-guest':'rbtn-g','r-hall':'rbtn-b','r-laundry':'rbtn-r' };
  document.querySelectorAll('.room').forEach(room => {
    const cls = [...room.classList].find(c => roomMap[c]);
    if (!cls) return;
    const map = roomMap[cls];
    const colorCls = _btnColorMap[cls] ?? 'rbtn-b';
    const btns = room.querySelectorAll('.rbtn');
    btns.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const cur = btn.textContent;
        if (cur.includes('💡') && map.light) {
          const goingOn = cur.includes('Off');
          window.haToggle(map.light);
          btn.textContent = goingOn ? '💡 On' : '💡 Off';
          btn.className = `rbtn ${goingOn ? colorCls : 'rbtn-off'}`;
          if (goingOn) room.classList.remove('r-off');
        }
        if (cur.includes('❄️') && map.ac) {
          const acGoingOn = cur.includes('Off');
          window.haClimateMode(map.ac, acGoingOn ? 'cool' : 'off');
          btn.textContent = acGoingOn ? '❄️ Cool' : '❄️ Off';
          btn.className = `rbtn ${acGoingOn ? colorCls : 'rbtn-off'}`;
          if (acGoingOn) room.classList.remove('r-off');
        }
        if (cur.includes('❄️') && map.acOn)  window.haScript(map.acOn);
        if (cur.includes('📺'))              window.haToggle('media_player.lg_webos_tv_uj670v');
        if (cur.includes('🌙') && map.light) window.haToggle(map.light);
      };
    });
  });

  // All Off button
  const allOff = document.querySelector('.sh a[onclick]');
  if (allOff) allOff.onclick = () => callHA('homeassistant','turn_off','switch.all_switches_group');

  // Alarm arm/disarm buttons
  document.querySelectorAll('.alm-btn').forEach(btn => {
    if (btn.classList.contains('alm-away')) btn.onclick = () => window.haAlarm('alarm_arm_away');
    if (btn.classList.contains('alm-home')) btn.onclick = () => window.haAlarm('alarm_arm_home');
  });

  // Climate page AC +/- and mode buttons
  const acMap = [
    { cls:'ac-lr', entity:'climate.1e05049f' },
    { cls:'ac-bd', entity:'climate.1e050116' },
    { cls:'ac-of', entity:'climate.1e51b62f' },
    { cls:'ac-ln', entity:'climate.1e51bb2c' },
  ];
  acMap.forEach(({cls, entity}) => {
    const card = document.querySelector(`.${cls}`);
    if (!card) return;
    const btns = card.querySelectorAll('.acbtn');
    // order: − ❄️ 💨 +
    btns[0]?.addEventListener('click', (e) => { e.stopPropagation();
      const cur = parseInt(getState(entity)?.attributes?.temperature ?? 24);
      window.haClimateTemp(entity, cur - 1); });
    btns[1]?.addEventListener('click', (e) => { e.stopPropagation();
      window.haClimateMode(entity, 'cool'); });
    btns[2]?.addEventListener('click', (e) => { e.stopPropagation();
      window.haClimateMode(entity, 'fan_only'); });
    btns[3]?.addEventListener('click', (e) => { e.stopPropagation();
      const cur = parseInt(getState(entity)?.attributes?.temperature ?? 24);
      window.haClimateTemp(entity, cur + 1); });
  });

  // Guest Room AC scripts (climate page)
  const guestScripts = {
    'sbtn-g': 'script.guestac_on',  'sbtn-r': 'script.guestac',
    '19°C':   'script.guesac_temp19','20°C': 'script.guesac_temp20',
    '21°C':   'script.guesac_temp21','22°C': 'script.guesac_temp22',
    '23°C':   'script.guesac_temp23','▲ Up':'script.guestac_tempup',
    '▼ Down': 'script.guesac_tempdown',
  };
  document.querySelectorAll('#page-climate .sbtn').forEach(btn => {
    const txt = btn.textContent.trim();
    const sid = guestScripts[txt] || (btn.classList.contains('sbtn-g') ? guestScripts['sbtn-g'] : null)
                                  || (btn.classList.contains('sbtn-r') ? guestScripts['sbtn-r'] : null);
    if (sid) btn.onclick = () => window.haScript(sid);
  });

  // Quick Launch apps
  const appActions = {
    'nf':  () => window.haInputBtn('input_button.netflix'),
    'yt':  () => window.haInputBtn('input_button.youtube'),
    'sh':  () => window.haInputBtn('input_button.shahid'),
    'px':  () => window.haInputBtn('input_button.plex'),
    'st':  () => window.haInputBtn('input_button.stc_tv'),
    'mk':  () => window.haBoolToggle('input_boolean.radio_automation'),
  };
  document.querySelectorAll('.app').forEach(app => {
    const cls = [...app.classList].find(c => appActions[c]);
    if (cls) app.onclick = appActions[cls];
  });

  // Movie Light app
  document.querySelectorAll('.app').forEach(app => {
    if (app.querySelector('.an')?.textContent === 'Movie Light')
      app.onclick = () => window.haBoolToggle('input_boolean.movie_light');
  });

  // Media player controls
  bindMediaControls('media_player.lg_webos_tv_uj670v',  '.mc-tv');
  bindMediaControls('media_player.appletv',              '.mc-atv');
}

function bindMediaControls(entity, selector) {
  const card = document.querySelector(selector);
  if (!card) return;
  card.querySelectorAll('.mcc').forEach(btn => {
    const txt = btn.textContent;
    if (txt === '⏸' || txt === '⏯') btn.onclick = () => window.haMediaCmd(entity,'media_play_pause');
    if (txt === '⏮')                 btn.onclick = () => window.haMediaCmd(entity,'media_previous_track');
    if (txt === '⏭')                 btn.onclick = () => window.haMediaCmd(entity,'media_next_track');
    if (txt === '⏹')                 btn.onclick = () => window.haMediaCmd(entity,'media_stop');
    if (txt === '🔇')                btn.onclick = () => window.haMediaCmd(entity,'volume_mute',{is_volume_muted:true});
  });
}

// ── Live state updates ──
document.addEventListener('ha-states-updated', (ev) => {
  const s = ev.detail;

  // ── Greeting sub-text ──
  const _roomDefs = [
    { name:'Living Room', lights:['switch.livingroomswitchgroup','light.tv_led','light.yeelight_colorb_0x1b35f509'], ac:'climate.1e05049f' },
    { name:'Bedroom',     lights:['switch.masterroom_group_switch'], ac:'climate.1e050116' },
    { name:'Kitchen',     lights:['switch.kitchen_group_switch','light.wled_2'] },
    { name:'Office',      lights:['switch.office_group_swithces'], ac:'climate.1e51b62f' },
    { name:'Baby Room',   lights:['switch.baby_room'] },
    { name:'Guest Room',  lights:['switch.guest_room_switches'] },
    { name:'Hallway',     lights:['switch.hallway_switches'] },
    { name:'Laundry',     lights:['switch.laundry_light_left'], ac:'climate.1e51bb2c' },
  ];
  const _active = _roomDefs.filter(r => {
    const lit = r.lights?.some(e => s[e]?.state === 'on');
    const cool = r.ac ? ['cool','heat','fan_only'].includes(s[r.ac]?.state) : false;
    return lit || cool;
  });
  const _day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
  const _gSub = document.getElementById('greet-sub');
  if (_gSub) {
    if (!_active.length) {
      _gSub.textContent = `${_day} · All rooms off`;
    } else {
      const _names = _active.slice(0,3).map(r => r.name).join(', ');
      _gSub.textContent = `${_day} · ${_active.length} room${_active.length>1?'s':''} active · ${_names}${_active.length>3?` +${_active.length-3} more`:''}`;
    }
  }

  // ── Sync popup toggles if popup is open (fixes stale initial state) ──
  if (document.getElementById('popup')?.classList.contains('open')) {
    document.getElementById('pcontent')?.querySelectorAll('.tog[data-entity]').forEach(tog => {
      const ent = tog.dataset.entity;
      const tst = s[ent];
      if (!tst) return;
      const ton = tst.state !== 'off' && tst.state !== 'unavailable' && tst.state !== 'unknown';
      tog.classList.toggle('on', ton);
      tog.classList.toggle('off', !ton);
      const crow = tog.closest('.crow');
      if (crow) { const cv = crow.querySelector('.cval'); if (cv) cv.textContent = ton ? 'On' : 'Off'; }
    });
  }

  // ── Chips ──
  const raed = s['person.raed']?.state === 'home';
  const rola = s['person.rola']?.state === 'home';
  const presEl = document.querySelector('.chip-pur');
  if (presEl) presEl.textContent = `👤 Raed · ${raed?'Home':'Away'}  |  Rola · ${rola?'Home':'Away'}`;

  const wx = s['weather.forecast_home'];
  if (wx) {
    const temp = wx.attributes.temperature;
    const condRaw = wx.state.replace(/-/g,' ');
    const cond = condRaw.charAt(0).toUpperCase() + condRaw.slice(1);
    const icon = {'sunny':'☀️','clear-day':'☀️','clear-night':'🌙','cloudy':'☁️',
                  'partlycloudy':'⛅','fog':'🌫️','rainy':'🌧️','snowy':'❄️',
                  'windy':'🌬️','lightning':'⛈️'}[wx.state] ?? '🌡️';
    const wEl = document.querySelector('.chip-blu');
    if (wEl) wEl.textContent = `${icon} ${temp}°C · ${cond}`;
  }

  // ── Battery alerts (dynamic — threshold from input_number.threshold_battery) ──
  const battThreshold = parseFloat(s['input_number.threshold_battery']?.state ?? 40);
  updateBatteryDynamic(s, battThreshold);

  // ── Status row ──
  const lightEntities = ['switch.livingroomswitchgroup','switch.kitchen_group_switch',
    'switch.masterroom_group_switch','switch.office_group_swithces','switch.baby_room',
    'switch.guest_room_switches','switch.hallway_switches','switch.laundry_light_left',
    'switch.entrance_light_left','switch.entrance_light_right',
    'switch.collidor','switch.betweenroomslights_left','switch.betweenroomslights_right',
    'light.tv_led','light.wled_2','light.yeelight_colorb_0x1b35f509'];
  const lightsOn = lightEntities.filter(e => s[e]?.state === 'on').length;
  document.querySelectorAll('.sv').forEach((el,i) => {
    if (i===0) {
      el.textContent = lightsOn > 0 ? `${lightsOn} On` : 'Off';
      const ico = document.getElementById('sc-light-ico');
      if (ico) ico.textContent = lightsOn > 0 ? '💡' : '🔦';
    }
  });
  const lrAcTemp = s['climate.1e05049f']?.attributes?.current_temperature;
  if (lrAcTemp) document.querySelectorAll('.sv')[1].textContent = `${lrAcTemp}°C`;
  document.querySelectorAll('.sv')[2].textContent = raed ? 'Raed' : 'Away';
  const waterFilter = s['switch.athom_smart_plug_v3_50b5b0_power']?.state === 'on';
  if (document.querySelectorAll('.sv')[3])
    document.querySelectorAll('.sv')[3].textContent = waterFilter ? 'On' : 'Off';

  // ── Room cards ──
  updateRoom(s, 'r-living',
    ['switch.livingroomswitchgroup','light.tv_led','light.yeelight_colorb_0x1b35f509'],
    'climate.1e05049f');
  updateRoom(s, 'r-bed',
    ['switch.masterroom_group_switch','switch.master_lights_left','switch.master_lights1_left','switch.master_bath_left'],
    'climate.1e050116');
  updateRoom(s, 'r-kit',  ['switch.kitchen_group_switch','switch.kitchenlights_left','switch.kitchenlights_right','light.wled_2']);
  updateRoom(s, 'r-office',['switch.office_group_swithces','switch.office_light_left','switch.office_light_right'], 'climate.1e51b62f');
  updateRoom(s, 'r-baby', ['switch.baby_room','light.yeelight_colorb_0x1b35f509']);
  updateRoom(s, 'r-guest',['switch.guest_room_switches','switch.guest_light_left','switch.guest_light_right','switch.guest_light_center']);
  updateRoom(s, 'r-hall', ['switch.hallway_switches','switch.collidor','switch.betweenroomslights_left','switch.betweenroomslights_right','switch.entrance_light_left','switch.entrance_light_right']);
  updateRoom(s, 'r-laundry',['switch.laundry_light_left','switch.laundry_light_right'], 'climate.1e51bb2c');

  // ── Security sensors ──
  const sensorMap = {
    'MainDoorSensor Door':          { el: '🚪 Main Door',      entity: 'binary_sensor.maindoorsensor_contact',      okVal:'off', okLabel:'Closed', warnLabel:'Open' },
    'Entrance Motion':               { el: '🏃 Entrance Motion', entity: 'binary_sensor.entrance_motion_sensor_occupancy', okVal:'off', okLabel:'Clear', warnLabel:'Motion' },
    'Kitchen Motion':                { el: '🍳 Kitchen Motion',  entity: 'binary_sensor.kitchensensor_occupancy',     okVal:'off', okLabel:'Clear', warnLabel:'Motion' },
    'Storage Motion':                { el: '📦 Storage Motion',  entity: 'binary_sensor.storagemotionsensor_occupancy',okVal:'off', okLabel:'Clear', warnLabel:'Motion' },
  };
  document.querySelectorAll('.sensor').forEach(el => {
    const txt = el.textContent;
    for (const [,cfg] of Object.entries(sensorMap)) {
      if (txt.includes(cfg.el.replace(/^\S+\s/,''))) {
        const state = s[cfg.entity]?.state;
        const dot = el.querySelector('.dot');
        const isOk = state === cfg.okVal;
        if (dot) { dot.className = `dot ${isOk?'dok':'dwarn'}`; }
        el.childNodes[el.childNodes.length-1].textContent =
          ` ${cfg.el}: ${isOk ? cfg.okLabel : cfg.warnLabel}`;
      }
    }
  });

  // Smart lock
  const lockBatt = s['sensor.aqara_smart_lock_u200_battery']?.state ?? '?';
  const lockState = s['lock.aqara_smart_lock_u200']?.state ?? 'unknown';
  document.querySelectorAll('.sensor').forEach(el => {
    if (el.textContent.includes('Smart Lock'))
      el.childNodes[el.childNodes.length-1].textContent = ` 🔒 Smart Lock: ${lockState} · ${lockBatt}%`;
  });

  // NAS storage
  const nas = parseFloat(s['sensor.cloud_gateway_fiber_storage_utilization']?.state ?? 0);
  document.querySelectorAll('.sensor').forEach(el => {
    if (el.textContent.includes('NAS')) {
      const dot = el.querySelector('.dot');
      if (dot) dot.className = `dot ${nas > 90 ? 'dwarn' : 'dok'}`;
      el.childNodes[el.childNodes.length-1].textContent = ` 💾 NAS Storage: ${nas.toFixed(1)}%`;
    }
  });

  // Alarm chip
  const alarmState = s['alarm_control_panel.alarmo']?.state ?? 'unknown';
  const alarmMap = { disarmed:'✓ Disarmed', armed_away:'🚨 Armed Away', armed_home:'🏠 Armed Home', triggered:'🚨 TRIGGERED' };
  const almEl = document.querySelector('.alm-s');
  if (almEl) {
    almEl.textContent = alarmMap[alarmState] ?? alarmState;
    almEl.style.color = alarmState === 'disarmed' ? '#4ade80' : '#f87171';
  }
  const almChip = document.getElementById('alarm-chip') ?? document.querySelector('.chip-grn');
  if (almChip) almChip.textContent = alarmMap[alarmState] ? `🛡️ ${alarmMap[alarmState]}` : '🛡️ ...';

  // ── Climate page ──
  updateAcCard(s,'ac-lr','climate.1e05049f');
  updateAcCard(s,'ac-bd','climate.1e050116');
  updateAcCard(s,'ac-of','climate.1e51b62f');
  updateAcCard(s,'ac-ln','climate.1e51bb2c');

  // ── Media player ──
  updateMedia(s,'media_player.lg_webos_tv_uj670v','.mc-tv','LG TV · Living Room');
  updateMedia(s,'media_player.appletv','.mc-atv','Apple TV');

  // ── Radio ──
  const radio = s['input_boolean.radio_automation']?.state === 'on';
  syncRadio(radio);

  // ── Prayer times ──
  const prayers = [
    { name:'Fajr',    icon:'🌙', entity:'sensor.islamic_prayer_times_fajr_prayer' },
    { name:'Dhuhr',   icon:'☀️', entity:'sensor.islamic_prayer_times_dhuhr_prayer' },
    { name:'Asr',     icon:'🌤️', entity:'sensor.islamic_prayer_times_asr_prayer' },
    { name:'Maghrib', icon:'🌇', entity:'sensor.islamic_prayer_times_maghrib_prayer' },
    { name:'Isha',    icon:'🌃', entity:'sensor.islamic_prayer_times_isha_prayer' },
  ];
  const now = Date.now();
  let next = null;
  for (const p of prayers) {
    const t = new Date(s[p.entity]?.state).getTime();
    if (!isNaN(t) && t > now) { next = {...p, time: t}; break; }
  }
  if (!next) next = {...prayers[0], time: new Date(s[prayers[0].entity]?.state).getTime()};
  if (next) {
    const d = new Date(next.time);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const pEl = document.getElementById('prayer-chip');
    if (pEl) pEl.textContent = `🕌 ${next.name} · ${hh}:${mm}`;
  }
});

// ── Helpers ──

function updateBatteryDynamic(s, threshold) {
  const wrap = document.getElementById('notif-wrap');
  if (!wrap) return;

  // Collect all battery sensors below threshold
  const low = [];
  for (const [entityId, state] of Object.entries(s)) {
    if (!state || !entityId.startsWith('sensor.')) continue;
    const attrs = state.attributes ?? {};
    const isBatt = attrs.device_class === 'battery'
                || entityId.includes('_battery')
                || entityId.includes('_batt_');
    if (!isBatt) continue;
    const pct = parseFloat(state.state);
    if (isNaN(pct) || pct > threshold) continue;
    low.push({ entityId, pct, name: attrs.friendly_name ?? entityId.replace('sensor.','').replace(/_/g,' ') });
  }

  // Remove cards whose battery recovered above threshold
  wrap.querySelectorAll('.notif-card[data-entity]').forEach(card => {
    const entity = card.dataset.entity;
    const pct = parseFloat(s[entity]?.state);
    if (!isNaN(pct) && pct > threshold) {
      window._battDismissed?.delete(card.id);
      card.remove();
    }
  });

  // Add / update low-battery cards
  low.forEach(({ entityId, pct, name }) => {
    const cardId = 'nbatt_' + entityId.replace(/[^a-z0-9]/gi, '_');
    if ((window._battDismissed ?? new Set()).has(cardId)) return;
    const isCrit = pct <= Math.round(threshold * 0.5);
    const icon   = _battIcon(entityId, name);
    const level  = isCrit ? 'crit' : 'warn';

    let card = document.getElementById(cardId);
    if (card) {
      const fill  = card.querySelector('.batt-fill-crit, .batt-fill-warn');
      const label = card.querySelector('[class^="batt-pct"]');
      if (fill)  fill.style.width = pct + '%';
      if (label) label.textContent = pct + '%';
    } else {
      card = document.createElement('div');
      card.className = `notif-card notif-${level}`;
      card.id = cardId;
      card.dataset.entity = entityId;
      card.innerHTML = `
        <div class="notif-ico">${icon}</div>
        <div class="notif-body">
          <div class="notif-title">${name} — ${isCrit ? 'Critical' : 'Low'} Battery</div>
          <div class="notif-sub">${entityId}</div>
          <div class="notif-batt">
            <div class="batt-bar"><div class="batt-fill-${level}" style="width:${pct}%"></div></div>
            <div class="batt-pct batt-pct-${level}">${pct}%</div>
          </div>
        </div>
        <button class="notif-x" onclick="dismissNotif('${cardId}')">✕</button>`;
      wrap.appendChild(card);
    }
  });

  // Show/hide bar and update bell badge
  const bar = document.getElementById('notif-bar');
  if (bar) bar.style.display = wrap.children.length ? '' : 'none';
  if (typeof updateBell === 'function') updateBell();
}

function _battIcon(entityId, name) {
  const n = (entityId + ' ' + name).toLowerCase();
  if (n.includes('ipad') || n.includes('tablet'))                    return '📱';
  if (n.includes('iphone') || n.includes('phone') || n.includes('mobile')) return '📱';
  if (n.includes('brush') || n.includes('toothbrush'))               return '🪥';
  if (n.includes('lock'))                                             return '🔒';
  if (n.includes('door') || n.includes('contact'))                   return '🚪';
  if (n.includes('motion'))                                           return '🏃';
  if (n.includes('remote') || n.includes('button'))                  return '🎮';
  if (n.includes('watch'))                                            return '⌚';
  return '🔋';
}

function syncRadio(isOn) {
  ['radio-tog','radio-tog2'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('on', isOn);
    el.classList.toggle('off', !isOn);
  });
  const map = {
    'radio-title': isOn ? '📻 Radio — On'  : '📻 Radio — Off',
    'radio-tv-title': isOn ? 'Radio — On'  : 'Radio — Off',
    'radio-app-lbl': isOn ? 'Radio On'     : 'Radio Off',
  };
  for (const [id, txt] of Object.entries(map)) {
    const el = document.getElementById(id); if (el) el.textContent = txt;
  }
  const dot = document.getElementById('radio-app-dot');
  if (dot) dot.style.background = isOn ? '#4ade80' : '#6b7280';
}

function updateRoom(s, roomCls, lightEntities, acEntity) {
  const room = document.querySelector(`.room.${roomCls}`);
  if (!room) return;
  const lightsOn = lightEntities.some(e => s[e]?.state === 'on');
  const acState  = acEntity ? s[acEntity] : null;
  const acOn     = acState?.state === 'cool' || acState?.state === 'heat' || acState?.state === 'fan_only';
  const acTemp   = acState?.attributes?.temperature;

  // Toggle room off class (never remove the room's own class — it's needed for CSS + querySelector)
  room.classList.toggle('r-off', !lightsOn && !acOn);

  // Update badges
  const badges = room.querySelector('.rbadges');
  if (badges) {
    badges.querySelectorAll('.rb-on,.rb-off').forEach(b => {
      if (b.textContent.includes('💡')) {
        b.textContent = lightsOn ? '💡 On' : '💡 Off';
        b.className = `rb ${lightsOn ? 'rb-on' : 'rb-off'}`;
      }
    });
    if (acEntity) {
      const acMode = acState?.state;
      const acModeIcon = { cool:'❄️', heat:'🌡️', fan_only:'💨', dry:'💧' }[acMode ?? ''] ?? '❄️';
      // Use data-badge="ac" — stable across class changes (rb-ac ↔ rb-off)
      badges.querySelectorAll('[data-badge="ac"]').forEach(b => {
        if (acOn) {
          b.textContent = `${acModeIcon} ${acTemp ?? '--'}°`;
          b.className = 'rb rb-ac';
        } else {
          b.textContent = '❄️ Off';
          b.className = 'rb rb-off';
        }
      });
    }
  }

  // Update button labels + classes
  const _colorMap = { 'r-living':'rbtn-b','r-bed':'rbtn-p','r-kit':'rbtn-a','r-office':'rbtn-c','r-baby':'rbtn-r','r-guest':'rbtn-g','r-hall':'rbtn-b','r-laundry':'rbtn-r' };
  const _colorCls = _colorMap[roomCls] ?? 'rbtn-b';
  room.querySelectorAll('.rbtn').forEach(btn => {
    if (btn.textContent.includes('💡')) {
      btn.textContent = lightsOn ? '💡 On' : '💡 Off';
      btn.className = `rbtn ${lightsOn ? _colorCls : 'rbtn-off'}`;
    }
    if (btn.textContent.includes('❄️') && acEntity) {
      btn.textContent = acOn ? `❄️ ${acTemp ?? '--'}°` : '❄️ Off';
      btn.className = `rbtn ${acOn ? _colorCls : 'rbtn-off'}`;
    }
  });
}

function updateAcCard(s, cls, entity) {
  const card = document.querySelector(`.${cls}`);
  if (!card) return;
  const st = s[entity];
  if (!st) return;
  const mode  = st.state;
  const setTemp = st.attributes?.temperature ?? '--';
  const curTemp = st.attributes?.current_temperature ?? '--';
  const isOn  = mode !== 'off';
  const badge = card.querySelector('.badge');
  const tempEl = card.querySelector('.actemp');
  const subEl  = card.querySelector('.acsub');
  const modeLabel = { cool:'❄️ Cool', heat:'🌡️ Heat', fan_only:'💨 Fan', dry:'💧 Dry' }[mode] ?? mode;
  if (badge) {
    badge.textContent = isOn ? modeLabel : 'Off';
    badge.className   = isOn ? 'badge badge-c' : 'badge badge-off';
  }
  if (tempEl) tempEl.textContent = isOn ? `${setTemp}°` : '--°';
  if (subEl)  subEl.textContent  = isOn ? `Set ${setTemp}°C · Room ${curTemp}°C · ${st.attributes?.fan_mode ?? ''}` : 'Off';
}

function updateMedia(s, entity, selector, label) {
  const card = document.querySelector(selector);
  if (!card) return;
  const st = s[entity];
  if (!st) return;
  const playing = st.state === 'playing';
  const paused  = st.state === 'paused';
  const titleEl = card.querySelector('.mtit');
  const subEl   = card.querySelector('.msub');
  const playBtn = card.querySelector('.mcc.play');
  if (titleEl) titleEl.textContent = st.attributes?.media_title ?? (playing ? 'Playing' : st.state.charAt(0).toUpperCase()+st.state.slice(1));
  if (subEl) {
    const vol = Math.round((st.attributes?.volume_level ?? 0) * 100);
    subEl.textContent = `Vol ${vol}% · ${st.state}`;
  }
  if (playBtn) playBtn.textContent = playing ? '⏸' : '▶️';
  const volFill = card.querySelector('.volf');
  if (volFill) volFill.style.width = Math.round((st.attributes?.volume_level ?? 0.65) * 100) + '%';
}

// Override toggleRadio to call HA
window.toggleRadio = () => callHA('input_boolean','toggle','input_boolean.radio_automation');

// ── Popup HA binding ─────────────────────────────────────────────────────────

function bindPopupControls() {
  const pc = document.getElementById('pcontent');
  if (!pc) return;

  // 1. Toggle buttons with data-entity → call haToggle (or climate on/off)
  pc.querySelectorAll('.tog[data-entity]').forEach(tog => {
    const entity = tog.dataset.entity;
    const domain = entity.split('.')[0];
    const st = getState(entity);
    if (st) {
      const isOn = st.state !== 'off' && st.state !== 'unavailable' && st.state !== 'unknown';
      tog.classList.toggle('on', isOn);
      tog.classList.toggle('off', !isOn);
      const crow = tog.closest('.crow');
      if (crow) {
        const cval = crow.querySelector('.cval');
        if (cval && cval.textContent === '--') cval.textContent = isOn ? 'On' : 'Off';
      }
    }
    tog.onclick = (e) => {
      e.stopPropagation();
      const isOn = tog.classList.contains('on');
      tog.classList.toggle('on', !isOn);
      tog.classList.toggle('off', isOn);
      const crow = tog.closest('.crow');
      if (crow) { const cv = crow.querySelector('.cval'); if (cv) cv.textContent = isOn ? 'Off' : 'On'; }
      if (domain === 'climate') {
        window.haClimateMode(entity, isOn ? 'off' : 'cool');
      } else if (domain === 'automation') {
        callHA('automation', 'toggle', entity);
      } else {
        window.haToggle(entity);
      }
    };
  });

  // 2. Also bind .crow .tog buttons where .csub already has the entity ID
  pc.querySelectorAll('.crow').forEach(row => {
    const csub = row.querySelector('.csub');
    const tog  = row.querySelector('.tog');
    if (!csub || !tog || tog.dataset.entity) return;
    const txt = csub.textContent.trim();
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(txt)) return;
    const entity = txt;
    const st = getState(entity);
    if (st) {
      const isOn = st.state !== 'off' && st.state !== 'unavailable' && st.state !== 'unknown';
      tog.classList.toggle('on', isOn);
      tog.classList.toggle('off', !isOn);
      const cval = row.querySelector('.cval');
      if (cval && cval.textContent === '--') cval.textContent = isOn ? 'On' : 'Off';
    }
    tog.onclick = (e) => {
      e.stopPropagation();
      const isOn = tog.classList.contains('on');
      tog.classList.toggle('on', !isOn);
      tog.classList.toggle('off', isOn);
      const cv = row.querySelector('.cval'); if (cv) cv.textContent = isOn ? 'Off' : 'On';
      window.haToggle(entity);
    };
  });

  // 3. Script buttons with data-script attribute
  pc.querySelectorAll('[data-script]').forEach(btn => {
    const sid = btn.dataset.script;
    btn.onclick = () => window.haScript(sid);
  });

  // 4. AC switches (quiet, fresh air) with data-ac-sw attribute
  pc.querySelectorAll('[data-ac-sw]').forEach(btn => {
    const entity = btn.dataset.acSw;
    const st = getState(entity);
    if (st) {
      const isOn = st.state === 'on';
      if (isOn) btn.style.opacity = '1';
    }
    btn.onclick = () => window.haToggle(entity);
  });

  // 5. AC temperature sliders with data-ac attribute
  pc.querySelectorAll('.tslider[data-ac]').forEach(slider => {
    const entity = slider.dataset.ac;
    const st = getState(entity);
    const tbig = slider.closest('.ctrl')?.querySelector('.tbig');
    const csub = slider.closest('.ctrl')?.querySelector('.csub');
    if (st) {
      const setTemp = st.attributes?.temperature;
      const curTemp = st.attributes?.current_temperature;
      if (setTemp) {
        slider.value = setTemp;
        if (tbig) tbig.textContent = setTemp;
      }
      if (csub) {
        const mode = st.state;
        if (mode === 'off') {
          csub.textContent = 'Off';
        } else {
          csub.textContent = `Set ${setTemp}°C · Current ${curTemp ?? '--'}°C · ${mode}`;
        }
      }
      // Update AC mode scenes
      const scenes = slider.closest('.ctrl')?.querySelector('.scenes');
      if (scenes) _updateAcScenes(scenes, entity, st.state);
    }
    slider.removeEventListener('change', slider._acChange);
    slider._acChange = () => window.haClimateTemp(entity, parseInt(slider.value));
    slider.addEventListener('change', slider._acChange);
  });

  // 6. AC mode scene buttons next to data-ac slider
  pc.querySelectorAll('.ctrl').forEach(ctrl => {
    const slider = ctrl.querySelector('.tslider[data-ac]');
    if (!slider) return;
    const entity = slider.dataset.ac;
    const scenes = ctrl.querySelector('.scenes');
    if (!scenes) return;
    const modeMap = { '❄️ Cool':'cool', '💨 Fan':'fan_only', '🌡️ Heat':'heat', 'Off':'off', '⏹ Off':'off' };
    scenes.querySelectorAll('.scene').forEach(btn => {
      const mode = modeMap[btn.textContent.trim()];
      if (!mode) return;
      btn.onclick = () => {
        window.haClimateMode(entity, mode);
        _updateAcScenes(scenes, entity, mode);
      };
    });
  });

  // 7. Binary sensor status in popups
  pc.querySelectorAll('.crow').forEach(row => {
    const csub = row.querySelector('.csub');
    if (!csub) return;
    const txt = csub.textContent.trim();
    if (!txt.startsWith('binary_sensor.')) return;
    const st = getState(txt);
    if (!st) return;
    const cval = row.querySelector('.cval');
    const icon = row.querySelector('span[style*="font-size"]');
    const isOn = st.state === 'on';
    if (cval) { cval.textContent = isOn ? 'Active' : 'Clear'; cval.style.color = isOn ? '#f87171' : '#4ade80'; }
    if (icon) icon.textContent = isOn ? '🔴' : '✅';
  });
}

function _updateAcScenes(scenes, entity, mode) {
  const modeMap = { cool:'❄️ Cool', fan_only:'💨 Fan', heat:'🌡️ Heat', off:'Off' };
  const activeLabel = modeMap[mode] ?? 'Off';
  scenes.querySelectorAll('.scene').forEach(s => {
    const txt = s.textContent.trim();
    const isActive = txt === activeLabel || (mode === 'off' && (txt === 'Off' || txt === '⏹ Off'));
    s.classList.toggle('on', isActive);
    s.classList.toggle('off', !isActive);
  });
}

// Override pop() to run HA bindings after popup content is loaded
const _origPop = window.pop;
if (typeof _origPop === 'function') {
  window.pop = (id) => { _origPop(id); bindPopupControls(); };
}
