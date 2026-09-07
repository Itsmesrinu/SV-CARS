# CONTRACT — the shared interface every parallel session must obey

> **Read this file completely before writing a single line of code, in every session.**
>
> Five sessions run in parallel against one working tree. The ONLY thing keeping them
> from producing an unintegratable mess is this contract. Treat every signature below as
> frozen. If you believe a signature is wrong, **stop and report it** — do not "improve"
> it locally, because four other sessions are coding against it right now.

---

## 1. Project rules that override your own judgement

These come from `docs/*.md` and `.github/copilot-instructions.md` and are non-negotiable:

1. **Do not redesign the UI.** No new colours, typography, spacing, shadows, or card styles. `docs/design-system.md`.
2. **Do not invent data.** No fake car names, prices, locations, years, or business details. If a value is unknown, leave it null/0 and let the owner fill it in admin. `.github/copilot-instructions.md`.
3. **No payments, ever.** No Razorpay, Stripe, checkout, cart, or "Pay now" anything. Booking is a WhatsApp deep link and nothing else.
4. **₹ (Indian Rupees) everywhere.** Use `toLocaleString()` on amounts, as the existing code does.
5. **Admin controls must never be visible to customers.** `docs/admin-rules.md`.
6. **WhatsApp stays the primary booking action** and its message body format must be preserved verbatim (see §6).
7. **Prefer small, safe edits over broad rewrites.** Reuse the existing components.
8. **Cities, addresses and map links are data the owner enters — never literals in code.** The business now runs in more than one city (§15). No hardcoded `'Proddatur'`, `'Narasimhapuram, Proddatur'`, office phone, or Google Maps URL may survive anywhere in `src/`.
9. **Customer bookings are never stored.** Dates go to the owner on WhatsApp and nowhere else (§16). No bookings table, no holds, no reservations, no confirmation emails. The only availability data in the database is what the **owner** entered about his own cars.

## 2. Hard rule: file ownership

Each prompt owns an exclusive set of paths. **Never create, edit, or delete a file you do not own.** Not "just a small fix". Not "it was obviously broken". Report it in your final summary instead and let `P06-integration` handle it.

The authoritative ownership matrix is in [00-ORCHESTRATOR.md](./00-ORCHESTRATOR.md) §4.

Two consequences you must accept:

- **`npm run lint` (i.e. `tsc --noEmit`) will NOT be globally green during Wave 1.** Other sessions' files are half-written. Only judge errors that originate in *your own* files. `P06` makes the whole tree green.
- **Commit only your own paths**: `git add <your paths>` then commit. Never `git add -A` or `git commit -a`.

## 3. Shared DTO types — `src/types/api.ts`

Created by **P00**. Read-only for everyone else. This is the exact content:

```ts
export type ImageKind = 'main' | 'front' | 'side' | 'inside' | 'back' | 'other';

/**
 * A branch: one city, one office. The client creates these in admin; the
 * customer picks cities to browse by. See §15.
 */
export interface LocationDTO {
  id: string;                    // slug, e.g. 'proddatur'
  city: string;                  // 'Proddatur' — the name the customer selects
  officeName: string | null;     // 'Proddatur Branch'; null => `${city} Branch`
  addressShort: string;          // 'Narasimhapuram, Proddatur' — the WhatsApp `Pickup:` line
  addressFull: string | null;    // long postal address for the office section; null => addressShort
  directionsUrl: string | null;  // client-pasted map link for "Get Directions"; null => derived search URL
  whatsappPhone: string | null;  // digits only; null => settings.whatsappPhone
  isActive: boolean;             // false hides the city from customers without deleting it
  sortOrder: number;
}

/**
 * A span when a car is NOT rentable. Public shape — deliberately minimal:
 * no id, no note, nothing the owner typed for himself. See §16.
 *
 * `startDate` is INCLUSIVE (first day out), `endDate` is EXCLUSIVE (the day it
 * is back). A car out 05→08 Sep is unavailable on the 5th, 6th and 7th, and
 * available again ON the 8th. Read §16.1 before you write a comparison.
 */
export interface BlockedRangeDTO {
  startDate: string;   // 'YYYY-MM-DD' inclusive
  endDate: string;     // 'YYYY-MM-DD' exclusive
}

/** The admin view of the same row: adds the id and the owner's private note. */
export interface AvailabilityBlockDTO extends BlockedRangeDTO {
  id: string;          // uuid
  carId: string;
  note: string | null; // ADMIN ONLY — never leaves an /api/admin/* response
}

export interface CarImageDTO {
  id: string;              // uuid
  publicId: string;        // Cloudinary public_id, e.g. 'sv-cars/toyota-innova/main_front_1'
  width: number;
  height: number;
  blurDataUrl: string | null;  // tiny base64 data URL for LQIP
  kind: ImageKind;
  sortOrder: number;
  isPrimary: boolean;
  alt: string | null;
}

export interface CarDTO {
  id: string;                  // slug, e.g. 'toyota-innova-crysta'
  name: string;
  carType: string | null;      // 'SUV' | 'MPV' | 'Mini Bus' | ... | null
  seating: number | null;
  fuel: string | null;
  transmission: string | null;
  year: number | null;
  description: string | null;
  pricePerDay: number;                 // whole rupees; 0 means "not set yet"
  driverPricePerDay: number | null;    // null => fall back to settings default
  kmLimitPerDay: number | null;        // null => fall back to settings default
  extraKmCharge: number | null;        // null => fall back to settings default
  selfDrive: boolean;
  withDriver: boolean;
  availability: boolean;               // MASTER SWITCH. false = off the road indefinitely (§16.2)
  blocks: BlockedRangeDTO[];           // dated spans when it is out, sorted by startDate asc (§16)
  deliveryAvailable: boolean;
  location: LocationDTO | null;        // the branch this car rents from; null = not assigned yet
  tags: string[];
  isFeatured: boolean;
  sortOrder: number;
  images: CarImageDTO[];               // already sorted by sortOrder ascending
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
}

export interface SettingsDTO {
  whatsappPhone: string;               // digits only with country code, e.g. '919704201247'
  pickupAddress: string;               // FALLBACK ONLY — used when a car has no location (§15)
  defaultDriverPricePerDay: number;
  defaultKmLimitPerDay: number;
  defaultExtraKmCharge: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
```

