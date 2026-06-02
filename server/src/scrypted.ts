import { WebSocket } from 'ws';
import https from 'https';

const _tlsAgent = new https.Agent({ rejectUnauthorized: false });

export interface ScryptedDevice {
  id: string;
  name: string;
  interfaces: string[];
}

let _systemState: ScryptedDevice[] | null = null;
let _stateExpiry = 0;
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

export function invalidateScryptedCache() {
  _cachedToken = null; _tokenExpiry = 0;
  _systemState = null; _stateExpiry = 0;
}

export async function getScryptedToken(baseUrl: string, username: string, password: string): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    agent: _tlsAgent,
  } as Parameters<typeof fetch>[1]);
  if (!r.ok) throw new Error(`Scrypted login ${r.status}`);
  const data = await r.json() as { authorization?: string; queryToken?: { scryptedToken?: string } };
  const token = data.queryToken?.scryptedToken ?? data.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('No token in Scrypted login response');
  _cachedToken = token;
  _tokenExpiry = Date.now() + 23 * 3600_000;
  return token;
}

export async function getScryptedCameras(baseUrl: string, username: string, password: string): Promise<ScryptedDevice[]> {
  if (_systemState && _systemState.length > 0 && Date.now() < _stateExpiry) return _systemState;
  const token = await getScryptedToken(baseUrl, username, password);

  let rpcError = '';
  let cameras: ScryptedDevice[] = [];

  try {
    cameras = await getScryptedCamerasViaRpc(baseUrl, token);
    console.log(`[Scrypted] RPC returned ${cameras.length} camera(s)`);
  } catch (e) {
    rpcError = (e as Error).message;
    console.error('[Scrypted] RPC failed:', rpcError);
    try {
      cameras = await getScryptedCamerasViaScan(baseUrl, token);
      console.log(`[Scrypted] Rebroadcast scan returned ${cameras.length} camera(s)`);
    } catch (e2) {
      console.error('[Scrypted] Scan failed:', (e2 as Error).message);
    }
  }

  if (cameras.length > 0) {
    _systemState = cameras;
    _stateExpiry = Date.now() + 10 * 60_000;
    return cameras;
  }

  // Propagate the actual error so the admin panel can show what went wrong
  throw new Error(rpcError || 'Scrypted returned no camera devices');
}

// ── Debug: captures raw polling + WS messages (used by /api/scrypted/debug) ──

export interface ScryptedDebugInfo {
  token: string;
  pollStatus: number;
  pollBody: string;
  sid: string;
  wsMessages: string[];
  wsCloseCode: number;
  wsCloseReason: string;
  wsError: string;
}

