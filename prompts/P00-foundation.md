# P00 — Foundation & Contract  ·  WAVE 0  ·  **SOLO — nothing else may run**

You are building the foundation that five parallel sessions will code on top of. Everything you produce here is treated as frozen by them. Be precise; be conservative.

**First:** read `prompts/CONTRACT.md` end to end, then `prompts/PLAN.md`. Then skim `docs/*.md` and `.github/copilot-instructions.md` — they contain hard rules you must not violate.

> **Amended 2026-09-03 — multi-city branches (CONTRACT.md §15).** The client asked for branches (city + office address + map link) after this prompt had already been executed, so Tasks 3 and 4 below now include the `locations` table, `cars.locationId`, `LocationDTO`/`LocationInput`, and `src/lib/locationHelpers.ts`. If you are re-running P00 from scratch, just follow the prompt as written — it is complete. If you are picking up an already-built tree, the delta is: five tables not four, `cars.location` text replaced by a `locationId` FK, and one extra helper file.
>
> **Amended 2026-09-05 — availability calendar & booking dates (CONTRACT.md §16).** Adds the `car_availability_blocks` table, `BlockedRangeDTO`/`AvailabilityBlockDTO`, `src/lib/availability.ts`, and a stub `src/pages/AdminAvailabilityPage.tsx` behind a new `/admin/availability` route. Delta on an already-built tree: six tables, one more helper file, one more stub, one more route.

**You own** (create/edit/delete freely):

```
package.json, package-lock.json, .gitignore, .env.example
vite.config.ts, vercel.json, tsconfig.json, drizzle.config.ts
db/schema.ts, db/index.ts
src/types/api.ts, src/lib/cloudinary.ts, src/lib/carHelpers.ts, src/lib/locationHelpers.ts
src/lib/availability.ts
src/main.tsx, src/App.tsx
src/pages/AdminLoginPage.tsx        (STUB only — P04 replaces it)
src/pages/AdminAvailabilityPage.tsx (STUB only — P09 replaces it)
server/app.ts                       (STUB only — P01 replaces it)
api/[[...route]].ts, scripts/dev-server.ts
DELETIONS: src/pages/{admin,booking,car_details,all_cars}/, main.py, .python-version, prompts.md.txt, final_prompts.md.txt
```

**You must not touch:** any other file under `src/`. In particular leave `src/data/cars.ts`, `src/data/carImageMap.ts`, `src/pages/AllCarsPage.tsx`, `src/pages/CarDetailsPage.tsx`, `src/pages/BookingPage.tsx`, `src/pages/HomePage.tsx`, `src/pages/AdminPage.tsx`, `src/components/**` (except creating nothing there) exactly as they are. Later sessions own them.

---

## Task 1 — Cleanup (commit this separately, first)

Delete these, in one commit titled `chore: remove stale Stitch page exports and AI Studio scaffolding`:

- `src/pages/admin/`, `src/pages/booking/`, `src/pages/car_details/`, `src/pages/all_cars/` — verify with `grep -rn "pages/admin\|pages/booking\|pages/car_details\|pages/all_cars" src/` that nothing imports them first. `src/App.tsx` imports only `./pages/AdminPage`, `./pages/AllCarsPage`, etc. (the flat files), so these directories are dead. Each carries its own `package.json`/`vite.config.ts` and a duplicated WhatsApp URL builder.
- `main.py` and `.python-version` — leftovers from a `uv` template; this is not a Python project.
- `prompts.md.txt` and `final_prompts.md.txt` at the repo root — superseded by this `prompts/` directory. If either contains anything you judge to still be needed, **do not delete it** — say so in your summary instead.

Also in this commit: remove the dead `define: { 'process.env.GEMINI_API_KEY': ... }` block from `vite.config.ts` and replace the AI Studio `.env.example` (see Task 6). Confirm `grep -rn "GEMINI_API_KEY" src/` returns nothing before removing.

Sanity check after the deletion: `npm run lint` must still be green and `npm run dev` must still serve the home page.

## Task 2 — Dependencies (one install, one lockfile — this is why P00 is solo)

Install everything the entire build needs, so no Wave 1 session ever touches `package.json`:

```bash
npm i hono @hono/zod-validator zod drizzle-orm @neondatabase/serverless bcryptjs cloudinary @tanstack/react-query
npm i -D drizzle-kit @hono/node-server sharp concurrently dotenv
```

Notes:
- **`bcryptjs`, not `bcrypt`** — pure JS, no native build step, which matters on Windows and in serverless. Check whether the installed version ships its own types; add `@types/bcryptjs` only if `tsc` complains.
- `sharp` is dev-only: it is used by P02's local migration script, never at runtime.
- `cloudinary` (Node SDK) is a runtime dep — P01 uses `cloudinary.utils.api_sign_request` for upload signing.

Add these scripts to `package.json`:

```json
"dev:api": "tsx watch scripts/dev-server.ts",
"dev:all": "concurrently -n web,api -c cyan,magenta \"npm:dev\" \"npm:dev:api\"",
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio",
"migrate:images": "tsx scripts/migrate-images.ts",
"create:admin": "tsx scripts/create-admin.ts",
"seed:settings": "tsx scripts/seed-settings.ts"
```

Keep `dev`, `build`, `preview`, `clean`, `lint` exactly as they are.

## Task 3 — Drizzle schema (`db/schema.ts`) and client (`db/index.ts`)

Implement exactly the six tables from `prompts/PLAN.md` Phase 1, typed to produce the DTOs in CONTRACT.md §3. Requirements:

- `cars.id` is `text` primary key holding a slug (`'toyota-innova-crysta'`), **not** a serial — the existing routes are `/car/:id` with slugs and public URLs must not change.
- Money columns are `integer` whole rupees. `pricePerDay` is `notNull().default(0)`. `driverPricePerDay`, `kmLimitPerDay`, `extraKmCharge` are **nullable** — null means "inherit the settings default" (CONTRACT.md §4).
- `tags` is `text('tags').array().notNull().default([])`.
- `carType`, `seating`, `fuel`, `transmission`, `year`, `description` are all nullable. Several are genuinely unknown for the current fleet and `.github/copilot-instructions.md` forbids inventing them.
- **`locations`** (CONTRACT.md §15) — `id` text slug primary key, `city` notNull, `officeName` nullable, `addressShort` notNull, `addressFull` nullable, `directionsUrl` nullable, `whatsappPhone` nullable, `isActive` notNull default true, `sortOrder` notNull default 0, timestamps. **Do not put a unique constraint on `city`** — two offices in one city is a real case, and `cityOptions()` collapses them into one customer-facing choice.
- `cars.locationId` is `text` → `references(() => locations.id, { onDelete: 'set null' })`, **nullable**, with an index. This replaces the free-text `location` column from `docs/data-model.md`: a branch is now a real row, not a string. `set null` rather than `cascade` — deleting a branch must never delete the owner's cars. P01 additionally refuses the delete with `409` while cars still point at it.
- **`car_availability_blocks`** (CONTRACT.md §16) — `id` uuid `defaultRandom()`, `carId` → `references(() => cars.id, { onDelete: 'cascade' })`, `startDate` and `endDate` as **`date` columns** (`mode: 'string'`, so Drizzle hands you `'YYYY-MM-DD'` and never a `Date`), `note` text nullable, timestamps. Index on `(carId, startDate)`. Add a check constraint `end_date > start_date`.
  - **`endDate` is exclusive** — §16.1 rule 2. The car is out from `startDate` up to but not including `endDate`, and available again *on* `endDate`. This is what makes `days = end − start` and makes adjacent blocks non-overlapping. Put that in a comment on the column; it is the single most misreadable thing in this schema.
  - Use `mode: 'string'` deliberately. The default `Date` mode would hand the API a `Date` built in the server's timezone, which is exactly the off-by-one §16.1 exists to prevent.
  - `note` is the owner's private annotation. **It must never reach a public endpoint** — the public `blocks` array carries `{ startDate, endDate }` only. Note that in a comment too, so P01 doesn't casually spread the row into a response.
  - Do **not** add a database-level exclusion constraint for overlaps. It needs the `btree_gist` extension and P01 rejects overlaps at the application layer with a clearer `409` anyway.