### 3.1 Mapping the OLD `Car` shape to the new `CarDTO`

The old `src/data/cars.ts` type is going away. Both **P04** and **P05** must migrate call sites **identically**, using the helpers in §4 — do not hand-roll these mappings:

| Old field | New source |
| --- | --- |
| `car.status === 'available'` | `carAvailability(car)` — **not** the raw `car.availability` boolean. The customer-facing status is derived from the master switch *and* the calendar (§16.2) |
| `car.category` | `car.carType ?? ''` |
| `car.image` (string) | `primaryImage(car)` → `CarImageDTO \| null` |
| `car.images` (`string[]`) | `car.images` (`CarImageDTO[]`) — pass whole objects to `<CarImage>` |
| `car.type` (`('self-drive'\|'with-driver')[]`) | `driveModes(car)` |
| hardcoded `driverRate = 1000` | `effectiveDriverRate(car, settings)` |
| hardcoded `'100 km/day'` | `effectiveKmLimit(car, settings)` |
| hardcoded `'₹50/km'` | `effectiveExtraKm(car, settings)` |
| hardcoded `phone = '919704201247'` | `bookingPhone(car, settings)` — per-branch number, falling back to `settings.whatsappPhone` |
| hardcoded `'Narasimhapuram, Proddatur'` | `pickupAddress(car, settings)` — the car's branch, falling back to `settings.pickupAddress` |
| hardcoded `'Proddatur Branch'` (`CarDetailsPage.tsx:344`) | `officeLabel(car.location)` |
| hardcoded `'in Proddaturu'` marketing copy | the selected cities, or all active cities (§15) |
| the dead `Get Directions` button (`OfficeLocation.tsx:38`) | `directionsHref(location)` |

## 4. Shared helpers — `src/lib/carHelpers.ts`

Created by **P00**. Read-only for everyone else. Exact signatures:

```ts
import type { CarDTO, CarImageDTO, LocationDTO, SettingsDTO } from '@/src/types/api';

/** First image flagged isPrimary, else the lowest sortOrder, else null. */
export function primaryImage(car: CarDTO): CarImageDTO | null;

/** ['self-drive'] | ['with-driver'] | both, in that order. Empty array if neither flag is set. */
export function driveModes(car: CarDTO): ('self-drive' | 'with-driver')[];

/** Per-car value if set, otherwise the settings default. */
export function effectiveDriverRate(car: CarDTO, settings: SettingsDTO): number;
export function effectiveKmLimit(car: CarDTO, settings: SettingsDTO): number;
export function effectiveExtraKm(car: CarDTO, settings: SettingsDTO): number;

/** Total in whole rupees. driverRate is only added when mode === 'driver'. */
export function calcTotal(
  car: CarDTO,
  settings: SettingsDTO,
  days: number,
  mode: 'self' | 'driver',
): { basePrice: number; driverTotal: number; total: number };

// --- branch/location helpers (§15) ---

/** The car's branch, or null when the owner hasn't assigned one yet. */
export function carLocation(car: CarDTO): LocationDTO | null;

/** The `Pickup:` value: the car's branch `addressShort`, else `settings.pickupAddress`. */
export function pickupAddress(car: CarDTO, settings: SettingsDTO): string;

/** The number a booking for this car must reach: branch phone, else the global one. */
export function bookingPhone(car: CarDTO, settings: SettingsDTO): string;

/**
 * Cars whose branch city is in `citySlugs`. An empty array means "no filter" and
 * returns every car unchanged — never an empty list.
 */
export function filterCarsByCities(cars: CarDTO[], citySlugs: string[]): CarDTO[];
```

### 4.1 Location helpers — `src/lib/locationHelpers.ts`

Also created by **P00**, also read-only. Split by argument type: anything whose first
argument is a `LocationDTO` lives here, so P04's admin screens and P05's public pages
render a branch identically.

```ts
import type { CarDTO, LocationDTO } from '@/src/types/api';

/** URL/filter-safe form of a city name: lowercase, non-alphanumerics to single hyphens. */
export function citySlug(city: string): string;

/** 'Proddatur Branch' — `officeName` when set, else `${city} Branch`. */
export function officeLabel(location: LocationDTO): string;

/** `addressFull` when set, else `addressShort`. */
export function displayAddress(location: LocationDTO): string;

/**
 * href for a "Get Directions" button. Uses the client-supplied `directionsUrl`
 * when it is a valid http(s) URL, otherwise derives a Google Maps search from the
 * address. NEVER returns a non-http(s) URL — see §15.3.
 */
export function directionsHref(location: LocationDTO): string;

/** `src` for the office-section map iframe, derived from the address. No API key needed. */
export function mapEmbedSrc(location: LocationDTO): string;

/**
 * The customer-facing city list, deduplicated by city name and counted, sorted by
 * `sortOrder` then `city`. Two offices in one city collapse into one option whose
 * `carCount` covers both.
 */
export function cityOptions(
  locations: LocationDTO[],
  cars: CarDTO[],
): { slug: string; city: string; carCount: number }[];
```