export async function debugScryptedConnection(baseUrl: string, username: string, password: string): Promise<ScryptedDebugInfo> {
  const { default: fetch } = await import('node-fetch');
  const info: Partial<ScryptedDebugInfo> & Record<string, unknown> = {
    token: '', pollStatus: 0, pollBody: '', sid: '',
    wsMessages: [], wsCloseCode: 0, wsCloseReason: '', wsError: '',
  };

  const token = await getScryptedToken(baseUrl, username, password);
  info.token = token.slice(0, 12) + '…';

  const apiBase = `${baseUrl}/endpoint/@scrypted/core/engine.io/api/`;
  try {
    const r = await fetch(`${apiBase}?EIO=4&transport=polling&scryptedToken=${encodeURIComponent(token)}`,
      { agent: _tlsAgent } as Parameters<typeof fetch>[1]);
    info.pollStatus = r.status;
    const body = await r.text();
    info.pollBody = body.slice(0, 500);
    const stripped = body.replace(/^\d+:/, '');
    const m = stripped.match(/^0(\{[\s\S]*?\})/);
    if (m) info.sid = (JSON.parse(m[1]) as { sid?: string }).sid ?? '';
  } catch (e) {
    info.pollBody = 'FETCH ERROR: ' + (e as Error).message;
  }

  if (!info.sid) return info as ScryptedDebugInfo;

  const wsMessages: string[] = [];
  await new Promise<void>((resolve) => {
    const wsUrl = baseUrl.replace(/^https?/, m => m === 'https' ? 'wss' : 'ws') +
      `/endpoint/@scrypted/core/engine.io/api/?EIO=4&transport=websocket&sid=${encodeURIComponent(info.sid as string)}&scryptedToken=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    const timer = setTimeout(() => { ws.terminate(); resolve(); }, 12000);
    let upgraded = false;

    function rpcSend(msg: object) {
      const s = '4' + JSON.stringify(msg);
      wsMessages.push('SENT:' + s.slice(0, 300));
      ws.send(s);
    }

    const dbgIoId = Math.random().toString(36).slice(2, 10);
    const dbgGrId = Math.random().toString(36).slice(2, 10);

    const dbgIoProxyRef = {
      __remote_proxy_id: dbgIoId,
      __remote_proxy_finalizer_id: dbgIoId,
      __remote_constructor_name: 'Object',
      __remote_proxy_props: null,
      __remote_proxy_oneway_methods: ['setSystemState', 'notify', 'ioEvent', 'setNativeId'],
    };
    const dbgGrProxyRef = {
      __remote_proxy_id: dbgGrId,
      __remote_proxy_finalizer_id: dbgGrId,
      __remote_constructor_name: 'AsyncFunction',
      __remote_proxy_props: null,
    };

    const proxies = new Map<string, unknown>([
      [dbgGrId, async (...args: unknown[]) => {
        wsMessages.push('INFO:getRemote called, args=' + JSON.stringify(args).slice(0, 200));
        return dbgIoProxyRef;
      }],
      [dbgIoId, {
        setSystemState: (state: unknown) => {
          wsMessages.push('INFO:setSystemState called, keys=' + Object.keys(state as object).length);
          return null;
        },
        notify: () => null, ioEvent: () => null, getMediaManager: () => null, setNativeId: () => null,
      }],
    ]);

    ws.once('open', () => { wsMessages.push('OPEN'); ws.send('2probe'); wsMessages.push('SENT:2probe'); });
    ws.on('message', async (raw: Buffer) => {
      const s = raw.toString();
      wsMessages.push('RECV:' + s.slice(0, 400));
      if (s === '3probe' && !upgraded) { upgraded = true; ws.send('5'); wsMessages.push('SENT:5'); return; }
      if (s[0] === '2') { ws.send('3'); wsMessages.push('SENT:3'); return; }
      if (s[0] !== '4') return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(s.slice(1)) as Record<string, unknown>; } catch { return; }
      if (msg.type === 'param') {
        if (msg.param === 'getRemote') {
          // param:getRemote is a request — respond with our getRemote proxy ref
          rpcSend({ id: msg.id, type: 'result', result: dbgGrProxyRef });
        }
      } else if (msg.type === 'apply') {
        const proxy = proxies.get(msg.proxyId as string);
        if (!proxy) { rpcSend({ id: msg.id, type: 'result', result: null }); return; }
        const method = msg.method as string | undefined;
        const args = (msg.args as unknown[]) ?? [];
        try {
          let result: unknown;
          if (method && typeof (proxy as Record<string, unknown>)[method] === 'function') {
            result = await ((proxy as Record<string, unknown>)[method] as (...a: unknown[]) => unknown)(...args);
          } else if (typeof proxy === 'function') {
            result = await (proxy as (...a: unknown[]) => unknown)(...args);
          }
          rpcSend({ id: msg.id, type: 'result', result: result ?? null });
        } catch (e) {
          rpcSend({ id: msg.id, type: 'result', result: (e as Error).message, throw: true });
        }
      }
    });
    ws.on('error', (e) => { info.wsError = e.message; clearTimeout(timer); resolve(); });
    ws.on('close', (code: number, reason: Buffer) => {
      info.wsCloseCode = code;
      info.wsCloseReason = reason?.toString() || '';
      clearTimeout(timer);
      resolve();
    });
  });

  info.wsMessages = wsMessages;
  return info as ScryptedDebugInfo;
}

// ── Rebroadcast scan (fallback when RPC fails) ────────────────────────────────

export interface ScanResult {
  id: number;
  status: number;
  name: string;
}

export async function scanScryptedRebroadcast(baseUrl: string, token: string, maxId = 200): Promise<ScanResult[]> {
  const { default: fetch } = await import('node-fetch');

  const check = async (id: number): Promise<ScanResult | null> => {
    // Try scryptedToken as query param (standard), then as Authorization header
    const urls = [
      `${baseUrl}/endpoint/@scrypted/rebroadcast/public/${id}/stream.m3u8?scryptedToken=${encodeURIComponent(token)}`,
      `${baseUrl}/endpoint/@scrypted/rebroadcast/public/${id}/stream.m3u8?token=${encodeURIComponent(token)}`,
    ];
    for (const url of urls) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 4000);
        const r = await fetch(url, {
          method: 'HEAD',
          agent: _tlsAgent,
          signal: ac.signal,
          redirect: 'follow',
        } as Parameters<typeof fetch>[1]);
        clearTimeout(t);
        // 200 or any 2xx = valid stream; 302/3xx already followed by redirect:follow
        if (r.status >= 200 && r.status < 300) {
          let name = `Camera #${id}`;
          try {
            const nr = await fetch(
              `${baseUrl}/endpoint/@scrypted/core/api/deviceByName?scryptedToken=${encodeURIComponent(token)}&id=${id}`,
              { agent: _tlsAgent } as Parameters<typeof fetch>[1],
            );
            if (nr.ok) {
              const d = await nr.json() as { name?: string };
              if (d.name) name = d.name;
            }
          } catch {}
          return { id, status: r.status, name };
        }
      } catch { /* try next url */ }
    }
    return null;
  };

  const results = await Promise.allSettled(Array.from({ length: maxId }, (_, i) => check(i + 1)));
  return results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter((v): v is ScanResult => v !== null);
}

