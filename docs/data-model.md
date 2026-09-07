# Data model

This describes what is **actually built**. The authoritative definition is
[`db/schema.ts`](../db/schema.ts) (Drizzle → Neon Postgres); the shapes the API returns are
`CarDTO`, `LocationDTO`, `CarImageDTO`, `BlockedRangeDTO` and `SettingsDTO` in
[`src/types/api.ts`](../src/types/api.ts). Architecture and reasoning: [`backend.md`](./backend.md).

There are **five** owner-facing tables plus the login table:

| Table | One row is | Notes |
| --- | --- | --- |
| [`cars`](#cars) | A vehicle | Ids are slugs and are public URLs |
| [`car_images`](#car_images) | A photo of a car | Cascade-deletes with the car |
| [`car_availability_blocks`](#car_availability_blocks) | A span when a car is out | The owner's calendar. Cascade-deletes with the car |
| [`locations`](#locations) | A branch: one city, one office | `cars.locationId` points here |
| [`settings`](#settings) | The whole business | Exactly one row, `id = 1` |
| `admin_users` | The owner's login | `email` + bcrypt `passwordHash` (cost 12). Created by `npm run create:admin` |

Two conventions run through all of it:

- **Nullable means "not known yet", never a placeholder.** The UI hides a missing value instead
  of inventing one (`.github/copilot-instructions.md`).
- **Money is whole rupees in an integer column.** No paise, no decimals, no currency field —
  everything is ₹ and is rendered with `toLocaleString()`.

## `cars`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `text` PK | **Slug**, e.g. `toyota-innova-crysta`. This is the public `/car/:id` URL, so it is *not* editable after creation. Generated from `name` on create, with `-2`, `-3`, … on collision |
| `name` | `text` | Display name, e.g. *Toyota Innova Crysta*. The only required field when adding a car |
| `carType` | `text?` | Body type — `SUV`, `MPV`, `Mini Bus`, … Was `category` in the old front-end type |
| `seating` | `int?` | Seats, 1–60 |
| `fuel` | `text?` | `Diesel`, `Petrol`, `Petrol/CNG`, … |
| `transmission` | `text?` | Null for the whole migrated fleet — not in the source data |
| `year` | `int?` | 1980–2100. Null for the migrated fleet |
| `description` | `text?` | Free text shown on the fleet card and detail page |
| `pricePerDay` | `int` | Whole rupees. **`0` means "not set yet"** and is a valid, meaningful value: the fleet card hides the price and the WhatsApp message asks for a rate instead of quoting ₹0 |
| `driverPricePerDay` | `int?` | Per-car override. **Null inherits `settings.defaultDriverPricePerDay`** |
| `kmLimitPerDay` | `int?` | Per-car override. Null inherits `settings.defaultKmLimitPerDay` |
| `extraKmCharge` | `int?` | Per-car override, ₹/km. Null inherits `settings.defaultExtraKmCharge` |
| `selfDrive` | `bool` | Offered without a driver. Both flags are true for the current fleet |
| `withDriver` | `bool` | Offered with a driver |
| `availability` | `bool` | **The master switch.** `false` = off the road *indefinitely* (workshop, sold, papers expired) and no return date may be implied. It is **not** how a normal rental is recorded — that is `car_availability_blocks`. Never render this directly to a customer; go through `carAvailability(car)` |
| `deliveryAvailable` | `bool` | Home/hotel delivery offered for this car |
| `locationId` | `text?` FK → `locations.id` | **The branch this car rents from.** Replaces the free-text `location` field this document used to list — a branch is a real row now. Nullable, because a car can exist before the owner has created any city; such a car is visible with no city filter, excluded when one is active, falls back to `settings` for its pickup address and phone, and is counted under admin's *Needs Attention*. `on delete set null`, and the API additionally refuses to delete a branch that still has cars (`409`) |
| `tags` | `text[]` | Free-form labels, default `{}` |
| `isFeatured` | `bool` | Highlight on the home page |
| `sortOrder` | `int` | Fleet order. A new car gets `max + 1`, so it lands at the end |
| `createdAt` / `updatedAt` | `timestamptz` | `updatedAt` is bumped automatically on every write |

`GET /api/cars` returns cars ordered by `sortOrder` then `name`, each with its `images`,
`location` and current `blocks` embedded — one request renders the whole fleet.

## `car_images`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `carId` | `text` FK → `cars.id` | `on delete cascade` |
| `publicId` | `text` | Cloudinary `public_id`, e.g. `sv-cars/toyota-innova-crysta/main_front_1`. Delivery URLs are built from it; no URL is ever stored |
| `width` / `height` | `int` | The photo's **real** pixel size, used to reserve the layout box before the image loads (zero layout shift) and to cap `srcSet` widths |
| `blurDataUrl` | `text?` | ~0.5 KB `data:image/webp;base64,…` LQIP, rendered blurred under the real photo |
| `kind` | enum | `main` · `front` · `side` · `inside` · `back` · `other` |
| `sortOrder` | `int` | Gallery order, `0..n-1`. **Unique per car** — the curated order is a product decision |
| `isPrimary` | `bool` | The fleet-card thumbnail. Exactly one per car; setting a new one clears the old in the same transaction, and deleting the primary promotes the next photo |
| `alt` | `text?` | Alt text override; callers otherwise pass the car name |

## `car_availability_blocks`

The owner's calendar — what **he** says about **his** cars. A customer's booking is never stored
anywhere; see [`backend.md`](./backend.md#dates-and-availability).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `carId` | `text` FK → `cars.id` | `on delete cascade` |
| `startDate` | `date` (`'YYYY-MM-DD'`) | **Inclusive** — the first day the car is out. Labelled **"Out from"** in admin |
| `endDate` | `date` (`'YYYY-MM-DD'`) | **Exclusive** — the day the car is back and rentable again. Labelled **"Back on"**. A check constraint enforces `endDate > startDate` |
| `note` | `text?` | The owner's private annotation, e.g. *"Ravi — Hyderabad trip"*. **Admin only** — it never appears in a public response, which is CDN-cached and world-readable |
| `createdAt` / `updatedAt` | `timestamptz` | |

Out `05→08` means out on the 5th, 6th and 7th and back on the 8th, so `05→08` and `08→12` are
legal neighbours. Overlaps are refused by the API with a `409`. A block whose `endDate` has passed
simply stops containing today, so the car becomes available again with no action from the owner.

## `locations`

One branch: a city, an office address in plain text, and a map link.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `text` PK | Slug of the city, e.g. `proddatur`. A second office in one city becomes `kadapa-2` |
| `city` | `text` | The name the customer picks in the city filter. **Not unique** — two offices in one city collapse into a single customer-facing choice |
| `officeName` | `text?` | e.g. *Proddatur Branch*. Null renders as `${city} Branch` |
| `addressShort` | `text` | e.g. *Narasimhapuram, Proddatur*. **This exact string becomes the `Pickup:` line of every WhatsApp booking for a car at this branch** — the highest-consequence field in the table |
| `addressFull` | `text?` | Longer postal address for the office section. Null falls back to `addressShort` |
| `directionsUrl` | `text?` | The map link the owner pastes; what **Get Directions** opens. Validated as absolute `http(s)` on write **and** re-checked at render, because it lands in an `href`. Null is fine — the button then searches Maps for the address |
| `whatsappPhone` | `text?` | Per-branch booking number, digits only with country code. Null inherits `settings.whatsappPhone` |
| `isActive` | `bool` | `false` hides the city from customers without deleting it or reassigning its cars |
| `sortOrder` | `int` | Order of the city pills |
| `createdAt` / `updatedAt` | `timestamptz` | |

`GET /api/locations` returns **active** branches only; `GET /api/admin/locations` includes
inactive ones, or a city switched off could never be switched back on.

## `settings`

Exactly one row (`id = 1`, enforced by a check constraint). These are the values that used to be
hardcoded across the pages.

| Field | Type | Meaning |
| --- | --- | --- |
| `whatsappPhone` | `text` | Digits only with country code, e.g. `919704201247`. Interpolated straight into `wa.me`, so it is normalised on write and must be 8–15 digits. **Fallback** — a branch's own number wins |
| `pickupAddress` | `text` | e.g. *Narasimhapuram, Proddatur*. **Fallback** for the `Pickup:` line when a car has no branch |
| `defaultDriverPricePerDay` | `int` | ₹/day with a driver. Used by every car whose own value is null (seeded `1000`) |
| `defaultKmLimitPerDay` | `int` | Included km per day (seeded `100`) |
| `defaultExtraKmCharge` | `int` | ₹ per extra km (seeded `50`) |
| `updatedAt` | `timestamptz` | |

Seeded by `npm run seed:settings`, editable through `PUT /api/admin/settings`. There is no
settings **screen** in this phase — that was explicitly deferred in [PLAN.md](../prompts/PLAN.md).

## What is deliberately not modelled

No bookings, holds or reservations. No enquiry log. No payments, invoices or deposits. No
per-branch opening hours or pricing. No pickup/drop times of day. No seasonal rates. Each of
these was ruled out in [PLAN.md](../prompts/PLAN.md) — check there before adding a table.
