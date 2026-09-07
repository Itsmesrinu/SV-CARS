# Backend architecture

How the data side of Sri Venkateshwara Cars is built, and **why** — the tradeoffs matter more
than the code, because most of them look like mistakes until you know what they are protecting.

The endpoint-by-endpoint reference, with request and response bodies, lives in
[`server/README.md`](../server/README.md). This document is the map and the reasoning.

```
browser (Vite SPA)
   │  fetch /api/*  (same origin)
   ▼
Hono app — server/app.ts  ─────────────► Neon Postgres (Drizzle)
   │                                      cars · car_images · car_availability_blocks
   │                                      locations · settings · admin_users
   ├── api/[[...route]].ts     one Vercel serverless function, production
   └── scripts/dev-server.ts   @hono/node-server on :3001, local dev

browser ──── signed direct upload ────► Cloudinary
   ▲                                        │
   └────── responsive delivery URLs ────────┘
```

`createApp()` in `server/app.ts` is the only place routes are registered, so the production
function and the local dev server can never drift apart.

## The five tables

Full definitions with per-column commentary: [`db/schema.ts`](../db/schema.ts). Field-level
documentation for the owner's data: [`data-model.md`](./data-model.md).

| Table | Key | Holds |
| --- | --- | --- |
| `cars` | `id` — a **slug** (`toyota-innova-crysta`) | One row per vehicle: specs, pricing, drive modes, master availability switch, `locationId`, sort order |
| `car_images` | `id` uuid, `carId` → `cars` cascade | One row per Cloudinary asset: `publicId`, real `width`/`height`, LQIP `blurDataUrl`, `kind`, `sortOrder`, `isPrimary` |
| `car_availability_blocks` | `id` uuid, `carId` → `cars` cascade | Dated spans when a car is out: `startDate` inclusive, `endDate` exclusive, private `note` |
| `locations` | `id` — a slug of the city (`proddatur`) | One branch: `city`, `officeName`, `addressShort`, `addressFull`, `directionsUrl`, `whatsappPhone`, `isActive`, `sortOrder` |
| `settings` | `id = 1`, enforced by a check constraint | The single row of business-wide values: `whatsappPhone`, `pickupAddress`, and the default driver rate / km limit / extra-km charge |
| `admin_users` | `id` uuid, unique `email` | The owner's login. `passwordHash` is bcrypt, cost 12 |

Three schema decisions worth knowing:

- **Car ids are slugs, not serials.** `/car/toyota-innova-crysta` URLs are already in customers'
  WhatsApp threads. `id` is therefore not patchable; renaming a car changes its name, not its URL.
- **Nullable means "not known yet".** `transmission`, `year`, `description`, `carType` and
  `locationId` are null for most of the migrated fleet, and the UI hides what is missing.
  Inventing a plausible value is forbidden (`.github/copilot-instructions.md`).
- **Null in a per-car pricing column means "inherit the settings default".** That is what
  removed the hardcoded `driverRate = 1000`, `100 km/day` and `₹50/km` from four separate files.
  `effectiveDriverRate()` and friends in `src/lib/carHelpers.ts` resolve it in exactly one place.

