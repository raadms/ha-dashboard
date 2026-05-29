import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';

const JWT_SECRET = process.env.JWT_SECRET ?? crypto.randomUUID() + crypto.randomUUID();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function validatePassword(password: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  return bcrypt.compare(password, config.passwordHash);
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

export function signToken(duration = '30d'): string {
  const key: DurationKey = (duration in DURATION_MAP ? duration : '30d') as DurationKey;
  return jwt.sign({ auth: true }, JWT_SECRET, { expiresIn: DURATION_MAP[key] });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}
