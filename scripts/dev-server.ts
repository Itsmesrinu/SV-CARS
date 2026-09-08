/**
 * Local API server — the dev-time stand-in for the Vercel function.
 *
 * Serves the exact same `createApp()` that `api/[[...route]].ts` wraps, on port
 * 3001. Vite (port 3000) proxies `/api` here, so the browser always talks to a
 * single origin and the httpOnly session cookie behaves as it will in
 * production. `npm run dev:all` runs both. CONTRACT.md §13.
 */

import { config } from 'dotenv';

// Load the environment BEFORE any module that might read it at import time.
// `.env.local` first: dotenv never overwrites an already-set var, so a value
// there wins over `.env`, which in turn loses to a real shell variable.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// Dynamic imports on purpose: static `import` statements are hoisted and would
// evaluate the app (and anything it configures from env — e.g. P01's Cloudinary
// SDK setup) before the two calls above had run.
const { serve } = await import('@hono/node-server');
const { createApp } = await import('../server/app.js');

const port = Number(process.env.API_PORT ?? 3001);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
  console.log(`[api] health:      http://localhost:${info.port}/api/health`);
  console.log(
    `[api] DATABASE_URL ${process.env.DATABASE_URL ? 'loaded' : 'MISSING — /api/health will report db:false'}`,
  );
});
