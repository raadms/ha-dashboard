import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validatePassword, signToken, hashPassword } from './auth.js';
import { setupWsProxy } from './ws-proxy.js';
import { isConfigured, loadConfig, saveConfig, getConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const PUBLIC_DIR = join(__dirname, '../../public');

loadConfig();

const app = express();
app.use(express.json({ limit: '10kb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, max = 10): boolean {
  const now = Date.now();
  const r = attempts.get(ip);
  if (!r || r.resetAt < now) { attempts.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (r.count >= max) return false;
  r.count++;
  return true;
}

// ── API routes ──────────────────────────────────────────────────────────────

app.get('/api/setup-status', (_req, res) => {
  res.json({ configured: isConfigured() });
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
    const r = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, {
      headers: { Authorization: `Bearer ${haToken}` },
    });
    if (r.ok) return res.json({ ok: true });
    return res.status(400).json({ error: `HA returned ${r.status} — check URL and token` });
  } catch {
    return res.status(400).json({ error: 'Could not connect to Home Assistant' });
  }
});

app.post('/api/setup', async (req, res) => {
  if (isConfigured()) {
    return res.status(403).json({ error: 'Already configured' });
  }
  const { haUrl, haToken, password, dashboardName } = req.body as {
    haUrl?: string; haToken?: string; password?: string; dashboardName?: string;
  };
  if (!haUrl || !haToken || !password) {
    return res.status(400).json({ error: 'haUrl, haToken and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const { default: fetch } = await import('node-fetch');
    const test = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, {
      headers: { Authorization: `Bearer ${haToken}` },
    });
    if (!test.ok) return res.status(400).json({ error: 'HA token invalid or HA unreachable' });
  } catch {
    return res.status(400).json({ error: 'Could not connect to Home Assistant at that URL' });
  }
  const passwordHash = await hashPassword(password);
  saveConfig({ haUrl: haUrl.replace(/\/$/, ''), haToken, passwordHash, dashboardName: dashboardName ?? 'Safrani Home' });
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Too many attempts, wait a minute' });
  const { password, duration } = req.body as { password?: string; duration?: string };
  if (!password || !(await validatePassword(password))) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ token: signToken(duration) });
});

// Reconfigure — verify HA token proves identity, reset password (+ update HA creds)
app.post('/api/reconfigure', async (req, res) => {
  if (!isConfigured()) return res.status(400).json({ error: 'Not configured — use /api/setup' });
  const { haUrl, haToken, newPassword } = req.body as { haUrl?: string; haToken?: string; newPassword?: string };
  if (!haUrl || !haToken || !newPassword) return res.status(400).json({ error: 'haUrl, haToken and newPassword are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const { default: fetch } = await import('node-fetch');
    const test = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, {
      headers: { Authorization: `Bearer ${haToken}` },
    });
    if (!test.ok) return res.status(400).json({ error: 'HA token invalid or HA unreachable — check URL and token' });
  } catch {
    return res.status(400).json({ error: 'Could not connect to Home Assistant' });
  }
  const passwordHash = await hashPassword(newPassword);
  const prev = getConfig()!;
  saveConfig({ ...prev, haUrl: haUrl.replace(/\/$/, ''), haToken, passwordHash });
  res.json({ ok: true });
});

// Camera proxy — HA token never exposed to browser
app.get('/api/camera/:entityId', async (req, res) => {
  const token = req.query.token as string | undefined;
  const { verifyToken } = await import('./auth.js');
  if (!token || !verifyToken(token)) return res.status(401).send('Unauthorized');
  const entityId = req.params.entityId;
  if (!/^camera\.[a-z0-9_]+$/.test(entityId)) return res.status(400).send('Invalid entity');
  const config = getConfig();
  if (!config) return res.status(503).send('Not configured');
  try {
    const { default: fetch } = await import('node-fetch');
    const upstream = await fetch(`${config.haUrl}/api/camera_proxy/${entityId}`, {
      headers: { Authorization: `Bearer ${config.haToken}` },
    });
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    upstream.body?.pipe(res);
  } catch {
    res.status(502).send('Camera unavailable');
  }
});

// ── Static files + page routing ─────────────────────────────────────────────

app.use(express.static(PUBLIC_DIR));

// /login — always serve login.html (client JS decides setup vs login)
app.get('/login', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'login.html')));

// Everything else → dashboard (ha-bridge.js redirects to /login if no token)
app.get('*', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

// ── WebSocket proxy ──────────────────────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });
setupWsProxy(wss);

server.listen(PORT, () => {
  console.log(`[ha-dashboard] Running on http://0.0.0.0:${PORT}`);
  if (!isConfigured()) console.log('[ha-dashboard] First run — open the app to complete setup');
});
