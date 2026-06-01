import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import webpush from 'web-push';
import { validateUserLogin, signToken, hashPassword, verifyToken } from './auth.js';
import { setupWsProxy } from './ws-proxy.js';
import { isConfigured, loadConfig, saveConfig, getConfig, DATA_DIR } from './config.js';
import { getLayout, saveLayout, loadLayout, DEFAULT_LAYOUT, type LayoutConfig } from './layout.js';
import { getScryptedCameras, getScryptedToken, invalidateScryptedCache } from './scrypted.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const PUBLIC_DIR = join(__dirname, '../../public');

loadConfig();
loadLayout();

// ── Push subscriptions ────────────────────────────────────────────────────────
const SUBS_FILE = join(DATA_DIR, 'push_subscriptions.json');

type PushSub = { endpoint: string; keys: { auth: string; p256dh: string } };

function loadSubs(): PushSub[] {
  if (!existsSync(SUBS_FILE)) return [];
  try { return JSON.parse(readFileSync(SUBS_FILE, 'utf-8')) as PushSub[]; } catch { return []; }
}

function saveSubs(subs: PushSub[]): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), { mode: 0o600 });
}

type HlsSession =
  | { kind: 'ha';       haBase: string;  expires: number }
  | { kind: 'scrypted'; baseUrl: string; tokenParam: string; expires: number };

const hlsSessions = new Map<string, HlsSession>();

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, max = 10): boolean {
  const now = Date.now();
  const r = attempts.get(ip);
  if (!r || r.resetAt < now) { attempts.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (r.count >= max) return false;
  r.count++; return true;
}

function authToken(req: express.Request): ReturnType<typeof verifyToken> {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (req.query.token as string | undefined);
  return token ? verifyToken(token) : null;
}

// ── Setup & config ────────────────────────────────────────────────────────────

app.get('/api/setup-status', (_req, res) => {
  const configured = isConfigured();
  const hasUsers = getLayout().users.length > 0;
  res.json({ configured, hasUsers, needsSetup: !configured || !hasUsers });
});

app.get('/api/config', (_req, res) => {
  const config = getConfig();
  res.json({ name: config?.dashboardName ?? 'Safrani Home', configured: isConfigured() });
});

app.post('/api/test-ha', async (req, res) => {
  const { haUrl, haToken } = req.body as { haUrl?: string; haToken?: string };
  if (!haUrl || !haToken) return res.status(400).json({ error: 'Missing fields' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, { headers: { Authorization: `Bearer ${haToken}` } });
    if (r.ok) return res.json({ ok: true });
    return res.status(400).json({ error: `HA returned ${r.status}` });
  } catch { return res.status(400).json({ error: 'Could not connect to Home Assistant' }); }
});

app.post('/api/setup', async (req, res) => {
  // Block if users already exist
  const layout = getLayout();
  if (layout.users.length > 0) return res.status(403).json({ error: 'Already set up' });

  const { haUrl, haToken, dashboardName, name, username, password } = req.body as {
    haUrl?: string; haToken?: string; dashboardName?: string;
    name?: string; username?: string; password?: string;
  };

  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  // Configure HA only if not already done
  if (!isConfigured()) {
    if (!haUrl || !haToken) return res.status(400).json({ error: 'HA URL and token required' });
    try {
      const { default: fetch } = await import('node-fetch');
      const test = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, { headers: { Authorization: `Bearer ${haToken}` } });
      if (!test.ok) return res.status(400).json({ error: 'HA token invalid or HA unreachable' });
    } catch { return res.status(400).json({ error: 'Could not connect to Home Assistant' }); }
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    saveConfig({
      haUrl: haUrl.replace(/\/$/, ''), haToken,
      dashboardName: dashboardName ?? 'Safrani Home',
      vapidPublicKey: publicKey, vapidPrivateKey: privateKey,
      pushWebhookSecret: crypto.randomUUID(),
    });
  } else {
    // Already configured — ensure VAPID keys exist
    const prev = getConfig()!;
    if (!prev.vapidPublicKey) {
      const { publicKey, privateKey } = webpush.generateVAPIDKeys();
      saveConfig({ ...prev, vapidPublicKey: publicKey, vapidPrivateKey: privateKey, pushWebhookSecret: prev.pushWebhookSecret ?? crypto.randomUUID() });
    }
  }

  // Create the first admin user
  const uid = username.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
  layout.users.push({
    id: uid,
    name: name.trim(),
    username: username.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    role: 'admin',
    allowedRooms: null,
    allowedTabs: null,
  });
  saveLayout(layout);
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Too many attempts' });
  const { username, password, duration } = req.body as { username?: string; password?: string; duration?: string };
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const payload = await validateUserLogin(username, password);
  if (!payload) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(payload, duration), role: payload.role });
});