### 4.2 Availability & dates — `src/lib/availability.ts`

Created by **P00**, read-only for everyone else. **Every date in this system is a plain
`'YYYY-MM-DD'` string** — never a `Date` object crossing a boundary, never an ISO
timestamp. Dates here are calendar days in India; a `Date` re-interpreted in the
browser's own zone is how you ship an off-by-one to a customer.

```ts
import type { BlockedRangeDTO, CarDTO } from '@/src/types/api';

export const IST_TIME_ZONE = 'Asia/Kolkata';

/** Today as 'YYYY-MM-DD' in Asia/Kolkata. The ONLY source of "today" in the app. */
export function todayInIndia(): string;

/** Plain-string date maths. No Date objects escape these. */
export function addDays(date: string, days: number): string;
export function diffDays(start: string, end: string): number;   // end - start, may be negative
export function isValidDate(value: string | null | undefined): boolean;

/** Billable days for a rental: `diffDays`, floored at 1 so same-day = 1 Day (§16.1). */
export function rentalDays(start: string, end: string): number;

/** '05 Sep 2026'. Month name, never a numeric month — DD/MM vs MM/DD is a real hazard. */
export function formatDate(date: string): string;

/** Half-open overlap: [aStart, aEnd) intersects [bStart, bEnd). */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean;

/** True when any block overlaps [start, end). */
export function isBlocked(blocks: BlockedRangeDTO[], start: string, end: string): boolean;

/** Earliest date on or after `from` that is not inside a block. */
export function nextFreeDate(blocks: BlockedRangeDTO[], from: string): string;

export type CarAvailability =
  | { kind: 'available' }
  /** Master switch off — no return date exists, so never promise one. */
  | { kind: 'unavailable' }
  /** Out today; `until` is the day it comes back, `daysAway` is from today. */
  | { kind: 'booked'; until: string; daysAway: number };

/** Derived customer-facing status for today (or `today` when supplied, for tests). */
export function carAvailability(car: CarDTO, today?: string): CarAvailability;

/** Can this car serve the whole range? Master switch on AND no overlapping block. */
export function availableForRange(car: CarDTO, start: string, end: string): boolean;

/** 'Available' | 'Booked' | 'Available in 3 days' | 'Available from 12 Sep' (§16.3). */
export function availabilityLabel(status: CarAvailability): string;
```

## 5. Cloudinary URL builder — `src/lib/cloudinary.ts`

Created by **P00**. Read-only for everyone else. Exact signatures:

```ts
export type CldFit = 'limit' | 'fill' | 'auto';

export interface CldOptions {
  width: number;
  height?: number;
  fit?: CldFit;      // default 'limit'
  quality?: string;  // default 'auto'
}

/** Single transformed URL. */
export function cldUrl(publicId: string, opts: CldOptions): string;

/** `srcSet` string across the standard widths, filtered to <= the image's natural width. */
export function cldSrcSet(publicId: string, naturalWidth: number, opts?: Omit<CldOptions, 'width'>): string;

/** The standard responsive widths used across the app. */
export const CLD_WIDTHS: readonly number[]; // [400, 640, 800, 1200, 1600]
```

Cloud name comes from `import.meta.env.VITE_CLOUDINARY_CLOUD_NAME`. Always emits `f_auto,q_auto`. The cloud name is public — that is fine and expected. **No API key or secret may ever appear in client code.**

### 5.1 Transformation strings — the exact mapping

This is a hand-built URL builder, **not** the Cloudinary SDK: the SDK is a server-side dependency and pulling it into the browser bundle would ship weight we do not need for pure string concatenation. So the mapping from the SDK's option names to the URL segments must be exact:

| SDK option (server) | URL segment (what you emit) | Used for |
| --- | --- | --- |
| `fetch_format: 'auto'` | `f_auto` | AVIF/WebP negotiation per browser. **Always present.** |
| `quality: 'auto'` | `q_auto` | Per-image quality. **Always present.** |
| `width: N` | `w_N` | Responsive widths |
| `crop: 'limit'` | `c_limit` | `fit: 'limit'` — never upscales, preserves aspect. The default. |
| `crop: 'fill'` | `c_fill` | `fit: 'fill'` — fills the box, may crop edges |
| `crop: 'auto', gravity: 'auto'` | `c_auto,g_auto` | `fit: 'auto'` — content-aware crop |

Result shape:

```
https://res.cloudinary.com/<cloudName>/image/upload/f_auto,q_auto,w_800,c_limit/<publicId>
```

**When to use `fit: 'auto'`.** The fleet cards and the home carousel render into *fixed-height* boxes (`h-28 md:h-64` in `src/pages/AllCarsPage.tsx`, `h-64` in `src/components/AvailableCars.tsx`) with `object-cover`. Letting the browser crop with `object-cover` can slice the front off a car; `c_auto,g_auto` lets Cloudinary pick the subject-preserving crop instead. Prefer `fit: 'auto'` with an explicit `width` **and** `height` for those two fixed-box surfaces, and `fit: 'limit'` everywhere else (detail gallery, thumbnails, admin grid) where the container follows the image's real aspect ratio.

### 5.2 Server-side SDK config — P01 and P02 only