- `car_images.carId` → `references(() => cars.id, { onDelete: 'cascade' })`. `id` is `uuid().defaultRandom()`. `kind` is a pg enum matching `ImageKind` in CONTRACT.md §3. Add a unique index on `(carId, sortOrder)` and an index on `carId`.
- `settings` is a single-row table: `id integer primary key` with a `check (id = 1)`.
- `admin_users`: `id uuid`, `email text unique notNull`, `passwordHash text notNull`, `createdAt`.
- `createdAt`/`updatedAt` are `timestamp({ withTimezone: true }).notNull().defaultNow()`.
- Export inferred types: `export type CarRow = typeof cars.$inferSelect` etc. P01 and P02 both consume these.

`db/index.ts` exports a lazily-created Drizzle client over the Neon HTTP driver:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
```

Read `DATABASE_URL` from `process.env` and throw a clear error if it is missing. Do **not** create the connection at module top level in a way that crashes on import when the env var is absent — P02's scripts load `.env.local` via `dotenv` before touching it.

Write `drizzle.config.ts` pointing at `db/schema.ts`, `out: './drizzle'`, `dialect: 'postgresql'`, credentials from `DATABASE_URL`. Then run `npm run db:generate` to produce the initial migration and commit the generated `drizzle/` folder.

## Task 4 — Shared contract files

Write these five **exactly** as specified. Wave 1 sessions import them and cannot change them.

1. **`src/types/api.ts`** — copy the type block from CONTRACT.md §3 verbatim, `LocationDTO` included. Also export `CarInput`, `LocationInput`, `AddImageInput`, `UpdateImageInput`, `UploadSignature` as described in §8/§9, since P01, P03 and P04 all reference them. Note `CarInput` omits `location` and carries `locationId: string | null` instead — a write payload references the branch, it doesn't embed it.
2. **`src/lib/cloudinary.ts`** — implement `cldUrl`, `cldSrcSet`, `CLD_WIDTHS` per CONTRACT.md §5, using the option→URL-segment mapping table in §5.1. Requirements:
   - Always include `f_auto,q_auto` (the SDK's `fetch_format: 'auto', quality: 'auto'`). These two are what make Cloudinary serve AVIF/WebP at a per-image quality, and they are the single biggest win in the whole image strategy.
   - Support all three `CldFit` values: `'limit'` → `c_limit` (default), `'fill'` → `c_fill`, `'auto'` → `c_auto,g_auto` for the content-aware crop the fixed-height fleet cards need.
   - Read the cloud name from `import.meta.env.VITE_CLOUDINARY_CLOUD_NAME` and emit `https://` absolute URLs.
   - `cldSrcSet` must filter out widths larger than the image's natural width so you never upscale.
   - **Hand-built string concatenation — do not import the `cloudinary` npm package here.** That package is a server-side SDK requiring the API secret; importing it into a Vite module would ship the secret to the browser. It is installed for P01 and P02 only (CONTRACT.md §5.2).
   - Verify one emitted URL actually resolves before you finish: paste a `cldUrl('sample', { width: 400 })` result into a browser. `sample` exists in every Cloudinary account, so a 404 means your URL shape is wrong.
3. **`src/lib/carHelpers.ts`** — implement all ten helpers per CONTRACT.md §4. These exist specifically so P04 and P05 cannot drift apart on the old→new field mapping. `calcTotal` must reproduce today's arithmetic: `basePrice = pricePerDay * days`, `driverTotal = mode === 'driver' ? effectiveDriverRate * days : 0`, `total = basePrice + driverTotal`. The four branch helpers (`carLocation`, `pickupAddress`, `bookingPhone`, `filterCarsByCities`) follow the same fallback pattern as the pricing ones: the car's own value, else the global default.
4. **`src/lib/locationHelpers.ts`** — implement all six helpers per CONTRACT.md §4.1. Two of them carry real weight:
   - `directionsHref` must **never** return a non-`http(s)` URL. The owner pastes `directionsUrl` and it lands in an `href`; a `javascript:` value there is stored XSS. Validate the scheme with `new URL()` in a try/catch and fall back to `https://www.google.com/maps/search/?api=1&query=<encoded address>` on anything else. P01 validates on write too — this is the second layer, because the row may predate that validation.
   - `mapEmbedSrc` derives the office-section iframe from the address (`https://www.google.com/maps?q=<encoded>&output=embed`) rather than storing an embed URL. That form needs no Maps API key and works with a plain address, whereas a pasted `maps.app.goo.gl` short link cannot be embedded at all.