`car_images` carries a **unique index on `(carId, sortOrder)`** — gallery order is a curated
product decision, so two photos may not share a position. That constraint is also why reordering
is a two-phase transaction; see [The reorder problem](#the-reorder-problem).

## Auth model

One owner, no vendor, no monthly cost.

- `POST /api/admin/login` verifies the bcrypt hash and sets `sv_session`: **httpOnly**,
  `sameSite=Lax`, `path=/`, `secure` in production only, 7-day expiry. The value is a JWT signed
  HS256 with `JWT_SECRET`, payload `{ sub, email, exp }`.
- One middleware guards `/api/admin/*`. The only exceptions are `login` and `logout` — a browser
  holding an expired cookie must still be able to clear it.
- The cookie is httpOnly by design, so the SPA cannot read it. `RequireAdmin` in `src/App.tsx`
  therefore *asks the API* (`GET /api/admin/me`) instead of inspecting the browser, and fails
  closed if the request fails.
- A wrong email and a wrong password return the same `401 invalid_credentials`, so the endpoint
  is not an account-existence oracle.
- Every `/api/admin/*` response is `Cache-Control: no-store`, applied by middleware so it cannot
  be forgotten on a new route.

Admin routes live outside the customer layout (`src/App.tsx`) — no customer navbar or footer ever
frames the dashboard, per [`admin-rules.md`](./admin-rules.md).

## The image pipeline

The performance centrepiece, and the part with the most moving pieces.

```
1  browser   shrinks the file to 16px wide on a canvas -> blurDataUrl   (src/lib/lqip.ts)
2  browser   POST /api/admin/uploads/sign               -> signature, folder, publicId
3  browser   POST multipart straight to Cloudinary      -> public_id, width, height
4  browser   POST /api/admin/cars/:id/images            -> row persisted
5  customer  <CarImage> builds f_auto,q_auto,w_… URLs   (src/lib/cloudinary.ts)
```

**Why the browser uploads directly.** Vercel caps a function request body at ~4.5 MB and a
single phone photo clears that on its own, so piping uploads through the API would fail outright
for real inputs. The server only ever signs; it never sees the bytes. The signature covers
`timestamp`, `folder` and `public_id` and nothing else.

**Why the LQIP is generated in the browser.** `sharp` is a Node addon and cannot run there. The
migration script (`scripts/migrate-images.ts`) uses `sharp`; admin uploads use a canvas. Both
produce the same `data:image/webp;base64,…` string, ~0.5 KB, stored on the row.

**Why we store `width` and `height`.** They let `<CarImage>` reserve the exact box before any
bytes arrive — the `aspect-ratio` on the wrapper plus intrinsic `width`/`height` on the `<img>`
means zero layout shift. That is also why `migrate-images` reads real dimensions from the file
rather than assuming any.

**Why the URL builder is hand-written** (`src/lib/cloudinary.ts`) rather than the Cloudinary SDK:
the SDK is a server-side dependency, and delivery URLs are pure string concatenation. Pulling it
into the browser bundle would ship weight for nothing — and, worse, invite someone to call
`cloudinary.config()` (which needs the API secret) from client code. `server/lib/cloudinary.ts`
is the only module that reads `CLOUDINARY_API_SECRET`, and nothing under `src/` may import it.

Delivery always emits `f_auto,q_auto` so browsers negotiate AVIF/WebP, with `srcSet` across
`[400, 640, 800, 1200, 1600]` filtered to the image's real width — a 400px card never downloads
a 1600px file. Fixed-height surfaces (fleet cards, home carousel) additionally use `c_auto,g_auto`
so Cloudinary picks a subject-preserving crop instead of `object-fit` slicing the front off a car.

**Deleting an image destroys the Cloudinary asset too** (`{ invalidate: true }`), best-effort: a
failed destroy is logged as an orphan and does not fail the delete, because leaving the owner
unable to remove a photo is worse than leaving a stray file. Note that a *derived* URL already
cached at the CDN edge can still answer for a few minutes after the original is gone; the asset
itself is deleted immediately.

### The reorder problem

`car_images` has a unique index on `(carId, sortOrder)`. Writing new positions in a loop trips it
the instant two images swap — the first write lands on a position the second image still holds.

`PATCH /api/admin/cars/:id/images/reorder` therefore runs two phases in **one** atomic request:
every image first moves to a negative position (unique among themselves, and no real row is ever
negative), then to its final `0..n-1`. No intermediate state contains a duplicate. It uses
`db.batch()` rather than `db.transaction()` because Neon's HTTP driver has no interactive
transactions — which is all this needs, since no statement depends on another's result. The
primary-image swap uses the same mechanism, so a car can never show two primaries or none.

## Dates and availability

Two independent concepts that must never be merged:

| | `cars.availability` (boolean) | `car_availability_blocks` (dated spans) |
| --- | --- | --- |
| Means | Off the road **indefinitely** — workshop, sold, papers expired | Out **until a known date** |
| Set by | The Available/Booked switch on the dashboard | The availability calendar |
| Return date | None, and none may be implied | `endDate` |

The customer-facing status is derived from **both**, and only through `carAvailability(car)` in
`src/lib/availability.ts`. Rendering `car.availability` directly is a bug: it shows "Available"
for a car that is out until Friday.

Four rules hold everywhere, client and server:

1. **Every date is a `'YYYY-MM-DD'` string** — `date` columns in Postgres (`mode: 'string'`, so
   Drizzle never hands back a `Date` built in the server's zone), strings in DTOs, URLs and props.
2. **`startDate` inclusive, `endDate` exclusive.** Out `05→08` means out on the 5th, 6th and 7th
   and **back on the 8th**. This is what makes `days = end − start`, makes back-to-back rentals
   (`05→08` then `08→12`) legal neighbours rather than a conflict, and makes "available from"
   literally the stored `endDate`. Admin labels the fields **"Out from"** and **"Back on"** so
   the owner never meets the concept.
3. **"Today" is always `Asia/Kolkata`.** Vercel runs in UTC and a customer may open the site from
   anywhere; `todayInIndia()` passes an explicit `timeZone` to `Intl.DateTimeFormat` and is the
   only source of today in the app. Internal parsing is at UTC **noon**, so no offset can roll a
   date backwards across midnight.
4. **Past blocks expire by themselves.** A block that ended yesterday no longer contains today,
   so the car returns to the fleet with no action from the owner. `GET /api/cars` omits blocks
   whose `endDate` is on or before today; the admin endpoints keep them, because the owner's
   record of where his car has been is his.

Overlapping blocks are rejected by the API with a `409` naming the conflicting dates, rather than
by a database exclusion constraint — that would need the `btree_gist` extension and could only
ever produce an opaque error message.

**Customer bookings are never stored.** The only availability data in the database is what the
*owner* said about his own cars. A customer's dates travel to him in a WhatsApp message and
nowhere else. The accepted consequence is that two customers can request the same car for the
same dates and the owner arbitrates; there is deliberately no hold, queue or conflict detection.
Do not add a bookings table without the owner's say-so.

## Branches (multi-city)

`cars.locationId` → `locations.id`, one branch per car. A car physically sits at one office, and
`deliveryAvailable` already covers dropping it off nearby, so a join table would have added API
and admin surface for a case the business does not have.

What a branch changes for the customer: which cars the city filter shows, the address on the
office section, the map iframe, the **Get Directions** target, and — for a booking — the
`Pickup:` line and the `wa.me` number (`bookingPhone()`, `pickupAddress()`; both fall back to
`settings` when the branch has no phone or the car has no branch).

**City filtering happens client-side** over the one cached `/api/cars` payload. There is
deliberately no `?city=` parameter: for a fleet of eight to thirty cars it would fragment the
60-second edge cache for no benefit, and every car already ships its branch embedded. The
selection lives in the URL (`?cities=proddatur,kadapa`) with `localStorage` as a fallback memory,
so a filtered fleet stays shareable on WhatsApp — which is how this client's customers pass links
around.

**Deleting a branch is guarded.** `cars.locationId` is `on delete set null`, so an unguarded
delete would silently drop those cars out of every city-filtered view with nothing on screen to
explain why. `DELETE /api/admin/locations/:id` therefore refuses with **`409`** and reports how
many cars still reference the branch. The owner reassigns them, deactivates the branch instead
(`isActive: false`, which hides the city from customers but keeps its cars), or repeats the call
with `?force=true`, which nulls those cars' `locationId`.

**`directionsUrl` is validated on write, and again at render.** The owner pastes that value and
the browser navigates to it, so it is untrusted input that lands in an `href`:

- `POST`/`PATCH /api/admin/locations` accept only absolute `http://` or `https://` URLs and
  reject `javascript:`, `data:`, `vbscript:` and relative values with `422`. Only the *scheme* is
  checked — an Apple Maps, OpenStreetMap or shortened link is legitimate.
- `directionsHref()` re-checks the scheme at render time and falls back to a derived Google Maps
  search on the address when the stored value is not http(s). Two layers, because a row may
  predate the validation.
- Every external map link opens with `target="_blank" rel="noopener noreferrer"`.

The map **iframe** is derived from the address rather than from `directionsUrl`, for two reasons:
that form needs no Maps API key, and a pasted `maps.app.goo.gl/…` share link cannot be embedded
at all. It also means stored data can never point the iframe at another origin.

With **one** active city, no picker renders anywhere — every customer page looks exactly as it did
before branches existed. `docs/design-system.md` forbids a redesign, and this keeps that promise
literally.

## The 60-second public cache

The five public GETs are sent with:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=86400
```

So Vercel's CDN serves the fleet from the edge, and an admin change can take **up to 60 seconds**
to reach visitors. The admin panel reads everything with `cache: 'no-store'`, so the owner always
sees his own edits immediately — the delay is only for anonymous visitors.

[`admin-rules.md`](./admin-rules.md) asks that changes reach customer pages "immediately". This is
the one deliberate compromise in the build. True instant invalidation would need tag-based
revalidation (`revalidateTag`), which means Next.js — a framework migration that was explicitly
ruled out for a site whose brief was "do not redesign, keep the existing Vite SPA". Sixty seconds
of staleness on a car's price is a smaller cost than that migration, and `stale-while-revalidate`
keeps the page instant while the refresh happens behind it.

**If you change this header, understand what you are trading.** Lowering `s-maxage` to 0 makes
every fleet visit a database round trip through a serverless function — slower for customers and
straight into Neon's free-tier compute budget. That is the wrong direction. If the owner ever
needs true instant publish, the honest fix is a revalidation hook, not a smaller number.
