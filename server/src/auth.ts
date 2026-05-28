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

export function signToken(): string {
  return jwt.sign({ auth: true }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}