async function getScryptedCamerasViaScan(baseUrl: string, token: string): Promise<ScryptedDevice[]> {
  const found = await scanScryptedRebroadcast(baseUrl, token, 200);
  return found.map(s => ({ id: String(s.id), name: s.name, interfaces: ['VideoCamera'] }));
}

// ── engine.io RPC (polling → WebSocket upgrade, same as Scrypted SDK) ─────────

async function getScryptedCamerasViaRpc(baseUrl: string, token: string): Promise<ScryptedDevice[]> {
  const { default: fetch } = await import('node-fetch');

  const apiBase = `${baseUrl}/endpoint/@scrypted/core/engine.io/api/`;
  const pollRes = await fetch(
    `${apiBase}?EIO=4&transport=polling&scryptedToken=${encodeURIComponent(token)}`,
    { agent: _tlsAgent } as Parameters<typeof fetch>[1],
  );
  if (!pollRes.ok) throw new Error(`Scrypted polling failed: ${pollRes.status}`);

  const pollBody = await pollRes.text();
  console.log('[Scrypted] Polling response:', pollBody.slice(0, 200));
  const stripped = pollBody.replace(/^\d+:/, '');
  const openMatch = stripped.match(/^0(\{[\s\S]*?\})/);
  if (!openMatch) throw new Error(`No OPEN packet in polling response: ${pollBody.slice(0, 120)}`);
  const openData = JSON.parse(openMatch[1]) as { sid: string };
  if (!openData.sid) throw new Error('No sid in Scrypted OPEN packet');
  const sid = openData.sid;
  console.log('[Scrypted] Session ID:', sid);

  return new Promise((resolve, reject) => {
    const wsUrl =
      baseUrl.replace(/^https?/, m => m === 'https' ? 'wss' : 'ws') +
      `/endpoint/@scrypted/core/engine.io/api/?EIO=4&transport=websocket&sid=${encodeURIComponent(sid)}&scryptedToken=${encodeURIComponent(token)}`;
    console.log('[Scrypted] WS URL:', wsUrl.replace(/scryptedToken=[^&]+/, 'scryptedToken=…'));

    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    const deadline = setTimeout(() => { ws.terminate(); reject(new Error('RPC timeout after 30s')); }, 30_000);

    const ioId = Math.random().toString(36).slice(2, 10);
    const grId  = Math.random().toString(36).slice(2, 10);

    // Scrypted's current RPC wire format uses __remote_proxy_id (not { __type:'Object', id })
    const ioProxyRef = {
      __remote_proxy_id: ioId,
      __remote_proxy_finalizer_id: ioId,
      __remote_constructor_name: 'Object',
      __remote_proxy_props: null,
      __remote_proxy_oneway_methods: ['setSystemState', 'notify', 'ioEvent', 'setNativeId'],
    };
    const grProxyRef = {
      __remote_proxy_id: grId,
      __remote_proxy_finalizer_id: grId,
      __remote_constructor_name: 'AsyncFunction',
      __remote_proxy_props: null,
    };

    const proxies = new Map<string, object | ((...a: unknown[]) => unknown)>();
    let resolved = false;
    let upgraded = false;

    function done(cameras: ScryptedDevice[]) {
      if (resolved) return; resolved = true;
      clearTimeout(deadline); ws.close();
      resolve(cameras);
    }

    const ioProxy = {
      setSystemState: (raw: unknown) => {
        try {
          console.log('[Scrypted] setSystemState called, raw keys:', Object.keys(raw as object).length);
          const cameras = parseSystemState(raw as Record<string, Record<string, { value?: unknown }>>);
          console.log('[Scrypted] cameras after parse:', cameras.length);
          done(cameras);
        } catch (e) { reject(e); }
        return null;
      },
      notify: () => null, ioEvent: () => null, getMediaManager: () => null, setNativeId: () => null,
    };

    proxies.set(ioId, ioProxy);
    proxies.set(grId, async (..._args: unknown[]) => ioProxyRef);

    function send(msg: object) { ws.send('4' + JSON.stringify(msg)); }

    ws.once('open', () => { console.log('[Scrypted] WS open'); ws.send('2probe'); });

    ws.on('message', async (raw: Buffer) => {
      const str = raw.toString();
      if (str.length < 300) console.log('[Scrypted] MSG:', str);

      if (str === '3probe' && !upgraded) { ws.send('5'); upgraded = true; return; }
      if (str[0] === '2') { ws.send('3'); return; }
      if (str[0] !== '4') return;

      let msg: Record<string, unknown>;
      try { msg = JSON.parse(str.slice(1)) as Record<string, unknown>; } catch { return; }

      if (msg.type === 'param') {
        if (msg.param === 'getRemote') {
          // param:getRemote is a REQUEST — respond with our getRemote function proxy
          // using Scrypted's current __remote_proxy_id wire format
          send({ id: msg.id, type: 'result', result: grProxyRef });
        }
      } else if (msg.type === 'apply') {
        const proxyId = msg.proxyId as string;
        const method = msg.method as string | undefined;
        const args = (msg.args as unknown[]) ?? [];
        const proxy = proxies.get(proxyId);
        if (!proxy) { if (!msg.oneway) send({ id: msg.id, type: 'result', result: null }); return; }
        try {
          let result: unknown;
          if (method && typeof (proxy as Record<string, unknown>)[method] === 'function') {
            result = await ((proxy as Record<string, unknown>)[method] as (...a: unknown[]) => unknown)(...args);
          } else if (typeof proxy === 'function') {
            result = await (proxy as (...a: unknown[]) => unknown)(...args);
          }
          if (!msg.oneway) send({ id: msg.id, type: 'result', result: result ?? null });
        } catch (e) {
          if (!msg.oneway) send({ id: msg.id, type: 'result', result: (e as Error).message, throw: true });
        }
      }
    });

    ws.on('error', e => { console.error('[Scrypted] WS error:', e.message); clearTimeout(deadline); reject(e); });
    ws.on('close', (code: number, reason: Buffer) => {
      console.log('[Scrypted] WS closed code:', code, 'reason:', reason?.toString());
      if (!resolved) {
        clearTimeout(deadline);
        reject(new Error(`WS closed before system state (code:${code} reason:${reason?.toString() || 'none'})`));
      }
    });
  });
}

function parseSystemState(raw: Record<string, Record<string, { value?: unknown }>>): ScryptedDevice[] {
  return Object.entries(raw)
    .filter(([, props]) => {
      const ifaces = (props.interfaces?.value ?? []) as string[];
      return ifaces.some(i => ['VideoCamera', 'Camera', 'VideoRecorder', 'RTCSignalingChannel'].includes(i));
    })
    .map(([id, props]) => ({
      id,
      name: (props.name?.value as string) ?? id,
      interfaces: (props.interfaces?.value as string[]) ?? [],
    }));
}
