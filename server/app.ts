/**
 * `createApp()` — the single source of every route (CONTRACT.md §13).
 *
 *   scripts/dev-server.ts  ──serve()──┐
 *                                     ├──> createApp()  (this file)
 *   api/[[...route]].ts    ──handle()─┘
 *
 * One app definition, two adapters: `@hono/node-server` on port 3001 locally,
 * and a single Vercel catch-all function in production. Nothing in here may
 * depend on which one is running.
 *
 * Owned by P01.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, type AppEnv } from './lib/auth';
import { notFoundHandler, onError } from './lib/errors';
import { authRoutes } from './routes/auth';
import { availabilityRoutes } from './routes/availability';
import { carRoutes } from './routes/cars';
import { imageRoutes } from './routes/images';
import { locationRoutes } from './routes/locations';
import { publicRoutes } from './routes/public';
import { settingsRoutes } from './routes/settings';

/**
 * The two `/admin/*` routes that must work without a session.
 *
 * Login obviously. Logout too: a browser holding an expired cookie still has to
 * be able to clear it, and a 401 there strands the owner on a screen whose only
 * exit is developer tools.
 *
 * This list lives here, next to the guard, rather than inside `requireAuth` —
 * one place to read when asking "what is unauthenticated?".
 */
const UNGUARDED_ADMIN_PATHS = new Set(['/api/admin/login', '/api/admin/logout']);

/**
 * No admin response may ever be cacheable. Applied as middleware rather than per
 * handler because the handler you forget is the one that leaks the owner's
 * private notes into a shared cache.
 */
const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
};

/** One guard for every `/api/admin/*` route, with the two exceptions above. */
const adminGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path.replace(/\/+$/, '') || c.req.path;
  if (UNGUARDED_ADMIN_PATHS.has(path)) return next();
  return requireAuth(c, next);
};

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError(onError);
  app.notFound(notFoundHandler);

  // Registered BEFORE the routers: Hono matches middleware in registration
  // order, so a guard added after its handlers never runs.
  app.use('/admin/*', noStore);
  app.use('/admin/*', adminGuard);

  // Public: /cars, /cars/:id, /locations, /settings, /health.
  app.route('/', publicRoutes);

  // Admin. Every one of these is behind `adminGuard` by virtue of its path.
  app.route('/admin', authRoutes);
  app.route('/admin', carRoutes);
  app.route('/admin', imageRoutes);
  app.route('/admin', locationRoutes);
  app.route('/admin', availabilityRoutes);
  app.route('/admin', settingsRoutes);

  return app;
}

/** Handy for a typed `hono/client` later. */
export type AppType = ReturnType<typeof createApp>;