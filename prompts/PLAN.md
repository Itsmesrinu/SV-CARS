# Approved Plan — Backend for Sri Venkateshwara Cars

> Status: **APPROVED** · Date approved: 2026-09-03 · **Amended 2026-09-03 (multi-city branches) and 2026-09-05 (availability calendar + booking dates) — see the amendments at the end**
> This is the frozen, agreed plan. Do not re-litigate it inside implementation sessions.
> If something here turns out to be wrong, stop and report it — do not silently redesign.

## Stack

Neon Postgres · Drizzle ORM · Hono on Vercel serverless functions · Cloudinary · JWT cookie auth · existing Vite SPA preserved

## Decisions locked (from requirements discussion)

| Decision | Choice | Why |
| --- | --- | --- |
| Database | **Neon Postgres** | Real Postgres, never idle-pauses (Supabase free pauses after ~7 days idle), portable |
| API shape | **Vercel serverless + Vite SPA** | Keeps existing frontend untouched; no free-tier spin-down cold starts |
| Images | **Cloudinary** | Free tier, global CDN, automatic AVIF/WebP + URL-param resizing, least code |
| Admin auth | **Single owner, DIY JWT cookie** | One admin user, no vendor, no monthly cost |
| Pricing data | **Owner enters in admin** | `docs/copilot-instructions.md` forbids inventing data. Seed at `pricePerDay: 0`; UI already hides zero prices |
| Phase 1 scope | **Cars CRUD + images + auth** | Enquiry logging + Settings UI deferred |
| Admin UI | **Rebuild on the real `CarDTO` type** | Keep exact visuals per `docs/design-system.md`; drop the fake `Vehicle` type |
| Dead code | **Delete stale Stitch exports** | Four duplicate copies of the WhatsApp builder otherwise |
| Payments | **NONE — WhatsApp deep link only** | Explicit requirement. No payment gateway, no checkout, no Razorpay/Stripe |

## Phase 0 — Cleanup

Delete `src/pages/admin/`, `src/pages/booking/`, `src/pages/car_details/`, `src/pages/all_cars/` — unreferenced by `src/App.tsx`, each carrying its own `package.json` and a duplicate WhatsApp builder. Also drop the dead `process.env.GEMINI_API_KEY` define in `vite.config.ts`, the AI Studio `.env.example`, and the leftover `main.py` / `.python-version` from a uv template.

## Phase 1 — Schema

`db/schema.ts` with Drizzle. Covers every field in `docs/data-model.md` plus what the UI already renders:

- **`cars`** — `id` (slug), `name`, `carType`, `seating`, `fuel`, `transmission`, `year`, `description`, `pricePerDay`, `driverPricePerDay`, `kmLimitPerDay`, `extraKmCharge`, `selfDrive`, `withDriver`, `availability`, `deliveryAvailable`, `locationId` FK, `tags[]`, `isFeatured`, `sortOrder`, timestamps
- **`car_images`** — `carId` FK cascade, `publicId`, `width`, `height`, `blurDataUrl` (LQIP), `kind`, `sortOrder`, `isPrimary`
- **`locations`** *(amendment 1)* — `id` (slug), `city`, `officeName`, `addressShort`, `addressFull`, `directionsUrl`, `whatsappPhone`, `isActive`, `sortOrder`, timestamps
- **`car_availability_blocks`** *(amendment 2)* — `carId` FK cascade, `startDate` (inclusive), `endDate` (exclusive), `note` (admin-only), timestamps
- **`settings`** — single row: `whatsappPhone`, `pickupAddress`, and the defaults currently hardcoded (`driverPricePerDay`, `kmLimitPerDay`, `extraKmCharge`)
- **`admin_users`** — `email`, `passwordHash` (bcrypt)

Per-car pricing columns **override** the settings defaults, so `driverRate = 1000` stops being a magic number in four files.

## Phase 2 — Image migration

`scripts/migrate-images.ts` (run once locally via `tsx`, already a devDependency):

