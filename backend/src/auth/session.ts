import { createHmac, timingSafeEqual } from 'node:crypto';

/** Sesiones firmadas sin estado: base64url(exp).hmac */

export function authRequired(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET es obligatorio cuando DASHBOARD_PASSWORD está definido.');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(candidate: unknown): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? '';
  return typeof candidate === 'string' && expected !== '' && safeEqual(candidate, expected);
}

export function issueSession(now = Date.now()): { token: string; expiresAt: string } {
  const hours = Number(process.env.SESSION_HOURS ?? 12);
  const exp = now + (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3_600_000;
  const payload = Buffer.from(String(exp)).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  const exp = Number(Buffer.from(payload, 'base64url').toString());
  return Number.isFinite(exp) && exp > now;
}
