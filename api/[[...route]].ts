/**
 * Vercel entry point for the whole API.
 *
 * The `[[...route]]` catch-all means one function serves every `/api/*` path,
 * and Hono does the routing inside it. `vercel.json`'s SPA rewrite deliberately
 * excludes `/api/`, so these requests reach this function instead of index.html.
 *
 * Runtime: the Vercel Node.js runtime (the default for files in `api/`) — not
 * edge. Left implicit on purpose; the current hono/vercel adapter needs no
 * runtime config, and Neon's HTTP driver works on both.
 */

import { handle } from 'hono/vercel';
import { createApp } from '../server/app';

export default handle(createApp());
