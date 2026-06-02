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
  if (_systemState && Date.now() < _stateExpiry) return _systemState;
  const token = await getScryptedToken(baseUrl, username, password);

  let cameras: ScryptedDevice[] = [];
  try {
    cameras = await getScryptedCamerasViaRpc(baseUrl, token);
  } catch {
    // RPC failed (limited user or protocol mismatch) — scan rebroadcast endpoints
    cameras = await getScryptedCamerasViaScan(baseUrl, token);
  }

  _systemState = cameras; _stateExpiry = Date.now() + 10 * 60_000;
  return cameras;
}

// Scan /endpoint/@scrypted/rebroadcast/public/{id}/stream.m3u8 for IDs 1–60
// Returns any device IDs that have an active HLS stream (no RPC required)
async function getScryptedCamerasViaScan(baseUrl: string, token: string): Promise<ScryptedDevice[]> {
  const { default: fetch } = await import('node-fetch');

  const check = async (id: number): Promise<ScryptedDevice | null> => {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const url = `${baseUrl}/endpoint/@scrypted/rebroadcast/public/${id}/stream.m3u8?scryptedToken=${encodeURIComponent(token)}`;
      const r = await fetch(url, { method: 'HEAD', agent: _tlsAgent, signal: ac.signal } as Parameters<typeof fetch>[1]);
      clearTimeout(t);
      if (r.status !== 200) return null;
      // Try to get device name via REST
      let name = `Camera #${id}`;
      try {
        const nr = await fetch(`${baseUrl}/device/${id}?scryptedToken=${encodeURIComponent(token)}`, { agent: _tlsAgent } as Parameters<typeof fetch>[1]);
        if (nr.ok) { const d = await nr.json() as { name?: string }; if (d.name) name = d.name; }
      } catch {}
      return { id: String(id), name, interfaces: ['VideoCamera'] };
    } catch { return null; }
  };

  const results = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => check(i + 1)));
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter((v): v is ScryptedDevice => v !== null);
}

// ── Raw engine.io RPC ─────────────────────────────────────────────────────────

function getScryptedCamerasViaRpc(baseUrl: string, token: string): Promise<ScryptedDevice[]> {
  return new Promise((resolve, reject) => {
    const wsUrl =
      baseUrl.replace(/^https?/, m => m === 'https' ? 'wss' : 'ws') +
      `/endpoint/@scrypted/core/engine.io/api/?EIO=4&transport=websocket&scryptedToken=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    const deadline = setTimeout(() => { ws.terminate(); reject(new Error('RPC timeout after 20s')); }, 20_000);

    const proxies = new Map<string, object | ((...a: unknown[]) => unknown)>();
    let resolved = false;

    function done(cameras: ScryptedDevice[]) {
      if (resolved) return; resolved = true;
      clearTimeout(deadline); ws.close();
      resolve(cameras);
    }

    // io object the Scrypted server calls after handshake
    proxies.set('__io__', {
      setSystemState: (raw: unknown) => {
        try {
          const cameras = parseSystemState(raw as Record<string, Record<string, { value?: unknown }>>);
          done(cameras);
        } catch (e) { reject(e); }
      },
      notify: () => null, ioEvent: () => null, getMediaManager: () => null, setNativeId: () => null,
    });

    // getRemote — server asks for this, then calls it with (systemManager, deviceManager, opts)
    proxies.set('__getRemote__', async () => ({ __type: 'Object', id: '__io__' }));

    function send(msg: object) { ws.send('4' + JSON.stringify(msg)); }

    ws.on('message', async (raw: Buffer) => {
      const str = raw.toString();
      if (str[0] === '2') { ws.send('3'); return; }
      if (str[0] !== '4') return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(str.slice(1)) as Record<string, unknown>; } catch { return; }

      if (msg.type === 'param') {
        // Server wants a value by name — give it our io proxy for both 'getRemote' and any other param
        const id = msg.param === 'getRemote' ? '__getRemote__' : '__io__';
        send({ id: msg.id, type: 'result', result: { __type: 'Object', id } });

      } else if (msg.type === 'apply') {
        const proxyId = msg.proxyId as string;
        const method = msg.method as string | undefined;
        const args = (msg.args as unknown[]) ?? [];
        const proxy = proxies.get(proxyId);
        if (!proxy) { send({ id: msg.id, type: 'result', result: null }); return; }
        try {
          let result: unknown;
          if (method && typeof (proxy as Record<string, unknown>)[method] === 'function') {
            result = await ((proxy as Record<string, unknown>)[method] as (...a: unknown[]) => unknown)(...args);
          } else if (typeof proxy === 'function') {
            result = await proxy(...args);
          }
          send({ id: msg.id, type: 'result', result: result ?? null });
        } catch (e) {
          send({ id: msg.id, type: 'result', result: (e as Error).message, throw: true });
        }
      }
    });

    ws.on('error', e => { clearTimeout(deadline); reject(e); });
    ws.on('close', () => { if (!resolved) { clearTimeout(deadline); reject(new Error('WS closed before system state')); } });
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