Walks the 8 folders in `public/` → uploads each `.webp` to Cloudinary under `sv-cars/<carId>/` → reads real dimensions and generates a tiny LQIP via `sharp` → inserts `cars` + `car_images` rows, **preserving the exact image order already curated in `src/data/carImageMap.ts`** (including the `inside_2.jpg.webp` double-extension and Glanza's missing `inside_3`). Idempotent, so reruns are safe.

Cars seed at `pricePerDay: 0` — the fleet cards already hide zero prices (`src/pages/AllCarsPage.tsx:46`), so nothing fake ships.

## Phase 3 — API (`api/[[...route]].ts`, Hono)

Public (edge-cached): `GET /api/cars`, `GET /api/cars/:id`, `GET /api/settings`

Admin (httpOnly JWT cookie): login/logout/me · cars create/update/delete · `POST /api/admin/uploads/sign` · image add/reorder/patch/delete · settings update

Two things worth calling out:

- **Signed direct-to-Cloudinary upload.** The browser uploads straight to Cloudinary using a signature from our API. Vercel functions cap request bodies at 4.5 MB — piping phone photos through them would fail outright. This also makes uploads faster.
- **Caching.** Public GETs get `s-maxage=60, stale-while-revalidate=86400`; the admin panel fetches with `no-store` so the owner sees saves instantly. `docs/admin-rules.md` says changes must hit customer pages "immediately" — this gives ≤60s for visitors. True instant purge would need Next.js `revalidateTag`, i.e. the migration we ruled out. **This is the one deliberate compromise in the plan.**

## Phase 4 — Frontend data layer

- `src/lib/api.ts` — typed client; `src/lib/cloudinary.ts` — URL builder
- `src/components/CarImage.tsx` — **the performance centrepiece.** Emits `srcSet`/`sizes`, `width`/`height` from the DB, LQIP blur background, `loading="lazy" decoding="async"`, and `fetchpriority="high"` for the hero + first gallery frame. Replaces every raw `<img src={car.image}>` in `AvailableCars.tsx`, `AllCarsPage.tsx`, `CarDetailsPage.tsx`, `AdminVehicleCard.tsx`
- Gallery prefetches the next image on index change, so arrows feel instant
- Skeletons sized to the real cards — zero layout shift
- `@tanstack/react-query` for caching + automatic retry

## Phase 5 — Admin rebuild

Re-enable `/admin` in `src/App.tsx` behind a login guard. Keep `AdminSidebar`, `AdminStatCard` and `AdminVehicleCard` visually identical as `docs/design-system.md` requires, but rewire to the real car type: delete `INITIAL_VEHICLES` and the `Vehicle` type, replace the Luxury/SUV/Sport filter with real categories, and make "Swap Image" / "Edit Specs" actually work. New: login page, add-car form, full pricing editor, drag-to-reorder image manager with delete.

## Phase 6 — WhatsApp consolidation

One `src/lib/booking.ts` exporting `buildWhatsAppUrl()`, consumed by both `src/pages/CarDetailsPage.tsx:98` and `src/components/booking/ConciergeSidebarContent.tsx:58`. Phone, pickup address, km limit, extra-km and driver rate all come from the car row / settings. Message format, emoji, tone and the geolocation share flow stay **exactly** as they are — no payments, nothing new for the customer to learn. Booked cars get a softened CTA.

## Phase 7 — Deploy

`vercel.json`, env vars (`DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_*`, `VITE_CLOUDINARY_CLOUD_NAME`), a `scripts/create-admin.ts` for the owner login, README runbook, and a Lighthouse pass on `/all-cars` and a car detail page.

## Explicitly deferred to a later phase

- Enquiry logging + admin Enquiries tab with `SVC-####` reference codes
- Settings **UI** (settings are seeded via script in this phase)
- WhatsApp Cloud API auto-replies / template messages (needs Meta Business approval)

## Resolved open items

1. **Public cache window** → kept at `s-maxage=60`. Admin reads bypass cache entirely.
2. **`@tanstack/react-query`** → approved as a dependency.

---

## Amendment 1 — Multi-city branches · 2026-09-03 · APPROVED

Requested by the client after P00 shipped and before Wave 1 started. The business is expanding past its single Proddatur office.

**What changes:** the owner can create **branches** — a city, an office address in plain text, and a map link — and assign each car to one. Customers pick one or more cities and see only those cars. The map link drives the **"Get Directions"** button that has been sitting dead in `src/components/OfficeLocation.tsx:38` since the Stitch import.

| Decision | Choice | Why |
| --- | --- | --- |
| Car ↔ city | **One branch per car** (`cars.locationId`) | A car physically sits at one office. `deliveryAvailable` already covers drop-off in nearby areas. A join table would add API and admin surface across four sessions for a case the client doesn't have yet |
| Customer city choice | **Multi-select, on the home page and the fleet filter bar** | Matches "let the user select multiple city names". No blocking overlay: the design system has no modal of that kind, and a gate would hurt the mobile-first traffic this client gets |
| Filter state | **URL `?cities=` first, `localStorage` second** | A filtered fleet stays shareable on WhatsApp, which is how this client's customers pass links around |
| City filtering | **Client-side, over the one cached `/api/cars` payload** | 8–30 cars. A `?city=` query param would fragment the 60s edge cache for zero benefit |
| Per-branch phone | **Optional per branch, global fallback** | A booking for a Kadapa car should reach the Kadapa number. Nullable, so today's behaviour is unchanged until the owner fills it in |
| Existing single office | **Seeded as branch #1 by P02**, all 8 cars assigned to it | Preserves today's exact strings, so the WhatsApp message stays byte-identical |
| Visual impact | **None while there is one city** | The picker renders nothing below two cities. `docs/design-system.md` forbids a redesign, and this keeps the promise literally |

**Still explicitly out of scope:** per-branch operating hours, per-branch pricing, inter-city delivery fees, distance-based search, geolocation-driven city auto-detect.

The full specification is [CONTRACT.md](./CONTRACT.md) §15. Phases 3–6 above are extended, not replaced: Phase 3 gains the `/api/locations` endpoints, Phase 5 gains the branch manager, Phase 6 gains the data-driven pickup address and directions link.

## Amendment 2 — Availability calendar & booking dates · 2026-09-05 · APPROVED

Two client requests, resolved as one feature. Requested before Wave 1 started.

1. *"The UI shows available or unavailable, but not when a booked car comes back. If a customer wants a car in future we don't tell him how many days until it's free. The owner should provide that, and it changes often."*
2. *"The customer picks a day count but not actual start and end dates. Dates are compulsory. They go to the owner as a WhatsApp message only — not to the database. The owner then sets the status: currently booked, available from so-and-so date."*

| Decision | Choice | Why |
| --- | --- | --- |
| Availability model | **Full per-car calendar** of dated blocks | Chosen over a single "available from" date. A rental car goes out repeatedly; one date can't express "out this week and again on the 20th" |
| Customer bookings | **Never stored** | The client's explicit instruction. WhatsApp is the booking system; the database only records what the *owner* says about his own cars |
| Day counting | **24-hour blocks**: `end − start`, min 1 | `05→08 Sep` = 3 days, same-day = 1 day. Matches the existing day buttons and normal Indian self-drive practice |
| Expired blocks | **Auto-expire** — the car returns to the fleet on its own | No stale "available from 8 Sep" on the 15th, and no daily admin chore. The owner extends the block if a customer keeps the car longer |
| On/off switch | **Kept**, alongside the calendar | The calendar says "back on the 8th". The toggle says "off the road, no date" — workshop, sold, papers expired. Merging them would force the owner to invent an end date |
| Date range end | **Exclusive** (`endDate` = the day it's back) | Makes `days = end − start`, makes adjacent blocks non-overlapping, and makes "available from" literally the stored value. Admin labels the fields "Out from" / "Back on" so the owner never meets the concept |
| Fleet filtering | **Customers filter `/all-cars` by their dates** | The payoff for building a calendar. Unavailable cars are muted and pushed down with "Free from …", never hidden — a visibly empty fleet loses the enquiry |
| Admin UI | **One month grid across the whole fleet**, at `/admin/availability` | The owner's operational picture in one screen. Also the largest piece of UI in the build, so it gets **its own session, P09** |
| WhatsApp message | **Exactly two new lines**, `Start Date:` and `End Date:`, after `Duration:` | The message body was frozen byte-for-byte; this unfreezes it once, minimally, because the dates are the entire point |
| Date library | **None** — native `<input type="date">` | No dependency may be added in Wave 1, and the native control is a proper mobile picker for free |

**Consequence accepted:** two customers can request the same car for the same dates, and the owner sorts it out on WhatsApp. That follows directly from not storing bookings. It is documented in the README, not treated as a bug.

**Still out of scope:** pickup/drop times of day, storing customer bookings, holds or reservations, conflict detection between customers, per-day or seasonal pricing, deposits, cancellation rules.

Full specification: [CONTRACT.md](./CONTRACT.md) §16 (and §11.1 for the message).

---

**Execution:** see [00-ORCHESTRATOR.md](./00-ORCHESTRATOR.md). Do not start any `P0x` prompt without reading [CONTRACT.md](./CONTRACT.md) first.
