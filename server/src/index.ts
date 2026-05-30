import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  validateUserLogin, signToken, hashPassword,
  verifyToken,
} from './auth.js';
import { setupWsProxy } from './ws-proxy.js';
import { isConfigured, loadConfig, saveConfig, getConfig } from './config.js';
import { getLayout, saveLayout, loadLayout, DEFAULT_LAYOUT, type LayoutConfig } from './layout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const PUBLIC_DIR = join(__dirname, '../../public');

loadConfig();
loadLayout();

const hlsSessions = new Map<string, { haBase: string; expires: number }>();

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

// ── Setup & config ──────────────────────────────────────────────────────────

app.get('/api/setup-status', (_req, res) => res.json({ configured: isConfigured() }));

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
  if (isConfigured()) return res.status(403).json({ error: 'Already configured' });
  const { haUrl, haToken, password, dashboardName } = req.body as {
    haUrl?: string; haToken?: string; password?: string; dashboardName?: string;
  };
  if (!haUrl || !haToken || !password) return res.status(400).json({ error: 'haUrl, haToken and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { default: fetch } = await import('node-fetch');
    const test = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, { headers: { Authorization: `Bearer ${haToken}` } });
    if (!test.ok) return res.status(400).json({ error: 'HA token invalid or HA unreachable' });
  } catch { return res.status(400).json({ error: 'Could not connect to Home Assistant' }); }
  const passwordHash = await hashPassword(password);
  saveConfig({ haUrl: haUrl.replace(/\/$/, ''), haToken, passwordHash, dashboardName: dashboardName ?? 'Safrani Home' });
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Too many attempts' });
  const { username, password, duration } = req.body as { username?: string; password?: string; duration?: string };
  if (!password) return res.status(400).json({ error: 'Password required' });
  const payload = await validateUserLogin(username, password);
  if (!payload) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(payload, duration), role: payload.role });
});

app.post('/api/reconfigure', async (req, res) => {
  if (!isConfigured()) return res.status(400).json({ error: 'Not configured' });
  const { haUrl, haToken, newPassword } = req.body as { haUrl?: string; haToken?: string; newPassword?: string };
  if (!haUrl || !haToken || !newPassword) return res.status(400).json({ error: 'haUrl, haToken and newPassword are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { default: fetch } = await import('node-fetch');
    const test = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, { headers: { Authorization: `Bearer ${haToken}` } });
    if (!test.ok) return res.status(400).json({ error: 'HA token invalid' });
  } catch { return res.status(400).json({ error: 'Could not connect to Home Assistant' }); }
  const passwordHash = await hashPassword(newPassword);
  const prev = getConfig()!;
  saveConfig({ ...prev, haUrl: haUrl.replace(/\/$/, ''), haToken, passwordHash });
  res.json({ ok: true });
});

// ── Layout ──────────────────────────────────────────────────────────────────

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

// ── Users ───────────────────────────────────────────────────────────────────

app.get('/api/users', (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  res.json(getLayout().users.map(u => ({ id: u.id, name: u.name, role: u.role, allowedRooms: u.allowedRooms, allowedTabs: u.allowedTabs })));
});

app.post('/api/users', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const { name, password, role, allowedRooms, allowedTabs } = req.body as {
    name?: string; password?: string; role?: string; allowedRooms?: string[] | null; allowedTabs?: string[] | null;
  };
  if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const layout = getLayout();
  if (layout.users.find(u => u.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'User already exists' });
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
  layout.users.push({ id, name, passwordHash: await hashPassword(password), role: role === 'admin' ? 'admin' : 'user', allowedRooms: allowedRooms ?? null, allowedTabs: allowedTabs ?? null });
  saveLayout(layout); res.json({ ok: true, id });
});

app.patch('/api/users/:id', async (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const layout = getLayout();
  const user = layout.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { name, password, role, allowedRooms, allowedTabs } = req.body as { name?: string; password?: string; role?: string; allowedRooms?: string[] | null; allowedTabs?: string[] | null };
  if (name) user.name = name;
  if (password) { if (password.length < 8) return res.status(400).json({ error: 'Password too short' }); user.passwordHash = await hashPassword(password); }
  if (role === 'admin' || role === 'user') user.role = role;
  if (allowedRooms !== undefined) user.allowedRooms = allowedRooms;
  if (allowedTabs !== undefined) user.allowedTabs = allowedTabs;
  saveLayout(layout); res.json({ ok: true });
});

app.delete('/api/users/:id', (req, res) => {
  const payload = authToken(req);
  if (!payload || payload.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  const layout = getLayout();
  layout.users = layout.users.filter(u => u.id !== req.params.id);
  saveLayout(layout); res.json({ ok: true });
});

// ── HA Scanner ───────────────────────────────────────────────────────────────

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

// ── Camera proxy ─────────────────────────────────────────────────────────────

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
  const token = (req.headers.authorization?.slice(7) ?? req.query.token) as string;
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`${config.haUrl}/api/camera/stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.haToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId }),
    });
    if (!r.ok) return res.status(502).json({ error: `HA stream API returned ${r.status}` });
    const data = await r.json() as { url?: string };
    if (!data.url) return res.status(502).json({ error: 'No stream URL from HA' });
    const haBase = data.url.replace(/[^/]+$/, '');
    const sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    hlsSessions.set(sid, { haBase, expires: Date.now() + 7_200_000 });
    setTimeout(() => hlsSessions.delete(sid), 7_200_000);
    res.json({ url: `/api/hls/${sid}/index.m3u8?token=${encodeURIComponent(token)}` });
  } catch { res.status(502).json({ error: 'Could not create stream' }); }
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
    const r = await fetch(`${config.haUrl}${session.haBase}${file}`, { headers: { Authorization: `Bearer ${config.haToken}` } });
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

// ── Static ───────────────────────────────────────────────────────────────────

app.use(express.static(PUBLIC_DIR));
app.get('/login', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'login.html')));
app.get('/admin', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'admin.html')));
app.get('*', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });
setupWsProxy(wss);

server.listen(PORT, () => {
  console.log(`[ha-dashboard] Running on http://0.0.0.0:${PORT}`);
  if (!isConfigured()) console.log('[ha-dashboard] First run — open the app to complete setup');
});