// Admin: reconfigure HA connection
app.post('/api/reconfigure', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const { haUrl, haToken, dashboardName } = req.body as { haUrl?: string; haToken?: string; dashboardName?: string };
  if (!haUrl || !haToken) return res.status(400).json({ error: 'haUrl and haToken required' });
  try {
    const { default: fetch } = await import('node-fetch');
    const test = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, { headers: { Authorization: `Bearer ${haToken}` } });
    if (!test.ok) return res.status(400).json({ error: 'HA token invalid' });
  } catch { return res.status(400).json({ error: 'Could not connect to Home Assistant' }); }
  const prev = getConfig()!;
  saveConfig({ ...prev, haUrl: haUrl.replace(/\/$/, ''), haToken, dashboardName: dashboardName ?? prev.dashboardName });
  res.json({ ok: true });
});

// ── Layout ────────────────────────────────────────────────────────────────────

app.get('/api/layout', (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const layout = getLayout();
  if (payload.role === 'admin') {
    return res.json({ ...layout, users: layout.users.map(u => ({ ...u, passwordHash: undefined })) });
  }
  const filtered: LayoutConfig = {
    ...layout,
    rooms: layout.rooms
      .filter(r => r.visible && (!payload.allowedRooms || payload.allowedRooms.includes(r.id)))
      .sort((a, b) => a.order - b.order),
    tabs: {
      home:     { ...layout.tabs.home,     visible: !payload.allowedTabs || payload.allowedTabs.includes('home') },
      security: { ...layout.tabs.security, visible: !payload.allowedTabs || payload.allowedTabs.includes('security') },
      climate:  { ...layout.tabs.climate,  visible: !payload.allowedTabs || payload.allowedTabs.includes('climate') },
      media:    { ...layout.tabs.media,    visible: !payload.allowedTabs || payload.allowedTabs.includes('media') },
    },
    users: [],
  };
  res.json(filtered);
});

app.put('/api/layout', (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  try { saveLayout(req.body as LayoutConfig); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Failed to save layout' }); }
});

app.get('/api/layout/default', (_req, res) => res.json(DEFAULT_LAYOUT));

// ── Users ─────────────────────────────────────────────────────────────────────

app.get('/api/users', (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  res.json(getLayout().users.map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role, allowedRooms: u.allowedRooms, allowedTabs: u.allowedTabs })));
});

app.post('/api/users', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const { name, username, password, role, allowedRooms, allowedTabs } = req.body as {
    name?: string; username?: string; password?: string; role?: string;
    allowedRooms?: string[] | null; allowedTabs?: string[] | null;
  };
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const layout = getLayout();
  const uname = username.trim().toLowerCase();
  if (layout.users.find(u => (u.username ?? u.name).toLowerCase() === uname)) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const id = uname.replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
  layout.users.push({
    id, name: name.trim(), username: uname,
    passwordHash: await hashPassword(password),
    role: role === 'admin' ? 'admin' : 'user',
    allowedRooms: allowedRooms ?? null,
    allowedTabs: allowedTabs ?? null,
  });
  saveLayout(layout);
  res.json({ ok: true, id });
});