5. **`src/lib/availability.ts`** — implement CONTRACT.md §4.2. This is the most bug-prone file in the foundation and four sessions depend on it, so build it deliberately:
   - **Dates are `'YYYY-MM-DD'` strings throughout.** Do the arithmetic by parsing to UTC **noon** (`new Date(\`${date}T12:00:00Z\`)`), adding whole days, and formatting back with `toISOString().slice(0, 10)`. Noon rather than midnight so no timezone offset can ever roll the date backwards.
   - `todayInIndia()` uses `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())`, which yields `YYYY-MM-DD` directly. **`en-CA` is doing real work here** — it is the locale whose short date format is ISO. Do not hand-assemble it from `getFullYear()`/`getMonth()`, which reads the *browser's* zone.
   - All range logic is **half-open** `[start, end)`: `rangesOverlap` is `aStart < bEnd && bStart < aEnd`. Write that once and use it everywhere; every other formulation of overlap is a bug waiting for a boundary case.
   - `carAvailability` order matters: master switch first (`unavailable`), then today-inside-a-block (`booked`), then `available`. A car with the switch off and a block must read `unavailable` — no return date may be implied for it (§16.2).
   - `nextFreeDate` must handle **chained blocks**: out 5–8 and again 8–12 means the next free date is the 12th, not the 8th. Walk the sorted blocks forward rather than looking at just the first hit. This is the single most likely defect in this file — write a case for it.
   - `formatDate` emits `'05 Sep 2026'`. Month name, zero-padded day, no locale dependency on the user's machine (`en-GB` with an explicit option set, or a fixed month array — either is fine, but the output must be identical on every device).
   - Pure functions only. No React, no fetching, no `Date` objects crossing the boundary. Then **write yourself a scratch test** covering: same-day = 1 day, `05→08` = 3 days, chained blocks, a block that ended yesterday (car must be available), a block starting today (car must be booked), and the exclusive-end boundary (`endDate` itself is free). Delete the scratch file before committing, and paste the results in your report.

## Task 5 — App shell (`src/main.tsx`, `src/App.tsx`)

You own both because P03 needs the query provider and P04 needs the admin routes — if they each edited these files they would collide.

In `src/main.tsx`: wrap the existing tree in `<QueryClientProvider>`. Configure the client with `staleTime: 60_000`, `refetchOnWindowFocus: false`, `retry: 2` — sensible for a catalogue that changes rarely, and the retry directly serves the "no errors on load" goal.

In `src/App.tsx`: keep `ScrollToTop` and `CustomerLayout` exactly as they are. Uncomment/restore the admin routes:

```
/admin/login  -> <AdminLoginPage />      (NO CustomerLayout — admin must not show the customer navbar)
/admin        -> <AdminPage />           (NO CustomerLayout, wrapped in the guard below)
```

