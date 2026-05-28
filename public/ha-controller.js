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
window.haAlarm       = (a)  => callHA('alarm_control_panel', a, 'alarm_control_panel.alarmo', {code:''});
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
  document.querySelectorAll('.room').forEach(room => {
    const cls = [...room.classList].find(c => roomMap[c]);
    if (!cls) return;
    const map = roomMap[cls];
    const btns = room.querySelectorAll('.rbtn');
    btns.forEach(btn => {
      const txt = btn.textContent;
      btn.onclick = (e) => {
        e.stopPropagation();
        if (txt.includes('💡') && map.light)  window.haToggle(map.light);
        if (txt.includes('❄️') && map.ac)     window.haToggle(map.ac);
        if (txt.includes('❄️') && map.acOn)   window.haScript(map.acOn);
        if (txt.includes('📺'))               window.haToggle('media_player.lg_webos_tv_uj670v');
        if (txt.includes('🌙') && map.light)  window.haToggle(map.light);
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
    'mk':  () => window.boolToggle('input_boolean.radio_automation'),
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

  // ── Battery alerts ──
  updateBattery(s,'nf-ipad3','sensor.ipad_3_battery_level',20);
  updateBattery(s,'nf-brush','sensor.smart_series_9000_10000_0cf5_battery',15);
  updateBattery(s,'nf-rola1','sensor.rola1_battery_level',40);
  const notifBar = document.getElementById('notif-bar');
  const notifWrap = document.getElementById('notif-wrap');
  if (notifBar && notifWrap) notifBar.style.display = notifWrap.children.length ? '' : 'none';

  // ── Status row ──
  const lightEntities = ['switch.livingroomswitchgroup','switch.kitchen_group_switch',
    'switch.masterroom_group_switch','switch.office_group_swithces','switch.baby_room',
    'switch.guest_room_switches','switch.hallway_switches','switch.laundry_light_left',
    'switch.entrance_light_left','switch.entrance_light_right',
    'switch.collidor','switch.betweenroomslights_left','switch.betweenroomslights_right',
    'light.tv_led','light.wled_2','light.yeelight_colorb_0x1b35f509'];
  const lightsOn = lightEntities.filter(e => s[e]?.state === 'on').length;
  document.querySelectorAll('.sv').forEach((el,i) => {
    if (i===0) el.textContent = `${lightsOn} On`;
  });
  const lrAcTemp = s['climate.1e05049f']?.attributes?.current_temperature;
  if (lrAcTemp) document.querySelectorAll('.sv')[1].textContent = `${lrAcTemp}°C`;
  document.querySelectorAll('.sv')[2].textContent = raed ? 'Raed' : 'Away';
  const waterFilter = s['switch.athom_smart_plug_v3_50b5b0_power']?.state === 'on';
  if (document.querySelectorAll('.sv')[3])
    document.querySelectorAll('.sv')[3].textContent = waterFilter ? 'On' : 'Off';

  // ── Room cards ──
  updateRoom(s, 'r-living',
    ['switch.livingroomswitchgroup','light.tv_led','light.wled_2'],
    'climate.1e05049f');
  updateRoom(s, 'r-bed',
    ['switch.masterroom_group_switch','switch.master_lights_left','switch.master_lights1_left','switch.master_bath_left'],
    'climate.1e050116');
  updateRoom(s, 'r-kit',  ['switch.kitchen_group_switch','switch.kitchenlights_left','switch.kitchenlights_right']);
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
  const almChip = document.querySelector('.chip-grn');
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
function updateBattery(s, cardId, entityId, threshold) {
  const pct = parseInt(s[entityId]?.state ?? 101);
  const card = document.getElementById(cardId);
  if (!card) return;
  card.style.display = pct <= threshold ? 'flex' : 'none';
  const fill  = card.querySelector('[class^="batt-fill"]');
  const label = card.querySelector('[class^="batt-pct b"]');
  if (fill)  fill.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
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

  // Toggle room off class
  room.classList.toggle('r-off', !lightsOn && !acOn);
  [roomCls].forEach(c => room.classList.toggle(c, lightsOn || acOn));

  // Update badges
  const badges = room.querySelector('.rbadges');
  if (badges) {
    badges.querySelectorAll('.rb-on,.rb-off').forEach(b => {
      if (b.textContent.includes('💡')) {
        b.textContent = lightsOn ? '💡 On' : '💡 Off';
        b.className = `rb ${lightsOn ? 'rb-on' : 'rb-off'}`;
      }
    });
    if (acTemp) {
      badges.querySelectorAll('.rb-ac').forEach(b => { b.textContent = `❄️ ${acTemp}°`; });
    }
    if (acEntity && !acOn) {
      badges.querySelectorAll('.rb-ac').forEach(b => {
        b.textContent = '❄️ Off'; b.className = 'rb rb-off';
      });
    }
  }

  // Update button labels
  room.querySelectorAll('.rbtn').forEach(btn => {
    if (btn.textContent.includes('💡'))
      btn.textContent = lightsOn ? '💡 On' : '💡 Off';
    if (btn.textContent.includes('❄️') && acTemp)
      btn.textContent = acOn ? `❄️ ${acTemp}°` : '❄️ Off';
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
  if (badge) {
    badge.textContent = isOn ? `❄️ ${mode.charAt(0).toUpperCase()+mode.slice(1)}` : 'Off';
    badge.className   = isOn ? 'badge badge-c' : 'badge badge-off';
  }
  if (tempEl) tempEl.textContent = isOn ? `${setTemp}°` : '--°';
  if (subEl)  subEl.textContent  = isOn ? `Set ${setTemp}°C · ${st.attributes?.fan_mode ?? ''}` : 'Standby';
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
