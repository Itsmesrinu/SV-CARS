/**
 * Vercel entry point for the whole API.
 *
 * The `[[...route]]` catch-all means one function serves every `/api/*` path,
 * and Hono does the routing inside it. `vercel.json`'s SPA rewrite deliberately
 * excludes `/api/`, so these requests reach this function instead of index.html.
 *
 * Runtime: the Vercel Node.js runtime (the default for files in `api/`).
 *
 * ## Why named method exports and not `export default`
 *
 * Vercel's Node runtime chooses the handler *signature* from HOW you export it:
 *
 *   export default fn        -> Node signature: (req: IncomingMessage, res: ServerResponse) => void
 *                               The return value is IGNORED; you must write to `res`.
 *   export const GET = fn    -> Web signature:  (req: Request) => Response | Promise<Response>
 *
 * `handle()` from `hono/vercel` is literally `(app) => (req) => app.fetch(req)`
 * — Web style: one argument, returns a Response. Exporting it as `default`
 * therefore handed it a Node `IncomingMessage` instead of a Web `Request` and
 * then discarded the Response it built, so nothing was ever written back.
 * Vercel reported exactly that:
 *
 *   WARN: default export returned a `Response`. The default-export signature is
 *   `(req, res) => void` — returns are ignored.
 *
 * Named method exports select the Web signature, which is the one the adapter
 * actually implements.
 *
 * Every method the API serves must be named here — `server/` registers GET,
 * POST, PUT, PATCH and DELETE. HEAD and OPTIONS are included so the platform
 * dispatches them into Hono (which answers them or 404s) rather than failing at
 * the runtime layer before our code runs.
 *
 * Do NOT reintroduce `export default` alongside these: it takes precedence and
 * brings the bug straight back.
 */

import { handle } from 'hono/vercel';
import { createApp } from '../server/app.js';

// Built once per cold start and reused by every warm invocation.
const handler = handle(createApp());

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};
