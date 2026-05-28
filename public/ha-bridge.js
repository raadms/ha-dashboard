// Safrani Home · Secure HA Bridge
// Connects via the dashboard proxy — HA token lives on the server only

function getToken() {
  return sessionStorage.getItem('ha_dash_token');
}

let _ws    = null;
let _msgId = 1;
window.__haEntities = {};

function _dispatch() {
  document.dispatchEvent(
    new CustomEvent('ha-states-updated', { detail: window.__haEntities })
  );
}

export function connect() {
  try { _ws?.close(); } catch(_) {}

  const token = getToken();
  if (!token) { window.location.href = '/login'; return; }

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  _ws = new WebSocket(`${proto}://${location.host}/api/ws?token=${token}`);

  _ws.onopen = () => console.log('🔌 Connecting to Home Assistant…');

  _ws.onclose = (e) => {
    if (e.code === 4001 || e.code === 4003) {
      sessionStorage.removeItem('ha_dash_token');
      window.location.href = '/login';
      return;
    }
    console.warn(`⚠️ Disconnected [${e.code}] — retrying in 5 s`);
    setTimeout(connect, 5000);
  };

  _ws.onerror = (e) => console.error('❌ WebSocket error', e);

  _ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case 'auth_ok':
        console.log('✅ Connected to Home Assistant');
        _ws.send(JSON.stringify({ id: _msgId++, type: 'get_states' }));
        _ws.send(JSON.stringify({ id: _msgId++, type: 'subscribe_events', event_type: 'state_changed' }));
        break;
      case 'result':
        if (msg.success && Array.isArray(msg.result)) {
          msg.result.forEach(s => { window.__haEntities[s.entity_id] = s; });
          _dispatch();
        }
        break;
      case 'event':
        if (msg.event?.event_type === 'state_changed') {
          const ns = msg.event.data.new_state;
          if (ns) { window.__haEntities[ns.entity_id] = ns; _dispatch(); }
        }
        break;
    }
  };
}

export function callHA(domain, service, entity_id = null, extra = {}) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    console.warn('⚠️ Not connected to HA');
    return;
  }
  const service_data = entity_id ? { entity_id, ...extra } : extra;
  _ws.send(JSON.stringify({ id: _msgId++, type: 'call_service', domain, service, service_data }));
}

export const getState = (id)       => window.__haEntities[id] ?? null;
export const getAttr  = (id, attr) => window.__haEntities[id]?.attributes?.[attr] ?? null;
