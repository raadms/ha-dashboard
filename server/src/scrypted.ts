import { WebSocket } from 'ws';
import https from 'https';

const _tlsAgent = new https.Agent({ rejectUnauthorized: false });

// Minimal Scrypted engine.io RPC client — just enough to get system state
// and derive rebroadcast HLS URLs for cameras.

export interface ScryptedDevice {
  id: string;
  name: string;
  interfaces: string[];
}

interface RpcMsg {
  id?: string;
  type: string;
  param?: string;
  proxyId?: string;
  method?: string | null;
  args?: unknown[];
  result?: unknown;
  throw?: boolean;
}

let _systemState: ScryptedDevice[] | null = null;
let _stateExpiry = 0;
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

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
  if (!token) throw new Error('No token in Scrypted response');
  _cachedToken = token;
  _tokenExpiry = Date.now() + 23 * 3600_000;
  return token;
}

export function invalidateScryptedCache() {
  _cachedToken = null;
  _tokenExpiry = 0;
  _systemState = null;
  _stateExpiry = 0;
}

export async function getScryptedCameras(baseUrl: string, username: string, password: string): Promise<ScryptedDevice[]> {
  if (_systemState && Date.now() < _stateExpiry) return _systemState;
  const token = await getScryptedToken(baseUrl, username, password);
  const state = await fetchScryptedSystemState(baseUrl, token);
  _systemState = state;
  _stateExpiry = Date.now() + 10 * 60_000; // re-discover every 10 min
  return state;
}

function fetchScryptedSystemState(baseUrl: string, token: string): Promise<ScryptedDevice[]> {
  return new Promise((resolve, reject) => {
    const wsUrl =
      baseUrl.replace(/^https?/, m => (m === 'https' ? 'wss' : 'ws')) +
      `/endpoint/@scrypted/core/engine.io/api/?EIO=4&transport=websocket&scryptedToken=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    const deadline = setTimeout(() => { ws.terminate(); reject(new Error('Scrypted RPC timeout')); }, 20_000);

    // Local proxy registry: proxyId → function or object-with-methods
    const proxies = new Map<string, unknown>();

    // The io object the server calls after getRemote completes
    const IO_ID = '__io__';
    proxies.set(IO_ID, {
      setSystemState: (rawState: unknown) => {
        clearTimeout(deadline);
        ws.close();
        try {
          const devices = parseSystemState(rawState as Record<string, Record<string, { value?: unknown }>>);
          resolve(devices);
        } catch (e) { reject(e); }
      },
      notify: () => null,
      ioEvent: () => null,
      getMediaManager: () => null,
      setNativeId: () => null,
    });

    // getRemote: called by the server with (systemManager, deviceManager, opts)
    const GR_ID = '__getRemote__';
    proxies.set(GR_ID, async () => {
      // Return the io object proxy reference
      return { __type: 'Object', id: IO_ID };
    });

    function send(msg: RpcMsg) {
      ws.send('4' + JSON.stringify(msg));
    }

    ws.on('message', async (raw: Buffer) => {
      const str = raw.toString();
      // EIO ping → pong
      if (str[0] === '2') { ws.send('3'); return; }
      // Only handle EIO message packets
      if (str[0] !== '4') return;

      let msg: RpcMsg;
      try { msg = JSON.parse(str.slice(1)) as RpcMsg; } catch { return; }

      if (msg.type === 'param' && msg.param === 'getRemote') {
        // Server wants our getRemote function
        send({ id: msg.id, type: 'result', result: { __type: 'Object', id: GR_ID } });

      } else if (msg.type === 'apply') {
        const { id, proxyId, method, args = [] } = msg;
        if (!proxyId) return;
        const proxy = proxies.get(proxyId);
        if (proxy === undefined) {
          send({ id, type: 'result', result: null });
          return;
        }
        try {
          let result: unknown;
          if (method) {
            const fn = (proxy as Record<string, unknown>)[method];
            result = typeof fn === 'function'
              ? await (fn as (...a: unknown[]) => unknown)(...deserializeArgs(args))
              : null;
          } else {
            result = typeof proxy === 'function'
              ? await (proxy as (...a: unknown[]) => unknown)(...deserializeArgs(args))
              : null;
          }
          send({ id, type: 'result', result: serializeResult(result) });
        } catch (e) {
          send({ id, type: 'result', result: (e as Error).message, throw: true });
        }
      }
    });

    ws.on('error', e => { clearTimeout(deadline); reject(e); });
    ws.on('close', (_code, reason) => {
      clearTimeout(deadline);
      // Only reject if we haven't already resolved
      if (!_systemState) reject(new Error(`Scrypted WS closed: ${reason}`));
    });
  });
}

function deserializeArgs(args: unknown[]): unknown[] {
  return args.map(a => {
    if (a && typeof a === 'object') {
      const o = a as Record<string, unknown>;
      if (o.__type === 'Object') return { _remoteProxy: o.id }; // opaque placeholder
    }
    return a;
  });
}

function serializeResult(v: unknown): unknown {
  if (v && typeof v === 'object' && '__type' in (v as object)) return v;
  return v;
}

function parseSystemState(raw: Record<string, Record<string, { value?: unknown }>>): ScryptedDevice[] {
  const out: ScryptedDevice[] = [];
  for (const [id, props] of Object.entries(raw)) {
    const interfaces = (props.interfaces?.value ?? []) as string[];
    const name = (props.name?.value ?? id) as string;
    if (interfaces.includes('VideoCamera')) {
      out.push({ id, name, interfaces });
    }
  }
  return out;
}