Add a tiny `RequireAdmin` guard component **inside `src/App.tsx`** (not a separate file, so P04 doesn't need to touch this file): it calls `GET /api/admin/me` via plain `fetch` with `credentials: 'same-origin'` and `cache: 'no-store'`, renders nothing while pending, `<Navigate to="/admin/login" replace />` on 401, and children on success. Keep it dependency-light and self-contained.

Also add a catch-all `*` route rendering a simple 404 inside `CustomerLayout`, styled with existing classes only — reuse the "Car Not Found" block's look from `src/pages/CarDetailsPage.tsx:72-79`. Do not invent new styles.

Also register `/admin/availability` → `<AdminAvailabilityPage />`, outside `CustomerLayout` and inside the same `RequireAdmin` guard as `/admin`. P09 builds the fleet calendar behind it (CONTRACT.md §16.7); registering the route here is what keeps P04 and P09 out of `src/App.tsx`.

Create `src/pages/AdminLoginPage.tsx` and `src/pages/AdminAvailabilityPage.tsx` as **minimal stubs** — a default export returning a placeholder div with a `TODO: P04` / `TODO: P09` comment. Those sessions replace them wholesale. Their only job is to make `tsc` green today.

## Task 6 — Config: env, vite proxy, vercel, gitignore

**`.env.example`** — replace the AI Studio content entirely with the block from CONTRACT.md §12, with a comment on each line explaining where to get the value. Keep **placeholders only** in this file, since it is committed. The real values for this project's Cloudinary account are in [00-ORCHESTRATOR.md](./00-ORCHESTRATOR.md) §2 and belong in `.env.local`. Add a comment on the secret line making the boundary explicit: `CLOUDINARY_API_SECRET` is server-only and must never gain a `VITE_` prefix, while `VITE_CLOUDINARY_CLOUD_NAME` is deliberately public and appears in every image URL on the live site.

**`.gitignore`** — ensure it contains `.env.local`, `.env*.local`, `node_modules`, `dist`, `.vercel`, `drizzle/meta/_journal.json`? No — **keep the whole `drizzle/` folder tracked**, migrations belong in git. Just add the env and build entries.

**`vite.config.ts`** — remove the `GEMINI_API_KEY` define, keep the `@` alias and the HMR block as they are, and add the dev proxy:

```ts
server: {
  hmr: process.env.DISABLE_HMR !== 'true',
  proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
}
```

**`vercel.json`** — SPA fallback that does not swallow the API:

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

Verify the negative-lookahead actually excludes `/api/*` — getting this wrong makes every API call return HTML, which is a maddening bug to debug later.

## Task 7 — Server skeleton + local dev server

**`server/app.ts`** — a **stub** exporting `createApp(): Hono` with `basePath('/api')` and one route: `GET /health` returning `{ ok: true, db: <boolean> }` where `db` reflects a trivial `select 1` against Neon (wrapped in try/catch so a missing DB returns `false` rather than throwing). P01 replaces this file entirely — your job is only to establish the factory shape from CONTRACT.md §13 and prove the topology works end to end.

**`api/[[...route]].ts`** — wrap it for Vercel:

```ts
import { handle } from 'hono/vercel';
import { createApp } from '../server/app';
export default handle(createApp());
```

Set the Node runtime explicitly if the Hono/Vercel adapter version requires it. Make sure `tsconfig.json` includes `api/`, `server/`, `db/` and `scripts/` so `tsc --noEmit` actually checks them — it currently only covers the frontend, and that gap would hide real errors from every later session.

**`scripts/dev-server.ts`** — serve the same app with `@hono/node-server` on port 3001, loading `.env.local` via `dotenv/config` first. Log the listening URL.

---

## Acceptance — all four must pass before Wave 1 launches

1. `npm run lint` → **completely green**, and it now type-checks `api/`, `server/`, `db/`, `scripts/` too.
2. `npm run dev` → `http://localhost:3000` renders the home page, fleet, and a car detail page exactly as before your changes. The public pages still read from `src/data/cars.ts` at this point — that is correct, P05 migrates them.
3. `npm run dev:api` → `curl http://localhost:3001/api/health` returns `{"ok":true,...}`. With a real `DATABASE_URL` in `.env.local`, `db` should be `true`.
4. `npm run dev:all` → both boot, and `curl http://localhost:3000/api/health` works **through the Vite proxy**.

## Commits

1. `chore: remove stale Stitch page exports and AI Studio scaffolding`
2. `feat(db): add Drizzle schema for cars, images, settings, admin users`
3. `feat: add shared API types, Cloudinary URL builder and car helpers`
4. `feat: wire query provider, admin routes and local API dev topology`
5. *(amendment only, if you are extending an already-built P00)* `feat(db): add locations table and branch helpers for multi-city support`

## Report back

List: files created, files deleted, the exact dependency versions installed, whether `@types/bcryptjs` was needed, whether the four acceptance checks passed, and **anything in the contract you found to be wrong or under-specified** — five sessions are about to depend on it, so flag friction now rather than working around it.
