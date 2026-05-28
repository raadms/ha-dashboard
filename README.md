# HA Dashboard

A secure, self-hosted Home Assistant dashboard. No credentials are stored in the image — all configuration is done through the built-in setup wizard on first run.

## Quick Start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Generate a JWT secret (copy the output into .env)
openssl rand -hex 32

# 3. Start
docker compose up -d
```

Open `http://your-server:3000` and follow the setup wizard.

## Setup Wizard

On first launch you'll be guided through:
1. **HA URL** — your Home Assistant URL (e.g. `https://ha.yourdomain.com`)
2. **Long-Lived Token** — create one in HA → Profile → Security → Long-Lived Access Tokens
3. **Dashboard password** — protects access to the dashboard

All credentials are saved in `./data/config.json` on your server, never baked into the image.

## Updating

```bash
docker compose pull && docker compose up -d
```

Your config in `./data/` persists across updates.

## Security

- HA token lives only on the server — never sent to the browser
- Camera feeds are proxied through the server (HA token injected server-side)
- JWT authentication for the WebSocket connection
- Rate-limited login endpoint (10 attempts/minute per IP)
- Security headers on all responses
