/**
 * Single-owner session auth (CONTRACT.md §8, "Session cookie — frozen").
 *
 * An HS256 JWT in an httpOnly cookie named `sv_session`. Hono's own `sign`/
 * `verify` are Web Crypto based, so this adds no dependency and runs unchanged
 * on the Vercel Node runtime and in local `tsx`.
 *
 * There is exactly one admin user. No registration, no roles, no password reset
 * — `prompts/PLAN.md` scopes this to the owner's login and anything more is
 * attack surface built for nobody.
 *
 * Owned by P01.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';
import { internal, unauthorized } from './errors';

/** Frozen in CONTRACT.md §8 — P03's client sends it by `credentials: 'same-origin'`. */
export const SESSION_COOKIE = 'sv_session';

/** Frozen in CONTRACT.md §8. Passed explicitly on verify too, so a token that
 *  claims `alg: none` or an asymmetric algorithm is rejected outright. */
const SESSION_ALG = 'HS256' as const;

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  sub: string;
  email: string;
  exp: number;
}

/** What `requireAuth` stashes for handlers. Read it with `getSession(c)`. */
type SessionVars = { session: SessionPayload };

/**
 * The Hono environment shared by `createApp()` and every router it mounts.
 * Declared once so a sub-router and the app it is mounted on always agree.
 */
export type AppEnv = { Variables: SessionVars };

/**
 * `secure` only in production: local dev is plain http on localhost:3000, and a
 * `secure` cookie there is silently dropped by the browser — the owner would
 * log in successfully and stay logged out.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Logged as a config error, returned to the client as a generic 500 — the
    // name of a missing env var is not a secret, but this keeps error bodies uniform.
    console.error('[auth] JWT_SECRET is not set. Admin login cannot work. See .env.example.');
    throw internal('Authentication is not configured on this server.');
  }
  return secret;
}

/** Signs the session token. `exp` is seconds since the epoch, as JWT requires. */
export async function createSessionToken(sub: string, email: string): Promise<string> {
  const payload: SessionPayload = {
    sub,
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  // `JWTPayload` carries an index signature our closed interface deliberately
  // doesn't; the cast is the whole difference.
  return sign(payload as unknown as JWTPayload, jwtSecret(), SESSION_ALG);
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: isProduction(),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure: isProduction(),
    sameSite: 'Lax',
  });
}

/** Returns the payload for a valid cookie, or null for missing/expired/tampered. */
export async function readSession(c: Context): Promise<SessionPayload | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  try {
    const payload = (await verify(token, jwtSecret(), SESSION_ALG)) as unknown as SessionPayload;
    if (!payload || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return null;
    }
    return payload;
  } catch {
    // Expired, wrong signature, or not a JWT at all. All the same answer: 401.
    return null;
  }
}

/**
 * The one guard for every `/api/admin/*` route (CONTRACT.md §8).
 *
 * Registered once in `app.ts` as `app.use('/admin/*', requireAuth)` rather than
 * per handler, because the per-handler check you forget to add is the security
 * hole. `login` and `logout` are the only exceptions and they are named
 * explicitly in `app.ts`, not decided here.
 */
export const requireAuth: MiddlewareHandler<{ Variables: SessionVars }> = async (c, next) => {
  const session = await readSession(c);
  if (!session) throw unauthorized();
  c.set('session', session);
  await next();
};

/** The verified session inside a guarded handler. */
export function getSession(c: Context): SessionPayload {
  const session = c.get('session') as SessionPayload | undefined;
  if (!session) throw unauthorized();
  return session;
}