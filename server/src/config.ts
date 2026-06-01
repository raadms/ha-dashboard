import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../../../data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

export interface AppConfig {
  haUrl: string;
  haToken: string;
  dashboardName: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  pushWebhookSecret?: string;
  scryptedUrl?: string;
  scryptedUsername?: string;
  scryptedPassword?: string;
  // legacy — present in old config files, never written again
  passwordHash?: string;
}

let _config: AppConfig | null = null;

export function isConfigured(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): AppConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    _config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as AppConfig;
    return _config;
  } catch {
    return null;
  }
}

export function getConfig(): AppConfig | null {
  return _config ?? loadConfig();
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(DATA_DIR, { recursive: true });
  // Never persist the legacy passwordHash
  const { passwordHash: _legacy, ...clean } = config;
  void _legacy;
  writeFileSync(CONFIG_FILE, JSON.stringify(clean, null, 2), { mode: 0o600 });
  _config = clean as AppConfig;
}
