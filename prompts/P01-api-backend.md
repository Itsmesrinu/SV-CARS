# P01 — API & Auth  ·  WAVE 1  ·  **PARALLEL** (runs alongside P02–P05)

You are building the entire server: a Hono app on Vercel serverless functions, backed by Neon Postgres via Drizzle, with single-owner JWT cookie auth and Cloudinary upload signing.

**First:** read `prompts/CONTRACT.md` end to end — §8 (API surface), §12 (env vars) and §13 (dev topology) are your specification and they are frozen. Then read `db/schema.ts` (written by P00) and `src/types/api.ts`.

**You own:**

```
server/**          — including replacing P00's stub server/app.ts entirely
```

That's it. Suggested layout:

```
server/app.ts               createApp() — route registration + middleware
server/lib/auth.ts          JWT sign/verify, cookie helpers, requireAuth middleware
server/lib/cloudinary.ts    signing + destroy
server/lib/mappers.ts       DB rows -> DTOs
server/lib/slug.ts          slugify + collision handling
server/lib/errors.ts        the ApiError response shape
server/routes/public.ts     GET /cars, /cars/:id, /locations, /settings, /health
server/routes/auth.ts       POST /admin/login, /admin/logout, GET /admin/me
server/routes/cars.ts       admin car CRUD
server/routes/images.ts     admin image add/reorder/patch/delete + upload signing
server/routes/locations.ts  admin branch CRUD
server/routes/availability.ts  admin availability blocks
server/routes/settings.ts   PUT /admin/settings
```

**You must not touch:** `api/[[...route]].ts`, `db/**`, `src/**`, `package.json`, `vite.config.ts`, `scripts/**`. If you need a dependency P00 didn't install, **stop and report it** rather than running `npm i` — a concurrent session's install would clobber your lockfile change and vice versa.

---

## Non-negotiables

1. **Implement CONTRACT.md §8 exactly** — every path, method, request body and response shape. P03 is writing a typed client against that table right now, in another session. A renamed field or a bare array instead of `{ cars: [...] }` breaks them silently.
2. **Errors always use `{ error: { code, message } }`.** Never leak a raw Postgres error, stack trace, or connection string to the client. Log the detail server-side, return a generic message.
3. **Every route under `/api/admin/*` is guarded by one middleware.** Register it as `app.use('/admin/*', requireAuth)` before the route handlers — do not sprinkle per-route auth checks, because the one you forget is the security hole.
4. **No secrets in responses.** `CLOUDINARY_API_SECRET` is used to compute a signature and is never returned. `passwordHash` never appears in any payload.
5. **Never invent data.** Nullable columns stay null. Do not default `carType` to `'SUV'` or `year` to the current year to make a response look complete.

## Task 1 — Foundations

**`server/lib/errors.ts`** — a helper producing the `ApiError` shape plus the right status. Use stable machine-readable codes: `unauthorized`, `invalid_credentials`, `not_found`, `validation_failed`, `conflict`, `internal`. Add a Hono `onError` handler that maps unexpected throws to `500 { error: { code: 'internal', message: 'Something went wrong' } }` and logs the real cause.

**`server/lib/mappers.ts`** — `toCarDTO(carRow, imageRows, locationRow, blockRows): CarDTO`, `toCarImageDTO(row): CarImageDTO`, `toLocationDTO(row): LocationDTO`, `toSettingsDTO(row): SettingsDTO`, and **two distinct block mappers**: `toBlockedRangeDTO(row)` → `{ startDate, endDate }` for public responses and `toAvailabilityBlockDTO(row)` → the full row with `id` and `note` for admin ones. Keep them as separate functions rather than one with a flag — the public one physically cannot leak the owner's private note, and that is worth a duplicated three-line function (CONTRACT.md §16). Timestamps become ISO strings. `images` must arrive **already sorted by `sortOrder` ascending** — the contract promises that and both UI sessions rely on it rather than re-sorting. `LocationDTO` carries **no** timestamps: it is a small object embedded in every car in every list response, so keep it lean.

