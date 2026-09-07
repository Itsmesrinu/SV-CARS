# `server/` — the API

A [Hono](https://hono.dev) app over [Neon Postgres](https://neon.tech) (Drizzle), with
single-owner JWT cookie auth and Cloudinary upload signing. Built by **P01** against
[`prompts/CONTRACT.md`](../prompts/CONTRACT.md) §8 (API surface), §12 (env) and §13 (dev topology).

## How it runs

`createApp()` in [`app.ts`](./app.ts) is the only place routes are registered. Two adapters wrap it:

```
scripts/dev-server.ts  ──serve()──┐
                                  ├──> createApp()   ← every route lives here
api/[[...route]].ts    ──handle()─┘
```

```bash
npm run dev:api     # @hono/node-server on :3001
npm run dev:all     # the above plus Vite on :3000, which proxies /api -> :3001
curl localhost:3001/api/health
```

Every path below is prefixed with `/api`.

## Layout

| File | What it holds |
| --- | --- |
| `app.ts` | `createApp()`: middleware order, the admin guard, router mounting |
| `lib/auth.ts` | JWT sign/verify, the `sv_session` cookie, `requireAuth` |
| `lib/cloudinary.ts` | SDK config from env, `signUpload`, `destroyAsset` |
| `lib/dates.ts` | `todayInIndia()` and half-open date maths — the server twin of `src/lib/availability.ts` |
| `lib/errors.ts` | `HttpError`, the `{ error: { code, message } }` body, `onError` |
| `lib/mappers.ts` | DB rows → DTOs |
| `lib/queries.ts` | `loadCarDTO`, existence checks, `max(sortOrder) + 1` |
| `lib/slug.ts` | `slugify`, `uniqueSlug` |
| `lib/validate.ts` | `parseBody` + the shared zod field primitives |
| `routes/*.ts` | One file per area; each exports a `Hono` router |

## Conventions

**Errors.** Every failure is `{ "error": { "code": "...", "message": "..." } }`. Codes are stable
and are what a client should switch on: `unauthorized`, `invalid_credentials`, `not_found`,
`validation_failed` (422), `conflict` (409), `internal` (500). No stack trace, Postgres message or
connection string ever reaches a response body; the real cause is logged server-side.

**Caching.** The five public GETs carry `Cache-Control: public, s-maxage=60,
stale-while-revalidate=86400`. Every `/api/admin/*` response carries `Cache-Control: no-store`,
applied by middleware so it cannot be forgotten.

**Auth.** One middleware guards `/api/admin/*`. The only unauthenticated admin routes are
`login` and `logout` (a browser holding an expired cookie must still be able to clear it).
The cookie is `sv_session`: `httpOnly`, `sameSite=Lax`, `path=/`, `secure` in production only,
7-day expiry, HS256 over `JWT_SECRET`, payload `{ sub, email, exp }`.

**Dates.** `'YYYY-MM-DD'` strings everywhere, `[startDate, endDate)` half-open. Out `05→08` means
out on the 5th, 6th and 7th and back on the 8th, so `05→08` and `08→12` are legal neighbours.
"Today" is always computed in `Asia/Kolkata`, never in the server's zone (Vercel runs in UTC).

**Never invent data.** Nullable columns stay null. `pricePerDay: 0` is a valid, meaningful value.

---

# Public endpoints

## `GET /api/cars`

Every car, ordered by `sortOrder` then `name`, each with its branch and its availability blocks
embedded. One request renders the whole fleet; the browser filters by city and by date locally.
There are deliberately **no** `?city=` / `?from=` parameters — they would fragment the 60s edge
cache for a fleet of eight cars.

Blocks use the public `BlockedRangeDTO` shape only, and blocks whose `endDate` is on or before
today are omitted.

```bash
curl localhost:3001/api/cars
```

```json
{
  "cars": [
    {
      "id": "toyota-innova-crysta",
      "name": "Toyota Innova Crysta",
      "carType": "MPV",
      "seating": 7,
      "fuel": "Diesel",
      "transmission": null,
      "year": null,
      "description": null,
      "pricePerDay": 0,
      "driverPricePerDay": null,
      "kmLimitPerDay": null,
      "extraKmCharge": null,
      "selfDrive": true,
      "withDriver": true,
      "availability": true,
      "blocks": [{ "startDate": "2026-09-05", "endDate": "2026-09-08" }],
      "deliveryAvailable": false,
      "location": {
        "id": "proddatur",
        "city": "Proddatur",
        "officeName": "Proddatur Branch",
        "addressShort": "Narasimhapuram, Proddatur",
        "addressFull": "Narasimhapuram village, Proddatur mandal, Kadapa district, Andhra Pradesh, India",
        "directionsUrl": null,
        "whatsappPhone": null,
        "isActive": true,
        "sortOrder": 0
      },
      "tags": [],
      "isFeatured": false,
      "sortOrder": 2,
      "images": [
        {
          "id": "6f1c…",
          "publicId": "sv-cars/toyota-innova-crysta/main_front_1",
          "width": 1600,
          "height": 1200,
          "blurDataUrl": "data:image/webp;base64,…",
          "kind": "main",
          "sortOrder": 0,
          "isPrimary": true,
          "alt": null
        }
      ],
      "createdAt": "2026-09-04T09:12:44.101Z",
      "updatedAt": "2026-09-05T06:31:02.884Z"
    }
  ]
}
```

`images` arrives sorted by `sortOrder` ascending and `blocks` by `startDate` ascending — the
contract promises both, so no caller re-sorts.

## `GET /api/cars/:id`

`{ "car": CarDTO }`, same shape as one element above. `404 not_found` for an unknown id.

## `GET /api/locations`

Active branches only, ordered by `sortOrder` then `city`. An empty array is a correct answer
before the owner has created a branch — not a 404, and never an invented default city.

```json
{ "locations": [ { "id": "proddatur", "city": "Proddatur", "…": "…" } ] }
```

## `GET /api/settings`

```json
{
  "settings": {
    "whatsappPhone": "919704201247",
    "pickupAddress": "Narasimhapuram, Proddatur",
    "defaultDriverPricePerDay": 1000,
    "defaultKmLimitPerDay": 100,
    "defaultExtraKmCharge": 50
  }
}
```

`404 not_found` if the row is missing, with a message pointing at `npm run seed:settings`.
Defaults are never fabricated: an invented phone number would send bookings into the void.

## `GET /api/health`

```json
{ "ok": true, "db": true }
```

`db` is a real round-trip to Neon. A missing or wrong `DATABASE_URL` reports `db: false` rather
than failing the request.

---

# Admin endpoints

All under `/api/admin/*`, all `Cache-Control: no-store`, all require the session cookie except
`login` and `logout`. Unauthenticated requests get `401 { "error": { "code": "unauthorized" } }`.

## `POST /api/admin/login`

```bash
curl -i -X POST localhost:3001/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","password":"…"}'
```

```
HTTP/1.1 200 OK
set-cookie: sv_session=eyJhbGciOi…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
```

```json
{ "ok": true }
```

`401 invalid_credentials` on failure — the same message whether the email is unknown or the
password is wrong, and the same timing, so the endpoint is not an account-existence oracle.

## `POST /api/admin/logout` → `{ "ok": true }` (clears the cookie)

## `GET /api/admin/me` → `{ "email": "owner@example.com" }` · `401` without a valid cookie

## `POST /api/admin/cars`

Body is `CarInput` (`CarDTO` minus `images`/`blocks`/`createdAt`/`updatedAt`, with `location`
replaced by `locationId`). Only `name` is required; everything else falls back to the column
default. `id` is optional — the server slugifies `name` and appends `-2`, `-3`, … on collision.
`sortOrder` defaults to `max + 1` so a new car lands at the end of the fleet.

```bash
curl -X POST localhost:3001/api/admin/cars -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Toyota Innova Crysta","pricePerDay":0,"locationId":"proddatur"}'
```

→ `{ "car": CarDTO }`

- `409 conflict` if an explicitly-supplied `id` already exists.
- `422 validation_failed` with the field path in the message, e.g.
  `{"error":{"code":"validation_failed","message":"pricePerDay: cannot be negative"}}`.
- A non-null `locationId` that doesn't exist is `422`, not a raw foreign-key error.

Validation: money fields are non-negative integers (`0` is valid), `seating` 1–60, `year`
1980–2100, `name` non-empty, `tags` an array of non-empty strings.

## `PATCH /api/admin/cars/:id`

`Partial<CarInput>` → `{ "car": CarDTO }` · `404` if unknown.

**Absent and `null` are different.** An absent key leaves the column alone; an explicit `null`
clears it, which is how the owner drops a per-car override back to inheriting the settings
default:

```bash
curl -X PATCH localhost:3001/api/admin/cars/toyota-innova -b cookies.txt \
  -H 'content-type: application/json' -d '{"driverPricePerDay":null}'
```

`id` is not patchable — `/car/:id` slugs are public URLs customers already hold, so a rename
would 404 links that exist in WhatsApp threads. Sending `id` is silently ignored.

## `DELETE /api/admin/cars/:id` → `{ "ok": true }`

`car_images` and `car_availability_blocks` cascade in the database. The car's Cloudinary assets
are destroyed too, best-effort: a failed destroy is logged as an orphan and does not fail the
delete.

## `POST /api/admin/uploads/sign`

The browser uploads directly to Cloudinary — Vercel caps function bodies at ~4.5 MB and a phone
photo clears that on its own — so the server only signs.

```bash
curl -X POST localhost:3001/api/admin/uploads/sign -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"carId":"toyota-innova","filename":"IMG 1234.HEIC"}'
```

```json
{
  "cloudName": "sv-cars",
  "apiKey": "3894…",
  "timestamp": 1788604800,
  "signature": "a1b2c3…",
  "folder": "sv-cars/toyota-innova",
  "publicId": "img-1234-9f3a1c07"
}
```

**How to use it.** POST to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` as
`multipart/form-data` with exactly these fields:

| field | value |
| --- | --- |
| `file` | the `File` |
| `api_key` | `apiKey` |
| `timestamp` | `timestamp` |
| `signature` | `signature` |
| `folder` | `folder` |
| `public_id` | `publicId` |

The signature covers `timestamp`, `folder` and `public_id` and nothing else — send those three
unchanged and add no other signed parameter, or Cloudinary rejects the upload.

⚠️ **The stored `publicId` is not the one in this response.** Cloudinary combines the two into
`<folder>/<publicId>` (here `sv-cars/toyota-innova/img-1234-9f3a1c07`) and returns that as
`public_id` in the upload response. **That** combined value is what you POST to the endpoint
below and what `src/lib/cloudinary.ts` builds delivery URLs from.

A `carId` that doesn't exist is `404`, so assets are never scattered under folders for
nonexistent cars. The random suffix means re-uploading `IMG_1234.HEIC` creates a second asset
instead of overwriting the first.

## `POST /api/admin/cars/:id/images`

```json
{
  "publicId": "sv-cars/toyota-innova/img-1234-9f3a1c07",
  "width": 1600,
  "height": 1200,
  "blurDataUrl": "data:image/webp;base64,…",
  "kind": "front",
  "alt": null
}
```

→ `{ "image": CarImageDTO }`. `sortOrder` is `max + 1`. If the car has no images yet, this one is
set `isPrimary: true` automatically so a freshly-created car never renders a blank card.
`blurDataUrl` must be a `data:image/…` URL or `null`; `kind` defaults to `"other"`.

## `PATCH /api/admin/cars/:id/images/reorder`

```json
{ "order": ["6f1c…", "a02b…", "9d7e…"] }
```

→ `{ "images": CarImageDTO[] }` in the new order.

The list must be exactly that car's images — no missing, no foreign, no duplicate ids, else
`422`. See "The reorder problem" below for why this is a transaction.

## `PATCH /api/admin/images/:imageId`

`{ isPrimary?, kind?, alt? }` → `{ "image": CarImageDTO }`. Setting `isPrimary: true` clears the
flag on that car's other images in the same transaction, so a car can never show two primaries
or none.

## `DELETE /api/admin/images/:imageId` → `{ "ok": true }`

Deletes the row and destroys the Cloudinary asset. If the deleted image was primary and others
remain, the lowest `sortOrder` is promoted so the fleet card never goes blank.

## `PUT /api/admin/settings`

Full replace of the single row (an upsert — the row may not exist yet on a fresh database).

```json
{
  "whatsappPhone": "919704201247",
  "pickupAddress": "Narasimhapuram, Proddatur",
  "defaultDriverPricePerDay": 1000,
  "defaultKmLimitPerDay": 100,
  "defaultExtraKmCharge": 50
}
```

→ `{ "settings": SettingsDTO }`. `whatsappPhone` is normalised to digits (`+91 97042 01247` is
stored as `919704201247`) because `src/lib/booking.ts` interpolates it straight into a `wa.me`
URL; anything that isn't 8–15 digits after normalising is `422`. `pickupAddress` must be
non-empty. Since the multi-city amendment these two are the **fallbacks** used when a car has no
branch or a branch has no phone of its own.

## Branches

### `GET /api/admin/locations`

Every branch **including inactive ones**, ordered by `sortOrder` then `city`. (The public
`GET /api/locations` filters to active — this one must not, or a city switched off could never
be switched back on.)

### `POST /api/admin/locations`

```json
{
  "city": "Kadapa",
  "officeName": null,
  "addressShort": "Nagarajupeta, Kadapa",
  "addressFull": null,
  "directionsUrl": "https://maps.app.goo.gl/…",
  "whatsappPhone": null,
  "isActive": true,
  "sortOrder": 1
}
```

→ `{ "location": LocationDTO }`. `id` is optional — the server slugifies `city`, so a second
office in Kadapa becomes `kadapa-2`. `sortOrder` defaults to `max + 1`.

Validation: `city` and `addressShort` non-empty (the latter is the `Pickup:` line of every
WhatsApp booking, so an empty one silently breaks bookings); `whatsappPhone` digits only;
**`directionsUrl` must be an absolute `http://` or `https://` URL.** The owner pastes that value
and it is rendered into an `href`, so `javascript:`, `data:`, `vbscript:` and relative values are
`422`. Only the *scheme* is checked, never the domain — an Apple Maps, OSM or shortened link is
legitimate. `''` is treated as "there isn't one" and stored as `null`.

### `PATCH /api/admin/locations/:id`

Partial, `404` if unknown, same absent-versus-`null` discipline as cars — send
`{"whatsappPhone": null}` to clear a per-branch number back to inheriting the global one.

### `DELETE /api/admin/locations/:id`

Refuses while any car still points at the branch:

```json
{
  "error": {
    "code": "conflict",
    "message": "3 cars are still assigned to this branch. Reassign them, deactivate the branch instead, or repeat with ?force=true."
  }
}
```

The guard is deliberate: `cars.locationId` is `on delete set null`, so an unguarded delete would
quietly drop those cars out of every city-filtered view with nothing on screen to explain why.
`DELETE /api/admin/locations/:id?force=true` sets those cars' `locationId` to `null` and deletes
the branch; they then fall back to `settings.pickupAddress`.

## Availability blocks

The owner's calendar — what *he* says about *his* cars. A customer's booking is never stored
anywhere; it travels to him over WhatsApp and becomes real when he blocks the dates himself.

`startDate` is inclusive, `endDate` exclusive. Admin labels these **"Out from"** and **"Back on"**.

### `GET /api/admin/availability?from=&to=`

Every block of the **whole fleet** overlapping `[from, to)`, in one request — this is the month
grid's only data source and must never fan out to one request per car. Both params default to the
current month in IST. A window wider than 366 days is `422`.

```bash
curl 'localhost:3001/api/admin/availability?from=2026-09-01&to=2026-10-01' -b cookies.txt
```

```json
{
  "blocks": [
    {
      "id": "b41f…",
      "carId": "toyota-innova-crysta",
      "startDate": "2026-09-05",
      "endDate": "2026-09-08",
      "note": "Ravi — Hyderabad trip"
    }
  ]
}
```

`note` is the owner's private annotation and appears **only** under `/api/admin/*`. The public
`/api/cars` payload carries `{ startDate, endDate }` and nothing else.

### `GET /api/admin/cars/:id/availability`

One car's blocks sorted by `startDate`, `404` if the car is unknown. Unlike the public payload
this includes past blocks — the owner's record of where a car has been is his.

### `POST /api/admin/cars/:id/availability`

```json
{ "startDate": "2026-09-05", "endDate": "2026-09-08", "note": "Ravi — Hyderabad trip" }
```

→ `{ "block": AvailabilityBlockDTO }`

- `422` if either date isn't a real calendar date (`2026-02-30` matches the pattern and is not a
  day), or if `endDate <= startDate` — a one-day block is `05→06`, and a zero-length block means
  nothing. `note` is trimmed and capped at 200 characters.
