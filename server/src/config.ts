import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../../../data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

export interface AppConfig {
  haUrl: string;
  haToken: string;
  passwordHash: string;
  dashboardName: string;
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
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  _config = config;
}