**`server/lib/slug.ts`** — `slugify(name)` → lowercase, non-alphanumerics to single hyphens, trimmed. Must reproduce the existing ids: `'Toyota Innova Crysta'` → `'toyota-innova-crysta'`, `'Maruti Suzuki Dzire'` → `'maruti-suzuki-dzire'`. Add `uniqueSlug(base, exists)` appending `-2`, `-3`, … on collision.

## Task 2 — Auth (`server/lib/auth.ts`, `server/routes/auth.ts`)

Use Hono's built-in `sign`/`verify` from `hono/jwt` (Web Crypto, no extra dependency) and `setCookie`/`getCookie`/`deleteCookie` from `hono/cookie`.

Cookie spec is frozen in CONTRACT.md §8: name `sv_session`, `httpOnly: true`, `sameSite: 'Lax'`, `path: '/'`, `secure` **only in production** (otherwise local http dev can't log in), 7-day expiry, HS256 over `JWT_SECRET`, payload `{ sub, email, exp }`.

- `POST /admin/login` — validate with zod, look up `admin_users` by lowercased email, compare with `bcryptjs.compare`. On success set the cookie and return `{ ok: true }`. On failure return **`401 invalid_credentials`** — the same message whether the email is unknown or the password is wrong, so the endpoint isn't an account-existence oracle. Compare against a dummy hash when the user is not found so the timing doesn't leak either.
- `POST /admin/logout` — clear the cookie, return `{ ok: true }`.
- `GET /admin/me` — return `{ email }` from the verified token, or `401 unauthorized`.
- `requireAuth` middleware — verify the cookie, `401` on missing/expired/invalid, and stash `{ sub, email }` on the context for handlers.

There is exactly one admin user. Do not build registration, password reset, roles, or invitations — `prompts/PLAN.md` scopes this to a single owner login and anything more is out of scope.

## Task 3 — Public routes (`server/routes/public.ts`)

- `GET /cars` → `{ cars: CarDTO[] }`, ordered by `sortOrder` asc then `name` asc. Fetch cars, images, locations **and availability blocks** and assemble in memory (8–30 cars; a join plus grouping or a few queries are all fine — do **not** do N+1 per car). Every car embeds its `location` object and its `blocks`, so the browser can filter by city and by date without a second request. **Do not add `?city=` or `?from=/?to=` query parameters**: the fleet is small, the client filters locally, and params would fragment the 60s edge cache for no gain (PLAN.md Amendments 1 and 2).
  - `blocks` uses the **public** `BlockedRangeDTO` shape — `{ startDate, endDate }`, sorted by `startDate` ascending. No `id`, no `carId`, and above all **no `note`**: that is the owner's private annotation and this endpoint is world-readable and CDN-cached.
  - **Drop blocks that ended before today** (`endDate <= todayInIndia()`) rather than shipping years of history to every visitor. They are dead weight in a cached payload and no customer-facing calculation can use them. Keep future and current ones in full.
- `GET /cars/:id` → `{ car: CarDTO }` or `404 not_found`.
- `GET /locations` → `{ locations: LocationDTO[] }`, **`isActive` rows only**, ordered by `sortOrder` asc then `city` asc. An empty array is a valid answer before the owner has created any branch — do not 404 and do not invent a default city.
- `GET /settings` → `{ settings: SettingsDTO }`. If the row is missing, return `404 not_found` with a message pointing at `npm run seed:settings` — do not fabricate defaults, because a silently-invented phone number would send customers' bookings into the void.
- `GET /health` → `{ ok: true, db: boolean }` (preserve P00's behaviour).

**Cache headers** — set on these five public routes only:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=86400
```

This is the deliberate compromise recorded in `prompts/PLAN.md` Phase 3: public visitors may see an owner's edit up to 60s late, while `stale-while-revalidate` means they never wait on a cold database. Do a `vary` on nothing, and make sure **no admin route ever gets a cacheable header** — every `/admin/*` response must carry `Cache-Control: no-store`. Apply that via middleware on `/admin/*` so it cannot be forgotten.

## Task 4 — Admin car CRUD (`server/routes/cars.ts`)

- `POST /admin/cars` — body is `CarInput` with `id` optional; slugify `name` when absent, resolve collisions via `uniqueSlug`. `409 conflict` if an explicitly-supplied id already exists. Default `sortOrder` to `max(sortOrder) + 1` so new cars land at the end of the fleet rather than jumping to the front.
- `PATCH /admin/cars/:id` — partial update, `404` if unknown. Bump `updatedAt`. Only touch the columns actually present in the body: a zod schema with every field `.optional()`, and distinguish "absent" from "explicitly null" so the owner can clear `driverPricePerDay` back to inheriting the settings default.
- `DELETE /admin/cars/:id` — deletes the car; `car_images` rows cascade. **Also destroy each of that car's Cloudinary assets** (see Task 5) so deleting a car doesn't silently burn the free-tier storage quota forever. If a Cloudinary destroy fails, still complete the DB delete and log the orphan — do not fail the whole request over cleanup.

Validation rules worth enforcing (all via zod, returning `422 validation_failed` with the field path): money fields are non-negative integers; `seating` is 1–60 if present; `year` is 1980–2100 if present; `name` is non-empty; `tags` is an array of non-empty strings. Note `pricePerDay: 0` **must remain valid** — it is the legitimate "owner hasn't set the price yet" state that the whole seeding strategy depends on.

`locationId` needs its own handling (CONTRACT.md §15): it is nullable, and an explicit `null` means "no branch assigned yet" — a legitimate state, not a validation error. But a **non-null id that doesn't exist** must be rejected with `422` rather than surfacing as a raw foreign-key error from Postgres. Check it against the `locations` table before writing.

## Task 5 — Images & upload signing (`server/routes/images.ts`, `server/lib/cloudinary.ts`)

**`server/lib/cloudinary.ts`** — configure the SDK from the environment exactly as CONTRACT.md §5.2 specifies:

```ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };
```

Never hardcode the credentials, and never import this module from anything under `src/` — the API secret would end up in the browser bundle. Export two helpers over it: `signUpload(params)` wrapping `cloudinary.utils.api_sign_request`, and `destroyAsset(publicId)` wrapping `cloudinary.uploader.destroy`. Validate all three env vars at module load and throw a message naming the missing one; an unconfigured SDK surfaces as a confusing `401 Unknown API key` from Cloudinary instead of an obvious local misconfiguration.

You do **not** need `cloudinary.url()` on the server — the browser builds delivery URLs itself via `src/lib/cloudinary.ts` (P00). Never return a fully-built image URL from an endpoint; return the `publicId` and let the client transform it, so the same asset can be requested at whatever width each surface actually needs.

**`POST /admin/uploads/sign`** is the interesting one. The browser uploads directly to Cloudinary; the server only signs. Vercel functions cap request bodies at ~4.5 MB, so proxying phone photos through the function would fail outright on a modern camera image.

Body `{ carId, filename }` → response `{ cloudName, apiKey, timestamp, signature, folder, publicId }`.

- `folder` is `sv-cars/<carId>` — matches what P02's migration script uses, so migrated and newly-uploaded images live together.
- Derive `publicId` from a sanitised `filename` plus a short random suffix, so re-uploading `main_front_1.webp` never overwrites the existing asset. Content-addressed-ish URLs are what let the CDN cache immutably (`prompts/PLAN.md` Phase 4).
- Sign with `cloudinary.utils.api_sign_request({ timestamp, folder, public_id }, CLOUDINARY_API_SECRET)`. **Sign exactly the parameters the client will send, and no more** — a signature covering fewer params than the upload request lets a caller alter the untouched ones.
- Reject a `carId` that doesn't exist with `404`, so you can't scatter assets under folders for nonexistent cars.

**`POST /admin/cars/:id/images`** — persist `{ publicId, width, height, blurDataUrl, kind, alt? }` after the browser's upload succeeds. Assign `sortOrder = max + 1`. If the car currently has no images, set `isPrimary: true` on this one automatically — otherwise a freshly-created car would render with no card image.

**`PATCH /admin/cars/:id/images/reorder`** — body `{ order: string[] }` of image ids. Validate the set matches that car's images exactly (no missing, no foreign, no duplicates → `422`) and rewrite `sortOrder` **in a transaction**. Watch the unique `(carId, sortOrder)` index: write to negative or offset values first, or defer the constraint, or the intermediate state will violate it. This is the single most likely bug in your slice.

**`PATCH /admin/images/:imageId`** — `{ isPrimary?, kind?, alt? }`. Setting `isPrimary: true` must clear the flag on that car's other images, in a transaction.

**`DELETE /admin/images/:imageId`** — delete the row and destroy the Cloudinary asset. If the deleted image was primary and others remain, promote the lowest `sortOrder` to primary so the card never goes blank.

## Task 6 — Branches (`server/routes/locations.ts`)

This is the multi-city amendment (CONTRACT.md §15, PLAN.md Amendment 1). The owner enters a city, an office address in plain text, and a map link; each car points at one branch.

- `GET /admin/locations` → `{ locations: LocationDTO[] }` **including inactive ones**, so the owner can re-enable a city he switched off. The public `GET /locations` filters to active.
- `POST /admin/locations` — `LocationInput`. `id` optional: slugify `city` when absent and resolve collisions with `uniqueSlug` (the same helper as cars — a second office in Kadapa becomes `kadapa-2`). Default `sortOrder` to `max + 1`.
- `PATCH /admin/locations/:id` — partial, `404` if unknown, same absent-versus-explicitly-null discipline as cars so the owner can clear a per-branch phone back to inheriting the global one.
- `DELETE /admin/locations/:id` — **refuse with `409 conflict` while any car still references it**, and put the count in the message (`"3 cars are still assigned to this branch"`). Repeat with `?force=true` to null those cars' `locationId` and then delete. This guard is deliberate: a silent delete would drop those cars out of every city-filtered view with nothing to explain why.

Validation, all zod → `422`:

- `city` non-empty, trimmed.
- `addressShort` non-empty — it is the `Pickup:` line in the WhatsApp message, so an empty one silently breaks bookings.
- `whatsappPhone` nullable; when present, **digits only including the country code** (reject or normalise out `+`, spaces and dashes), exactly like `settings.whatsappPhone`, because `src/lib/booking.ts` interpolates it straight into a `wa.me` URL.
- **`directionsUrl` nullable, and when present it must parse as an absolute `http://` or `https://` URL.** Reject `javascript:`, `data:`, `vbscript:` and relative values. This value is pasted by the owner and rendered into an `href`, so an unvalidated scheme is stored XSS against the owner's own browser (CONTRACT.md §15.3). Do not try to whitelist Google's domains — the client may legitimately paste an Apple Maps, OSM or shortened link — validate the *scheme*, and let `directionsHref()` re-check at render time.
- `isActive` boolean, `sortOrder` non-negative integer.

## Task 7 — Availability blocks (`server/routes/availability.ts`)

Amendment 2 (CONTRACT.md §16). These five endpoints are how the owner records when a car is out. **Read §16.1 before writing a single comparison** — every rule there exists because the alternative produces an off-by-one that a customer sees.

- `GET /admin/availability?from=&to=` → `{ blocks: AvailabilityBlockDTO[] }` for the **whole fleet**, every block overlapping `[from, to)`. This is the month grid's only data source and it must stay one request: P09 renders 8+ cars × 31 days from it. Default the window to the current month when the params are absent; reject a window wider than ~1 year with `422`.
- `GET /admin/cars/:id/availability` → `{ blocks: AvailabilityBlockDTO[] }`, sorted by `startDate`, `404` if the car is unknown.
- `POST /admin/cars/:id/availability` — `{ startDate, endDate, note? }` → `{ block }`.
- `PATCH /admin/availability/:blockId` — partial; re-run the overlap check against the *other* blocks of the same car, excluding the row being edited. Forgetting that exclusion makes every edit collide with itself.
- `DELETE /admin/availability/:blockId` → `{ ok: true }`. No guard needed: deleting a block just frees the car up.

Validation, zod → `422` with the field path:

- `startDate` and `endDate` match `^\d{4}-\d{2}-\d{2}$` **and** are real calendar dates. `2026-02-30` passes a regex and is not a date — parse and confirm it round-trips.
- **`endDate > startDate`**, strictly. Equal dates are rejected: a zero-length block means nothing, and a one-day block is `05→06` because the end is exclusive.
- `note` optional, nullable, trimmed, max ~200 chars.
- A block may start in the past — the owner correcting last week's record is legitimate. Do not force `startDate >= today`.

**Overlap is a `409 conflict`, not a silent merge.** Two blocks on one car may not intersect (half-open: `aStart < bEnd && bStart < aEnd`). Return the conflicting block's dates in the message so P09 can say *"already blocked 05–08 Sep"*. Note that **adjacency is not overlap**: `05→08` and `08→12` are legal neighbours, and that is exactly why the end date is exclusive. If your check rejects those, you used `<=` where `<` belongs.

Two things worth stating because they are easy to get wrong from the server side:

1. **Do not compute availability on the server.** No `isAvailable` boolean in any response. The client derives status through `carAvailability()` from the shared helper, so the admin panel, the fleet page and the detail page cannot disagree. Your job is to store and return spans.
2. **`todayInIndia` is a client concept but you need the same one** for the "drop expired blocks" filter on `GET /cars`. Compute it server-side in `Asia/Kolkata`, not in the server's own timezone — Vercel runs in UTC, and at 05:30 IST the two disagree about what day it is.

## Task 8 — Settings (`server/routes/settings.ts`)

`PUT /admin/settings` — full replace of the single row, zod-validated. `whatsappPhone` must be digits only including country code (reject `+`, spaces, dashes — or normalise them out; either way what's stored must be `wa.me`-safe, because `src/lib/booking.ts` interpolates it straight into a URL). `pickupAddress` non-empty. The three defaults are non-negative integers.

Note that since the amendment, `settings.whatsappPhone` and `settings.pickupAddress` are the **fallbacks** used when a car has no branch or a branch has no phone (CONTRACT.md §15.5). They are still required and still validated — they just aren't the only source any more.

---

## Verify your slice

You can test independently of the other four sessions:

```bash
npm run db:push          # if the schema isn't on Neon yet and you have DATABASE_URL
npm run dev:api          # port 3001
curl localhost:3001/api/health
curl localhost:3001/api/cars
curl localhost:3001/api/locations                # [] before P02 seeds — that is correct
curl -i -X POST localhost:3001/api/admin/login -H 'content-type: application/json' -d '{"email":"...","password":"..."}'
curl -i localhost:3001/api/admin/me            # 401 without the cookie
curl -i -b 'sv_session=...' localhost:3001/api/admin/me
```

If P02 hasn't run the image migration yet, `GET /cars` returning `{ cars: [] }` is a correct and expected result. Create a car via `POST /admin/cars` to test the rest.

Write a `server/README.md` documenting every endpoint with a sample request and response — P06, P07 and the human all read it.

## Acceptance

1. Every endpoint in CONTRACT.md §8 exists with exactly the specified shape.
2. `npx tsc --noEmit` shows **no errors originating in `server/`** (errors from other sessions' in-progress files are expected — ignore them).
3. Public GETs carry `s-maxage=60, stale-while-revalidate=86400`; every `/admin/*` response carries `no-store`.
4. An unauthenticated request to any `/admin/*` route returns `401` — check several, not just one.
5. No secret, hash, stack trace or connection string appears in any response body.
6. Reorder is transactional and does not trip the unique `(carId, sortOrder)` index.
7. `GET /cars` embeds each car's `location` object; `GET /locations` returns active branches only.
8. `POST /admin/locations` with `directionsUrl: "javascript:alert(1)"` returns `422`, and `DELETE` on a branch that still has cars returns `409` with the count.
9. `GET /cars` embeds `blocks` as `{ startDate, endDate }` only — **grep the response for `note` and `id` inside `blocks` and find nothing** — and expired blocks are absent.
10. Overlapping blocks return `409`; **adjacent ones (`05→08` then `08→12`) both succeed**; `endDate == startDate` returns `422`.

## Commit

Only your paths: `git add server/ && git commit -m "feat(api): Hono backend with JWT auth, car CRUD, image management and upload signing"`

## Report back

The endpoint list as built, any deviation from CONTRACT.md §8 (with the reason), how you solved the reorder/unique-index problem, and anything you needed from a file you don't own.
