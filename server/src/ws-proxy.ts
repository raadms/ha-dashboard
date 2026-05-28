import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { verifyToken } from './auth.js';
import { getConfig } from './config.js';

function toWsUrl(url: string): string {
  return url.replace(/\/$/, '').replace(/^https/, 'wss').replace(/^http/, 'ws') + '/api/websocket';
}

export function setupWsProxy(wss: WebSocketServer): void {
  wss.on('connection', (client: WebSocket, req: IncomingMessage) => {
    const reqUrl = new URL(req.url ?? '', 'http://localhost');
    const token = reqUrl.searchParams.get('token');

    if (!token || !verifyToken(token)) {
      client.close(4001, 'Unauthorized');
      return;
    }

    const config = getConfig();
    if (!config) {
      client.close(4002, 'Not configured');
      return;
    }

    const haWs = new WebSocket(toWsUrl(config.haUrl), { rejectUnauthorized: false });
    let haReady = false;

    haWs.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.toString()) as Record<string, unknown>; }
      catch { return; }

      if (msg.type === 'auth_required') {
        haWs.send(JSON.stringify({ type: 'auth', access_token: config.haToken }));
        return;
      }
      if (msg.type === 'auth_ok') {
        haReady = true;
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'auth_ok' }));
        }
        return;
      }
      if (msg.type === 'auth_invalid') {
        console.error('[ws-proxy] HA auth failed — re-run setup to update the token');
        client.close(4003, 'HA token invalid');
        return;
      }
      if (client.readyState === WebSocket.OPEN) client.send(raw.toString());
    });

    client.on('message', (raw: Buffer) => {
      if (!haReady || haWs.readyState !== WebSocket.OPEN) return;
      haWs.send(raw.toString());
    });

    client.on('close', () => { if (haWs.readyState === WebSocket.OPEN) haWs.close(); });
    haWs.on('close', () => { if (client.readyState === WebSocket.OPEN) client.close(); });
    haWs.on('error', (err: Error) => {
      console.error('[ws-proxy]', err.message);
      if (client.readyState === WebSocket.OPEN) client.close(4004, 'HA connection error');
    });
  });
}