The `cloudinary` npm package is used **only** on the server (P01's signing and asset destroy) and in P02's local migration script. Both must configure it from the environment — never with literals:

```ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,   // always emit https:// URLs
});
```

Factor this into a single module each session imports (`server/lib/cloudinary.ts` for P01; P02 may import that file read-only or configure its own — it is a local script, so a small duplication is acceptable there). Validate all three env vars are present at startup and fail with a message naming the missing one; a silently unconfigured SDK produces confusing `401 Unknown API key` errors from Cloudinary rather than an obvious local failure.

`secure: true` matters: without it the SDK emits `http://` URLs, which become mixed-content blocked on a deployed HTTPS site.

**Never call `cloudinary.config()` from anything under `src/`.** It requires the API secret, and a secret imported into a Vite module graph is a secret shipped in the browser bundle. P08 greps `dist/` for exactly this.

## 6. `CarImage` component — `src/components/CarImage.tsx`

Created by **P03**. Consumed by **P04** and **P05**. Exact props — code against this even before P03 lands:

```ts
export interface CarImageProps {
  image: CarImageDTO | null;
  alt: string;                     // required; callers pass e.g. `${car.name} — front`
  sizes: string;                   // required; e.g. '(max-width: 768px) 50vw, 400px'
  className?: string;              // applied to the <img>
  priority?: boolean;              // default false. true => loading="eager" + fetchpriority="high"
  fit?: 'cover' | 'contain';       // CSS object-fit. default 'cover'
  cldFit?: CldFit;                 // Cloudinary crop mode. default 'limit'
  aspect?: number;                 // override the wrapper ratio (w/h), e.g. 16/9. default: the image's own
  containerClassName?: string;     // applied to the aspect-ratio wrapper
}

export default function CarImage(props: CarImageProps): JSX.Element;
```

Behaviour it guarantees: renders the LQIP as a blurred background, sets intrinsic `width`/`height` so there is zero layout shift, emits `srcSet` + `sizes`, `decoding="async"`, `loading="lazy"` unless `priority`, and renders a neutral placeholder (no broken-image icon) when `image` is `null`.

### 6.1 `fit` vs `cldFit` — two different axes, don't conflate them

- **`fit`** is CSS `object-fit` on the `<img>`. It decides how the delivered pixels sit inside the box the browser already reserved. It costs nothing and transfers nothing.
- **`cldFit`** is the Cloudinary crop mode baked into the URL (§5.1). It decides *which pixels get delivered at all*, server-side.

They are set together, per surface:

| Surface | `cldFit` | `fit` | `aspect` | Why |
| --- | --- | --- | --- | --- |
| Fleet card, home carousel | `'auto'` | `'cover'` | fixed (`16/9`) | Fixed-height boxes (`h-28 md:h-64`). `c_auto,g_auto` lets Cloudinary pick a subject-preserving crop instead of `object-fit` blindly slicing the car's front off |
| Detail gallery main | `'limit'` | `'cover'` | `16/9` or `21/9` | The existing container already sets these ratios |
| Detail thumbnails | `'limit'` | `'cover'` | `16/9` | Small; no need to burn a distinct crop derivation |
| Admin grid | `'limit'` | `'cover'` | image's own | The owner should see the whole uncropped photo he uploaded |

When `aspect` is supplied, the wrapper uses it and the intrinsic `width`/`height` are computed from it — so a fixed-ratio card still reserves the right box even if the underlying photo is a different shape. When it is omitted, the image's own `width`/`height` from the DB drive the box. Either way the box is reserved before any bytes arrive, which is the whole point.

Import `CldFit` from `src/lib/cloudinary.ts`.

## 7. Client-side LQIP util — `src/lib/lqip.ts`

Created by **P03**. Consumed by **P04** for browser uploads (sharp is Node-only, so admin uploads need a canvas-based path).

```ts
export interface LqipResult { blurDataUrl: string; width: number; height: number }

/** Downscales to 16px wide on a canvas and returns a base64 data URL plus the natural size. */
export function createLqip(file: File): Promise<LqipResult>;
```

## 8. API surface — frozen

Base URL is same-origin `/api`. Error responses always use the `ApiError` shape from §3.

### Public — cached `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/cars` | `{ cars: CarDTO[] }` sorted by `sortOrder`, then `name`. Each car's `location` and `blocks` are embedded — no second round trip, and city/date filtering happens client-side over this one cached payload. **`blocks` carries the public `BlockedRangeDTO` shape only** — no ids, no notes |
| GET | `/api/cars/:id` | `{ car: CarDTO }` · `404` if unknown |
| GET | `/api/locations` | `{ locations: LocationDTO[] }` — **active only**, sorted by `sortOrder` then `city` |
| GET | `/api/settings` | `{ settings: SettingsDTO }` |
| GET | `/api/health` | `{ ok: true, db: boolean }` |

### Admin — all under `/api/admin/*`, all `Cache-Control: no-store`, all require the session cookie

| Method | Path | Body → Response |
| --- | --- | --- |
| POST | `/api/admin/login` | `{ email, password }` → `{ ok: true }` + sets cookie · `401` on bad creds |
| POST | `/api/admin/logout` | — → `{ ok: true }` (clears cookie) |
| GET | `/api/admin/me` | — → `{ email: string }` · `401` if no/invalid session |
| POST | `/api/admin/cars` | `CarInput` → `{ car: CarDTO }` |
| PATCH | `/api/admin/cars/:id` | `Partial<CarInput>` → `{ car: CarDTO }` |
| DELETE | `/api/admin/cars/:id` | — → `{ ok: true }` |
| POST | `/api/admin/uploads/sign` | `{ carId, filename }` → `{ cloudName, apiKey, timestamp, signature, folder, publicId }` |
| POST | `/api/admin/cars/:id/images` | `{ publicId, width, height, blurDataUrl, kind, alt? }` → `{ image: CarImageDTO }` |
| PATCH | `/api/admin/cars/:id/images/reorder` | `{ order: string[] }` (image ids) → `{ images: CarImageDTO[] }` |
| PATCH | `/api/admin/images/:imageId` | `{ isPrimary?, kind?, alt? }` → `{ image: CarImageDTO }` |
| DELETE | `/api/admin/images/:imageId` | — → `{ ok: true }` (also destroys the Cloudinary asset) |
| PUT | `/api/admin/settings` | `SettingsDTO` → `{ settings: SettingsDTO }` |
| GET | `/api/admin/availability?from=&to=` | — → `{ blocks: AvailabilityBlockDTO[] }` for the **whole fleet** in a date window. One request feeds the month grid — never N requests for N cars |
| GET | `/api/admin/cars/:id/availability` | — → `{ blocks: AvailabilityBlockDTO[] }` for one car |
| POST | `/api/admin/cars/:id/availability` | `{ startDate, endDate, note? }` → `{ block: AvailabilityBlockDTO }` · `409` on overlap |
| PATCH | `/api/admin/availability/:blockId` | `{ startDate?, endDate?, note? }` → `{ block: AvailabilityBlockDTO }` · `409` on overlap |
| DELETE | `/api/admin/availability/:blockId` | — → `{ ok: true }` |
| GET | `/api/admin/locations` | — → `{ locations: LocationDTO[] }` **including inactive** |
| POST | `/api/admin/locations` | `LocationInput` → `{ location: LocationDTO }` |
| PATCH | `/api/admin/locations/:id` | `Partial<LocationInput>` → `{ location: LocationDTO }` |
| DELETE | `/api/admin/locations/:id` | — → `{ ok: true }` · **`409 conflict`** with the referencing car count unless `?force=true` |

`CarInput` = `CarDTO` minus `images`, `createdAt`, `updatedAt` and `location`, plus `locationId: string | null`. On `POST /api/admin/cars`, `id` is optional — the server slugifies `name` when it is absent and appends `-2`, `-3`, … on collision.

`LocationInput` = `LocationDTO` with `id` optional — the server slugifies `city` when it is absent, same collision rule.

**Deleting a branch is guarded on purpose.** Cars point at a location; letting a delete silently null them out would make those cars vanish from every city-filtered view with no warning. So `DELETE` refuses with `409` and reports how many cars still reference the branch. The owner reassigns them, deactivates the branch instead (`isActive: false`), or repeats the call with `?force=true`, which sets those cars' `locationId` to `null`.

Note this differs slightly from PLAN.md Phase 3, which showed mixed `/api/cars` writes. **All writes live under `/api/admin/*`** so a single middleware can guard them. This contract wins.

### Session cookie — frozen

Name `sv_session`, `httpOnly`, `sameSite=Lax`, `path=/`, `secure` in production only, 7-day expiry, value is a JWT signed HS256 with `JWT_SECRET`, payload `{ sub: <adminUserId>, email, exp }`.

## 9. Typed API client — `src/lib/api.ts`

Created by **P03**. Consumed by **P04** and **P05**. Exact exports:

```ts
export class ApiRequestError extends Error {
  code: string;
  status: number;
}

export const api: {
  // public
  getCars(): Promise<CarDTO[]>;
  getCar(id: string): Promise<CarDTO>;
  getLocations(): Promise<LocationDTO[]>;
  getSettings(): Promise<SettingsDTO>;
  // admin — every one of these sends `cache: 'no-store'` and `credentials: 'same-origin'`
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  me(): Promise<{ email: string }>;
  createCar(input: CarInput): Promise<CarDTO>;
  updateCar(id: string, patch: Partial<CarInput>): Promise<CarDTO>;
  deleteCar(id: string): Promise<void>;
  signUpload(carId: string, filename: string): Promise<UploadSignature>;
  addImage(carId: string, meta: AddImageInput): Promise<CarImageDTO>;
  reorderImages(carId: string, order: string[]): Promise<CarImageDTO[]>;
  updateImage(imageId: string, patch: UpdateImageInput): Promise<CarImageDTO>;
  deleteImage(imageId: string): Promise<void>;
  updateSettings(input: SettingsDTO): Promise<SettingsDTO>;
  adminGetLocations(): Promise<LocationDTO[]>;              // includes inactive
  createLocation(input: LocationInput): Promise<LocationDTO>;
  updateLocation(id: string, patch: Partial<LocationInput>): Promise<LocationDTO>;
  deleteLocation(id: string, opts?: { force?: boolean }): Promise<void>;
  getFleetAvailability(from: string, to: string): Promise<AvailabilityBlockDTO[]>;
  getCarAvailability(carId: string): Promise<AvailabilityBlockDTO[]>;
  addBlock(carId: string, input: BlockInput): Promise<AvailabilityBlockDTO>;
  updateBlock(blockId: string, patch: Partial<BlockInput>): Promise<AvailabilityBlockDTO>;
  deleteBlock(blockId: string): Promise<void>;
};

/** `BlockInput = { startDate: string; endDate: string; note?: string | null }` */
```

## 10. React Query hooks — `src/hooks/`

Created by **P03**. Consumed by **P04** and **P05**. Query keys are frozen so invalidation works across sessions:

```ts
export const qk = {
  cars: ['cars'] as const,
  car: (id: string) => ['cars', id] as const,
  locations: ['locations'] as const,
  adminLocations: ['admin', 'locations'] as const,
  fleetAvailability: (from: string, to: string) => ['admin', 'availability', from, to] as const,
  carAvailability: (carId: string) => ['admin', 'availability', 'car', carId] as const,
  settings: ['settings'] as const,
  me: ['admin', 'me'] as const,
};

// src/hooks/useCars.ts
export function useCars(): UseQueryResult<CarDTO[], ApiRequestError>;
export function useCar(id: string | undefined): UseQueryResult<CarDTO, ApiRequestError>;
// src/hooks/useSettings.ts
export function useSettings(): UseQueryResult<SettingsDTO, ApiRequestError>;
// src/hooks/useLocations.ts
export function useLocations(): UseQueryResult<LocationDTO[], ApiRequestError>;
```

Any mutation that changes a location must invalidate **`qk.cars` and `qk.adminLocations` and `qk.locations`** — a renamed city has to change every car card that shows it.

`P00` installs `@tanstack/react-query` and mounts `<QueryClientProvider>` in `src/main.tsx`, so the provider is already in place when P03/P04/P05 start.

## 11. WhatsApp builder — `src/lib/booking.ts`

Created by **P05**. Exact signature:

```ts
export interface BookingContext {
  car: CarDTO;
  settings: SettingsDTO;
  /** 'YYYY-MM-DD'. Required — the customer always has dates (§16.4). */
  startDate: string;
  endDate: string;
  /** Always `rentalDays(startDate, endDate)`. Passed in so callers can't disagree. */
  days: number;
  mode: 'self' | 'driver';
  /** Absolute URL of the car detail page. */
  carPageUrl: string;
  /** Google Maps link from the geolocation share toggle, if the customer opted in. */
  locationLink?: string | null;
  /** 'details' keeps the CarDetailsPage wording, 'confirm' keeps the ConciergeSidebar wording. */
  variant: 'details' | 'confirm';
}

export function buildWhatsAppUrl(ctx: BookingContext): string;

/**
 * The message body as lines, before URL encoding. `buildWhatsAppUrl` is a thin
 * wrapper over this.
 *
 * It is exported because `ConciergeSidebarContent` renders a live "Message
 * Preview" to the customer (lines 118-138 today) that **duplicates the message
 * body in JSX**. That duplication is a standing bug: the two are already free to
 * drift, and Amendment 2 adds lines to both. The preview must render from THIS
 * array so it cannot lie about what will be sent.
 */
export function buildWhatsAppLines(ctx: BookingContext): string[];
```

**The two message bodies must come out byte-identical to today's output** for the same inputs, except that the phone, pickup address, driver rate, km limit and extra-km value now come from data instead of literals.

**Multi-branch changes the source of two values, not the message shape.** The `wa.me` number is `bookingPhone(car, settings)` and the `Pickup:` line is `pickupAddress(car, settings)` — both resolve to today's exact strings for the existing fleet, so the byte-identity requirement still holds. **Do not add a branch line, a city line, or a directions link to the message body.**

### 11.1 Amendment 2 — the only two lines ever added

The line count was frozen. Amendment 2 unfreezes it **once, for exactly two lines**, because the customer's dates are the whole point of the change and they have to reach the owner.

Immediately after the `Duration:` line, in both variants, matching that variant's
bullet style:

```
  details variant            confirm variant
  Duration: 3 Days           • Duration: 3 Days
  Start Date: 05 Sep 2026    • Start Date: 05 Sep 2026
  End Date: 08 Sep 2026      • End Date: 08 Sep 2026
```

Dates are formatted with `formatDate()` (§4.2) — `'05 Sep 2026'`, a month **name**,
never `05/09/2026`. The owner reads these on a phone and `05/09` versus `09/05` is a
booking on the wrong day.

**Everything else stays byte-identical.** Same emoji, same bullets, same blank lines,
same order, same wording. Two lines added, nothing moved, nothing removed. Any further
line is a contract violation. The `variant` flag exists purely to preserve the two different existing wordings. Emoji (`🚗`, `📍`), bullet characters (`•`), line order and blank lines are all part of the contract — copy them from the current code, do not retype from memory.

Reference (read, do not edit): `src/pages/CarDetailsPage.tsx:98-129` and `src/components/booking/ConciergeSidebarContent.tsx:58-86`.

## 12. Environment variables

`P00` writes `.env.example` with exactly these. Server-only vars must never be referenced from `src/`:

```
# --- server only ---
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
JWT_SECRET=<64 hex chars>
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
# --- exposed to the browser (safe: cloud name is public) ---
VITE_CLOUDINARY_CLOUD_NAME=
```

## 13. Local dev topology

Vercel functions cannot run under plain `vite dev`, so the Hono app is factored to run both ways:

- `server/app.ts` exports `createApp()` returning the Hono app — the single source of routes.
- `api/[[...route]].ts` wraps it with `handle()` from `hono/vercel` for production.
- `scripts/dev-server.ts` serves it with `@hono/node-server` on **port 3001** for local dev.
- `vite.config.ts` proxies `/api` → `http://localhost:3001`.
- `npm run dev:all` runs both concurrently. Vite stays on **port 3000**.

## 14. Definition of done for any session

1. Every file you own is written and self-consistent.
2. `npx tsc --noEmit` shows **no errors originating in your own files** (errors from other sessions' unfinished files are expected during Wave 1 — ignore those).
3. You changed **zero** files outside your ownership list.
4. You committed only your own paths.
5. Your final message lists: files created, files modified, any contract friction you hit, and anything you deliberately left for `P06`.

## 15. Multi-city branches — the requirement, end to end

> Added **2026-09-03**, after P00 shipped and before Wave 1 started. See the amendment in [PLAN.md](./PLAN.md).

The client is expanding beyond one office. He must be able to enter **a city, an office address in plain text, and a map link**, then say **which branch each car rents from**. Customers pick one or more cities and see only those cars. The map link is what the **"Get Directions"** button opens.

### 15.1 Who owns what

| Piece | Owner |
| --- | --- |
| `locations` table, `cars.locationId` FK | **P00** (already built) |
| `LocationDTO`, `LocationInput`, helpers in §4/§4.1 | **P00** (already built) |
| `/api/locations` + `/api/admin/locations` CRUD | **P01** |
| Seeding the first branch from today's hardcoded office | **P02** |
| `api.getLocations()`, `useLocations()`, `qk.locations` | **P03** |
| Admin: branch manager + the car form's branch field | **P04** |
| Customer: city picker, filtering, Get Directions, office section | **P05** |

### 15.2 The customer's city selection — frozen state contract

The selection is **UI state, not server state**. It lives in `src/lib/cityFilter.ts`, owned by **P05**:

```ts
/** Selected city slugs (see `citySlug` in §4.1). Empty array = all cities. */
export function useCityFilter(): {
  selected: string[];
  setSelected: (slugs: string[]) => void;
  toggle: (slug: string) => void;
  clear: () => void;
};
```

Frozen rules, because two P05-owned surfaces (`HomePage` and `AllCarsPage`) read the same state and must agree:

1. **URL is the source of truth**: `?cities=proddatur,kadapa`. Absent or empty means all cities. This keeps a filtered fleet shareable on WhatsApp, which is how this client's customers share things.
2. Mirrored to `localStorage` under the key **`sv-cities`** and restored on a later visit *only when the URL has no `cities` param*. A deep link always wins over a remembered choice.
3. An unknown slug in the URL is ignored, not an error — a city the owner deleted must not produce an empty page.
4. Selecting every city and selecting none are the same thing: show everything. Never show "0 cars" because of a stale filter.

### 15.3 `directionsUrl` is user-supplied and ends up in an `href`

The owner pastes this value and the browser navigates to it. Treat it as untrusted:

- **P01** validates on write: absolute `http://` or `https://` only. Reject `javascript:`, `data:`, and relative values with `422`.
- **`directionsHref()` (P00) re-checks at render** and falls back to the derived Google Maps search when the stored value is not http(s). Two layers, because the DB may predate the validation.
- Every external directions/map link opens with `target="_blank" rel="noopener noreferrer"`.

### 15.4 The single-city invariant — this is how we avoid a redesign

Today there is exactly one office. `docs/design-system.md` and `.github/copilot-instructions.md` forbid redesigning the UI, so:

> **With one active city, every customer page must render exactly as it does today.** The city picker renders **nothing** when `cityOptions(...).length <= 1`.

The picker appears only once the owner adds a second city. Same rule for the office section: one location renders exactly today's single address card; more than one adds a city switcher built from the existing filter-pill classes.

### 15.5 Cars with no branch

`locationId` is nullable. The 8 migrated cars get the seeded Proddatur branch, but a car created before the owner sets up a city has none. Such a car:

- still appears in the fleet when **no** city filter is active,
- is **excluded** when a city filter is active (it belongs to no city — inventing one would violate the no-invented-data rule),
- falls back to `settings.pickupAddress` / `settings.whatsappPhone` in the booking message,
- counts toward the admin's "Needs Attention" tile, which is how the owner finds it.

## 16. Future availability & booking dates

> Added **2026-09-05**, before Wave 1 started. See Amendment 2 in [PLAN.md](./PLAN.md).

Two client requests that turned out to be one feature:

1. *"We show available or unavailable, but not when a booked car comes back. The owner should be able to say 'currently booked, available from so-and-so date' — and it changes often."*
2. *"Let the customer pick actual start and end dates, not just a day count. Compulsory. It goes to the owner on WhatsApp only, never into the database."*

Nothing about a **customer's** booking is ever persisted. The only thing stored is the
**owner's** statement of when a car is out. A booking becomes real when the owner
replies on WhatsApp and blocks the dates himself.

### 16.1 Dates — the rules that prevent off-by-one bugs

Read all five before writing any date code. Every one of them has produced a
production bug in someone's rental app.

1. **Every date is a `'YYYY-MM-DD'` string.** Never a `Date` object in a DTO, in the URL, in props, or in the database. `date` columns in Postgres, strings everywhere else.
2. **`startDate` is inclusive, `endDate` is exclusive**, for both blocks and bookings. Out `05→08` means out on the 5th, 6th, 7th; **back on the 8th**. This makes `days = diffDays(start, end)`, makes adjacent spans (`05→08` then `08→12`) non-overlapping, and makes "available from the 8th" literally the stored `endDate`. In admin the fields are labelled **"Out from"** and **"Back on"** so the owner never has to think about it.
3. **Billable days = `rentalDays(start, end)` = `max(1, diffDays(start, end))`.** `05→08 Sep` is **3 days**. Same-day (`05→05`) is **1 day**. This matches today's day-count buttons: picking "3 Days" is `05→08`.
4. **"Today" is `todayInIndia()`, always.** Never `new Date()` interpreted in the browser's zone. A customer opening the site from Dubai must see the same "today" as the owner in Proddatur.
5. **Past blocks simply expire.** A block that ended yesterday no longer contains today, so the car is available again with no action from the owner. This is a deliberate decision (Amendment 2): the owner shouldn't have to flip anything back, and stale "available from 8 Sep" text on the 15th is worse than a car quietly returning to the fleet. The owner extends the block if a customer keeps the car longer.

### 16.2 Two independent concepts — do not merge them

| | `car.availability` (boolean) | `car.blocks` (dated spans) |
| --- | --- | --- |
| Means | Off the road **indefinitely** — workshop, sold, papers expired | Out **until a known date** |
| Set by | The existing Available/Booked toggle | The availability calendar |
| Return date | None, and none may be implied | `endDate` |

The customer-facing status is derived from both, and **only** through
`carAvailability(car)`:

```
availability === false            -> { kind: 'unavailable' }        "Booked"      (no date shown)
a block contains today            -> { kind: 'booked', until, … }   "Available from 08 Sep"
otherwise                         -> { kind: 'available' }          "Available"
```

**Never render `car.availability` directly on a customer surface.** A card that reads
the boolean shows "Available" for a car that is out until Friday.

### 16.3 Status wording — frozen, so admin and public agree

`availabilityLabel()` is the single source:

| Status | Label |
| --- | --- |
| `available` | `Available` |
| `unavailable` | `Booked` |
| `booked`, ≤ 7 days away | `Available in 3 days` (`in 1 day` singular; `Available tomorrow` for 1 is also acceptable — pick one and use it everywhere) |
| `booked`, > 7 days away | `Available from 12 Sep` |

Relative wording for near dates, absolute for far ones: "available in 2 days" is what a
customer actually wants to know, but "available in 96 days" is noise.

The existing pill classes carry this — emerald for available, slate for booked. **No new
colour for the "available from" state.** `docs/design-system.md` still applies.

### 16.4 The customer's date selection — frozen state contract

Owned by **P05**, in `src/lib/dateFilter.ts`, deliberately mirroring the city filter
in §15.2 so the two behave the same:

```ts
export function useDateRange(): {
  startDate: string;                       // always a valid 'YYYY-MM-DD'
  endDate: string;                         // always > startDate
  days: number;                            // rentalDays(startDate, endDate)
  setRange: (start: string, end: string) => void;
  setDays: (days: number) => void;         // keeps startDate, moves endDate — powers the preset buttons
  isDefault: boolean;                      // true while the customer hasn't chosen
};
```

1. **URL is the source of truth**: `?start=2026-09-05&end=2026-09-08`, on `/all-cars`, `/car/:id` and `/booking` alike. The customer enters dates once and they follow him.
2. Mirrored to `localStorage['sv-dates']`, restored only when the URL has neither param.
3. **Defaults, so the state is never empty:** `startDate = todayInIndia()`, `endDate = start + 3` — which reproduces today's default of 3 days exactly. Dates are compulsory in the sense that they are *always present and always sent*; the customer is never blocked by an empty field.
4. **Invalid or past values in the URL are repaired, not rejected** — clamp `start` to today, force `end > start`. A stale WhatsApp link from last month must still open a usable page.
5. **Never hard-block the WhatsApp CTA on a date conflict.** Warn, offer the fix, let him send. An enquiry about an unavailable car is still a lead — the same reasoning already applied to booked cars in P05.
6. Cap the range at **90 days** with a plain message. Beyond that it isn't a car rental.

### 16.5 The date picker

Native `<input type="date">`. Not negotiable, for a good reason: no date library is
installed, Wave 1 sessions may not add dependencies, and the native control gives a
real mobile picker for free. `min` on the start field is `todayInIndia()`; `min` on the
end field is `start + 1`.

**Keep the existing day-count buttons** (`1 Day … 14 Days`) as shortcuts that set the
end date via `setDays()`, with the matching preset highlighted when the range lines up.
They are a fast path on mobile and removing them would be a redesign.

### 16.6 What the customer's dates change

- **Fleet (`/all-cars`)**: cars that cannot serve the whole range are pushed below the ones that can and rendered muted, with `Free from <date>` on the card. **Do not remove them from the page** — a customer who sees an empty fleet leaves; one who sees "free from the 12th" messages the owner.
- **Car detail**: the date fields drive `days`, the price breakdown and the message. If the range overlaps a block, show an inline warning naming the first free date and a one-tap **"Shift to 12 Sep"** that moves the range keeping its length.
- **Booking page**: reads the same params; totals must match the detail page for identical inputs.
- **WhatsApp**: two lines, §11.1.

### 16.7 The admin calendar — a fleet-wide month grid

Owned by **P09**, at `/admin/availability`. Cars as rows, days of one month as columns,
blocked cells shaded; click-drag across a row to create a block, click a block to edit
or delete it. Built from `GET /api/admin/availability?from=&to=` in **one** request for
the whole month.

The month grid is the owner's operational picture: with eight cars he wants to see the
fleet's whole month at once, not open eight cars in turn. It is also the largest single
piece of UI in this build, which is why it is its own session.

### 16.8 Known limitation, to be stated plainly in the README

Because customer bookings are never stored, **two customers can request the same car for
the same dates**. The owner arbitrates on WhatsApp and blocks the dates for whoever he
confirms. This is a deliberate consequence of "the dates go to WhatsApp only, not the
database" — it is not a defect, and P07 must not report it as one. Do not build
conflict detection, holds, or a queue on top of it.