- A block **may start in the past**: the owner correcting last week's record is legitimate.
- `409 conflict` on overlap, naming the offending block:
  `{"error":{"code":"conflict","message":"Already blocked 2026-09-05 → 2026-09-08."}}`
- **Adjacency is not overlap.** `05→08` and `08→12` both succeed. That is the entire reason the
  end date is exclusive.

### `PATCH /api/admin/availability/:blockId`

Partial (`startDate`, `endDate`, `note`) → `{ "block": … }`. The overlap check runs against the
*other* blocks of the same car, with this row excluded — without that exclusion every edit
collides with itself.

### `DELETE /api/admin/availability/:blockId` → `{ "ok": true }`

No guard: deleting a block only frees a car up.

---

## Two implementation notes worth knowing

### The reorder problem

`car_images` has a unique index on `(carId, sortOrder)`. Writing each image's new position in a
loop trips it the moment two images swap: the first write lands on a position the second image
still holds.

So `PATCH /admin/cars/:id/images/reorder` runs two phases inside **one** transaction — every
image first moves to a negative position (unique among themselves, and no real row is ever
negative), then to its final `0..n-1`. No intermediate state contains a duplicate.

The transaction is `db.batch()` rather than `db.transaction()` because the `neon-http` driver has
no interactive transactions; `batch()` ships the statement list to Neon as a single atomic
request, which is all this needs since no statement depends on another's result. The same
mechanism backs the primary-image swap.

### Cloudinary configuration

`lib/cloudinary.ts` is the only module that reads `CLOUDINARY_API_SECRET`, and nothing under
`src/` may import it — a secret in the Vite module graph is a secret in the browser bundle.

Missing credentials are reported loudly at startup, naming the variables, and the throw happens
when an upload or destroy is actually attempted rather than at import. That keeps a missing image
credential from taking down `/api/health` and every public route for someone working only on the
fleet pages; the error names the missing variable either way.

## Environment

See [`.env.example`](../.env.example). The server needs `DATABASE_URL`, `JWT_SECRET`,
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. None of them may gain
a `VITE_` prefix.
