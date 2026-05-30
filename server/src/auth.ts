import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';
import { getLayout } from './layout.js';

const JWT_SECRET = process.env.JWT_SECRET ?? crypto.randomUUID() + crypto.randomUUID();

export interface TokenPayload {
  userId: string;
  name: string;
  role: 'admin' | 'user';
  allowedRooms: string[] | null;
  allowedTabs: string[] | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function validatePassword(password: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  return bcrypt.compare(password, config.passwordHash);
}

// Validate login: 'admin' username (or blank) → main admin password; others → named users
export async function validateUserLogin(username: string | undefined, password: string): Promise<TokenPayload | null> {
  const isAdminLogin = !username || username.toLowerCase() === 'admin';
  if (!isAdminLogin) {
    const layout = getLayout();
    const user = layout.users.find(u => u.name.toLowerCase() === username!.toLowerCase() || u.id === username);
    if (user && await bcrypt.compare(password, user.passwordHash)) {
      return { userId: user.id, name: user.name, role: user.role, allowedRooms: user.allowedRooms, allowedTabs: user.allowedTabs };
    }
    return null;
  }
  if (await validatePassword(password)) {
    return { userId: 'admin', name: 'Admin', role: 'admin', allowedRooms: null, allowedTabs: null };
  }
  return null;
}

const DURATION_MAP = {
  '5m':    '5m',
  '1h':    '1h',
  '24h':   '1d',
  '7d':    '7d',
  '30d':   '30d',
  'never': '3650d',
} as const;
type DurationKey = keyof typeof DURATION_MAP;

export function signToken(payload: TokenPayload, duration = '30d'): string {
  const key: DurationKey = (duration in DURATION_MAP ? duration : '30d') as DurationKey;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: DURATION_MAP[key] });
}

export function verifyToken(token: string): TokenPayload | null {
  try { return jwt.verify(token, JWT_SECRET) as TokenPayload; }
  catch { return null; }
}

export function isAdminToken(token: string): boolean {
  return verifyToken(token)?.role === 'admin';
}
