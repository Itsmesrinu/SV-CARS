/**
 * Owner login — `POST /admin/login`, `POST /admin/logout`, `GET /admin/me`.
 *
 * CONTRACT.md §8. One admin user, one cookie, nothing else: no registration, no
 * roles, no password reset, no invitations.
 *
 * Owned by P01.
 */

import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { adminUsers } from '../../db/schema';
import {
  clearSessionCookie,
  createSessionToken,
  getSession,
  setSessionCookie,
  type AppEnv,
} from '../lib/auth';
import { invalidCredentials } from '../lib/errors';
import { parseBody } from '../lib/validate';

/**
 * A real bcrypt hash of a throwaway string, compared against when the email is
 * unknown.
 *
 * Without it, a missing user returns in microseconds while a wrong password
 * costs a full bcrypt round — a timing difference that turns this endpoint into
 * an account-existence oracle. The response body is already identical for both
 * cases; this makes the clock agree.
 */
const DUMMY_HASH = '$2b$10$4sGN.0oHyLGdyF2KE8HeSergmrfo8qYqwhGzKDoOFipu0gR/0IqNS';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'is required'),
  password: z.string().min(1, 'is required'),
});

export const authRoutes = new Hono<AppEnv>();

/**
 * POST /api/admin/login -> { ok: true } + `sv_session` cookie · 401 on bad creds.
 *
 * The failure message is the same sentence whether the email is unknown or the
 * password is wrong. Telling the difference is only ever useful to someone who
 * does not already know the owner's email address.
 */
authRoutes.post('/login', async (c) => {
  const { email, password } = await parseBody(c, loginSchema);
  const normalised = email.toLowerCase();

  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, normalised))
    .limit(1);

  const matches = await compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw invalidCredentials();

  setSessionCookie(c, await createSessionToken(user.id, user.email));
  return c.json({ ok: true as const });
});

/**
 * POST /api/admin/logout -> { ok: true }
 *
 * Deliberately reachable without a valid session (see the allowlist in
 * `app.ts`): a browser holding an expired cookie must still be able to clear it,
 * and a logout that 401s leaves the owner stuck on a screen he cannot leave.
 */
authRoutes.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true as const });
});

/** GET /api/admin/me -> { email } · 401 without a valid cookie (via `requireAuth`). */
authRoutes.get('/me', (c) => {
  const session = getSession(c);
  return c.json({ email: session.email });
});