app.patch('/api/users/:id', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const layout = getLayout();
  const user = layout.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { name, username, password, role, allowedRooms, allowedTabs } = req.body as {
    name?: string; username?: string; password?: string; role?: string;
    allowedRooms?: string[] | null; allowedTabs?: string[] | null;
  };
  if (name) user.name = name.trim();
  if (username) user.username = username.trim().toLowerCase();
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password too short' });
    user.passwordHash = await hashPassword(password);
  }
  if (role === 'admin' || role === 'user') user.role = role;
  if (allowedRooms !== undefined) user.allowedRooms = allowedRooms;
  if (allowedTabs !== undefined) user.allowedTabs = allowedTabs;
  saveLayout(layout);
  res.json({ ok: true });
});

app.delete('/api/users/:id', (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const layout = getLayout();
  const admins = layout.users.filter(u => u.role === 'admin');
  const target = layout.users.find(u => u.id === req.params.id);
  if (target?.role === 'admin' && admins.length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last admin account' });
  }
  layout.users = layout.users.filter(u => u.id !== req.params.id);
  saveLayout(layout);
  res.json({ ok: true });
});

// ── Push notifications ────────────────────────────────────────────────────────

app.get('/api/push/vapid-key', (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const config = getConfig();
  if (!config?.vapidPublicKey) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: config.vapidPublicKey });
});

app.get('/api/push/config', (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const config = getConfig();
  if (!config?.pushWebhookSecret) return res.status(503).json({ error: 'Push not configured' });
  const proto = (req.headers['x-forwarded-proto'] as string) ?? (req.secure ? 'https' : 'http');
  const host = req.headers.host ?? 'your-dashboard.domain';
  res.json({
    webhookUrl: `${proto}://${host}/api/push/doorbell?secret=${config.pushWebhookSecret}`,
    vapidPublicKey: config.vapidPublicKey,
  });
});

app.post('/api/push/subscribe', (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const sub = req.body as PushSub;
  if (!sub?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const subs = loadSubs();
  const idx = subs.findIndex(s => s.endpoint === sub.endpoint);
  if (idx >= 0) subs[idx] = sub; else subs.push(sub);
  saveSubs(subs);
  res.json({ ok: true });
});

// Webhook called by HA when doorbell rings
app.post('/api/push/doorbell', async (req, res) => {
  const config = getConfig();
  if (!config?.pushWebhookSecret || !config.vapidPublicKey || !config.vapidPrivateKey) {
    return res.status(503).json({ error: 'Push not configured' });
  }
  const secret = (req.query.secret as string) || (req.body as Record<string, string>)?.secret;
  if (secret !== config.pushWebhookSecret) return res.status(403).json({ error: 'Invalid secret' });

  const { title = '🔔 Doorbell', body = 'Someone is at the door', url = '/' } = (req.body as Record<string, string>) ?? {};

  webpush.setVapidDetails(
    'mailto:admin@safrani.co',
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );

  const subs = loadSubs();
  const pushPayload = JSON.stringify({ title, body, url });
  const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s as Parameters<typeof webpush.sendNotification>[0], pushPayload)));

  // Remove gone subscriptions (410 = subscription expired)
  const valid = subs.filter((_, i) => {
    const r = results[i];
    return r.status !== 'rejected' || (r.reason as { statusCode?: number })?.statusCode !== 410;
  });
  if (valid.length !== subs.length) saveSubs(valid);

  res.json({ ok: true, sent: results.filter(r => r.status === 'fulfilled').length, total: subs.length });
});

// ── HA Scanner ────────────────────────────────────────────────────────────────

