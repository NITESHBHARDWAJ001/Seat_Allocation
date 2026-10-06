import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from './schema.js';

// ------------------------------------------------------------------------------------------------ passwords
const SCRYPT_N = 16384;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N: SCRYPT_N }, (err, key) => (err ? reject(err) : resolve(key))));
}

/** "scrypt$<N>$<salt b64>$<hash b64>" - salted, memory-hard, no native dependency. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, , saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Readable temporary password (no look-alike characters), shown once to whoever created the account. */
export function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
}

export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}

// ------------------------------------------------------------------------------------------------ tokens
export interface AccessClaims {
  sub: string;
  org: string | null;
  role: Role;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set (at least 32 characters) when DATA_BACKEND=postgres');
  return s;
}

export function assertSecurityConfig(): void {
  secret();
}

export function signAccessToken(claims: AccessClaims): string {
  const minutes = Number(process.env.ACCESS_TOKEN_MINUTES ?? 30);
  return jwt.sign(claims, secret(), { expiresIn: `${minutes}m` });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, secret()) as AccessClaims;
}

export function newRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = crypto.randomBytes(48).toString('base64url');
  const days = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);
  return { token, hash: hashRefreshToken(token), expiresAt: new Date(Date.now() + days * 86_400_000) };
}

export const hashRefreshToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