app.get('/api/ha/entities', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const config = getConfig();
  if (!config) return res.status(503).json({ error: 'Not configured' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${config.haUrl}/api/states`, { headers: { Authorization: `Bearer ${config.haToken}` } });
    if (!r.ok) return res.status(502).json({ error: `HA returned ${r.status}` });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'HA unreachable' }); }
});

// ── Camera proxy ──────────────────────────────────────────────────────────────

app.get('/api/camera/:entityId', async (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).send('Unauthorized');
  const entityId = req.params.entityId;
  if (!/^camera\.[a-z0-9_]+$/.test(entityId)) return res.status(400).send('Invalid entity');
  const config = getConfig();
  if (!config) return res.status(503).send('Not configured');
  try {
    const { default: fetch } = await import('node-fetch');
    const upstream = await fetch(`${config.haUrl}/api/camera_proxy/${entityId}`, { headers: { Authorization: `Bearer ${config.haToken}` } });
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    upstream.body?.pipe(res);
  } catch { res.status(502).send('Camera unavailable'); }
});

app.get('/api/camera/:entityId/stream', async (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const entityId = req.params.entityId;
  if (!/^camera\.[a-z0-9_]+$/.test(entityId)) return res.status(400).json({ error: 'Invalid entity' });
  const config = getConfig();
  if (!config) return res.status(503).json({ error: 'Not configured' });

  // Check if camera has a direct stream URL configured (e.g., Scrypted)
  const layout = getLayout();
  const cam = layout.security.cameras.find(c => c.entity === entityId);
  if (cam?.streamUrl && cam.streamType === 'hls') {
    return res.json({ url: cam.streamUrl, type: 'hls-direct' });
  }

  const token = (req.headers.authorization?.slice(7) ?? req.query.token) as string;
  try {
    // Use HA WebSocket camera/stream (works in modern HA; REST /api/camera/stream is removed)
    const streamUrl = await getHaStreamUrl(entityId);
    if (!streamUrl) return res.status(502).json({ error: 'No stream URL from HA' });
    const haBase = streamUrl.replace(/[^/]+$/, '');
    const sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    hlsSessions.set(sid, { kind: 'ha', haBase, expires: Date.now() + 7_200_000 });
    setTimeout(() => hlsSessions.delete(sid), 7_200_000);
    res.json({ url: `/api/hls/${sid}/index.m3u8?token=${encodeURIComponent(token)}`, type: 'hls-proxied' });
  } catch (e) {
    console.error('[HLS stream]', (e as Error).message);
    res.status(502).json({ error: 'Could not create stream' });
  }
});

app.get('/api/hls/:sid/:file', async (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).send('Unauthorized');
  const { sid, file } = req.params;
  if (!/^[a-z0-9]+$/.test(sid) || !/^[\w.\-]+$/.test(file)) return res.status(400).send('Invalid');
  const session = hlsSessions.get(sid);
  if (!session || session.expires < Date.now()) return res.status(404).send('Stream expired');
  const config = getConfig();
  if (!config) return res.status(503).send('Not configured');
  const token = (req.headers.authorization?.slice(7) ?? req.query.token) as string;
  try {
    const { default: fetch } = await import('node-fetch');
    let upstreamUrl: string;
    let headers: Record<string, string>;
    if (session.kind === 'ha') {
      upstreamUrl = `${config.haUrl}${session.haBase}${file}`;
      headers = { Authorization: `Bearer ${config.haToken}` };
    } else {
      upstreamUrl = `${session.baseUrl}${file}?${session.tokenParam}`;
      headers = {};
    }
    const r = await fetch(upstreamUrl, { headers });
    if (!r.ok) return res.status(r.status).send('Upstream error');
    const ct = r.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (ct.includes('mpegurl') || file.endsWith('.m3u8')) {
      const text = await r.text();
      const rewritten = text.replace(/^([^#\n][^\n]*)$/gm, (line) => {
        const fname = line.split('?')[0].split('/').pop() ?? line;
        return `/api/hls/${sid}/${fname}?token=${encodeURIComponent(token)}`;
      });
      res.send(rewritten);
    } else { r.body?.pipe(res); }
  } catch { res.status(502).send('Segment error'); }
});

// ── Camera streaming helpers ──────────────────────────────────────────────────

async function haWebSocketCall<T>(payload: Record<string, unknown>): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error('Not configured');
  const wsUrl = config.haUrl.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws') + '/api/websocket';
  return new Promise((resolve, reject) => {
    const ws = new WsClient(wsUrl, { rejectUnauthorized: false });
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error('HA WS timeout')); }, 15_000);
    let sent = false;
    ws.on('error', e => { clearTimeout(timeout); reject(e); });
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString()) as { type: string; success?: boolean; result?: T; error?: { message?: string } };
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: config.haToken }));
      } else if (msg.type === 'auth_ok' && !sent) {
        sent = true;
        ws.send(JSON.stringify({ id: 1, ...payload }));
      } else if (msg.type === 'result') {
        clearTimeout(timeout); ws.close();
        if (msg.success) resolve(msg.result as T);
        else reject(new Error(msg.error?.message ?? 'HA WS call failed'));
      }
    });
  });
}

async function getHaStreamUrl(entityId: string): Promise<string | null> {
  try {
    const r = await haWebSocketCall<{ url?: string }>({ type: 'camera/stream', entity_id: entityId, format: 'hls' });
    return r?.url ?? null;
  } catch { return null; }
}

async function getHaWebRTCAnswer(entityId: string, sdpOffer: string): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error('Not configured');
  const wsUrl = config.haUrl.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws') + '/api/websocket';

  return new Promise((resolve, reject) => {
    const ws = new WsClient(wsUrl, { rejectUnauthorized: false });
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error('WebRTC signaling timeout')); }, 20_000);
    let msgId = 1;

    ws.on('error', e => { clearTimeout(timeout); reject(e); });

    ws.on('message', raw => {
      type HaMsg = { type: string; success?: boolean; result?: Record<string, unknown>; error?: { message?: string } };
      const msg = JSON.parse(raw.toString()) as HaMsg;

      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: config.haToken }));

      } else if (msg.type === 'auth_ok') {
        ws.send(JSON.stringify({ id: msgId++, type: 'camera/webrtc_offer', entity_id: entityId, offer: sdpOffer }));

      } else if (msg.type === 'result') {
        if (msg.success) {
          // HA returns answer at result.answer or result.sdp
          const r = msg.result ?? {};
          const answer = (r['answer'] ?? r['sdp'] ?? r['answer_sdp']) as string | undefined;
          if (answer) { clearTimeout(timeout); ws.close(); resolve(answer); }
          // else: answer may arrive in a follow-up event — keep connection open
        } else {
          clearTimeout(timeout); ws.close();
          reject(new Error(msg.error?.message ?? 'WebRTC offer failed'));
        }

      } else if (msg.type === 'event') {
        // Some HA versions send the answer via event (e.g. go2rtc trickle ICE)
        const ev = (msg as Record<string, unknown>)['event'] as Record<string, unknown> | undefined;
        const data = (ev?.['data'] ?? ev) as Record<string, unknown> | undefined;
        const answer = (data?.['answer'] ?? data?.['sdp'] ?? data?.['answer_sdp']) as string | undefined;
        if (answer) { clearTimeout(timeout); ws.close(); resolve(answer); }
      }
    });
  });
}

// ── Scrypted streaming ────────────────────────────────────────────────────────

// List Scrypted cameras (admin helper — use to find device IDs)
app.get('/api/scrypted/cameras', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const config = getConfig();
  if (!config?.scryptedUrl || !config.scryptedUsername || !config.scryptedPassword) {
    return res.status(503).json({ error: 'Scrypted not configured' });
  }
  try {
    const cameras = await getScryptedCameras(config.scryptedUrl, config.scryptedUsername, config.scryptedPassword);
    res.json(cameras);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Scrypted HLS stream — auto-discovers device ID by matching camera label
app.get('/api/camera/:entityId/scrypted-stream', async (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const entityId = req.params.entityId;
  if (!/^camera\.[a-z0-9_]+$/.test(entityId)) return res.status(400).json({ error: 'Invalid entity' });
  const config = getConfig();
  if (!config?.scryptedUrl || !config.scryptedUsername || !config.scryptedPassword) {
    return res.status(503).json({ error: 'Scrypted not configured' });
  }

  try {
    const layout = getLayout();
    const cam = layout.security.cameras.find(c => c.entity === entityId);
    const camLabel = cam?.label ?? '';

    // Use manually-set scryptedId if available, otherwise auto-discover by name match
    let deviceId = cam?.scryptedId ?? '';
    if (!deviceId) {
      const cameras = await getScryptedCameras(config.scryptedUrl, config.scryptedUsername, config.scryptedPassword);
      // Match by exact label, then by partial name
      const match =
        cameras.find(d => d.name.toLowerCase() === camLabel.toLowerCase()) ??
        cameras.find(d => d.name.toLowerCase().includes(camLabel.toLowerCase().split(' ')[0])) ??
        cameras.find(d => camLabel.toLowerCase().includes(d.name.toLowerCase().split(' ')[0])) ??
        cameras[0]; // last resort: first camera
      if (!match) return res.status(404).json({ error: 'No Scrypted camera found' });
      deviceId = match.id;
    }

    const token = await getScryptedToken(config.scryptedUrl, config.scryptedUsername, config.scryptedPassword);
    const dashToken = (req.headers.authorization?.slice(7) ?? req.query.token) as string;
    const tokenParam = `scryptedToken=${encodeURIComponent(token)}`;
    const base = `${config.scryptedUrl}/endpoint/@scrypted/rebroadcast/public/${deviceId}/`;
    const sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    hlsSessions.set(sid, { kind: 'scrypted', baseUrl: base, tokenParam, expires: Date.now() + 7_200_000 });
    setTimeout(() => hlsSessions.delete(sid), 7_200_000);
    return res.json({ url: `/api/hls/${sid}/stream.m3u8?token=${encodeURIComponent(dashToken)}`, type: 'hls-scrypted' });
  } catch (e) {
    console.error('[Scrypted stream]', (e as Error).message);
    return res.status(502).json({ error: (e as Error).message });
  }
});

// Admin: save Scrypted credentials
app.post('/api/scrypted/config', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const { scryptedUrl, scryptedUsername, scryptedPassword } = req.body as {
    scryptedUrl?: string; scryptedUsername?: string; scryptedPassword?: string;
  };
  if (!scryptedUrl || !scryptedUsername || !scryptedPassword) {
    return res.status(400).json({ error: 'scryptedUrl, scryptedUsername and scryptedPassword required' });
  }
  // Verify credentials
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${scryptedUrl.replace(/\/$/, '')}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: scryptedUsername, password: scryptedPassword }),
    });
    if (!r.ok) return res.status(400).json({ error: `Scrypted login failed (${r.status})` });
    const data = await r.json() as { authorization?: string; queryToken?: { scryptedToken?: string } };
    if (!data.queryToken?.scryptedToken && !data.authorization) {
      return res.status(400).json({ error: 'Scrypted did not return a token' });
    }
  } catch { return res.status(400).json({ error: 'Could not connect to Scrypted' }); }

  const prev = getConfig()!;
  saveConfig({ ...prev, scryptedUrl: scryptedUrl.replace(/\/$/, ''), scryptedUsername, scryptedPassword });
  invalidateScryptedCache();
  res.json({ ok: true });
});

app.post('/api/camera/:entityId/webrtc-offer', async (req, res) => {
  const payload = authToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const entityId = req.params.entityId;
  if (!/^camera\.[a-z0-9_]+$/.test(entityId)) return res.status(400).json({ error: 'Invalid entity' });
  const { offer } = req.body as { offer?: string };
  if (!offer) return res.status(400).json({ error: 'offer required' });
  try {
    const answer = await getHaWebRTCAnswer(entityId, offer);
    res.json({ answer });
  } catch (e) {
    console.error('[WebRTC]', (e as Error).message);
    res.status(502).json({ error: (e as Error).message });
  }
});

// ── Setup redirect + static ───────────────────────────────────────────────────

// Redirect to /setup if no users registered yet (first-run or migration)
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/') || req.path === '/setup' || req.path === '/login') return next();
  const layout = getLayout();
  if (layout.users.length === 0) return res.redirect('/setup');
  next();
});

app.get('/setup', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'setup.html')));
app.use(express.static(PUBLIC_DIR));
app.get('/login', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'login.html')));
app.get('/admin', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'admin.html')));
app.get('*', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });
setupWsProxy(wss);

server.listen(PORT, () => {
  console.log(`[ha-dashboard] Running on http://0.0.0.0:${PORT}`);
  const layout = getLayout();
  if (layout.users.length === 0) console.log('[ha-dashboard] First run — open the app to complete setup');
});
