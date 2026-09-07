# Verification Report — 2026-09-05

P07, run solo against commit `820e974` on a clean tree, with the real Neon database and the real
Cloudinary account. Nothing in the repository was modified except this file.

## Verdict

**SHIP WITH FIXES** — 0 blockers, 3 majors, 11 minors.

## Summary

The build does what the plan said it would. Phase 0–7 are all present, the schema covers every
field in `docs/data-model.md`, all 8 cars and all 43 images migrated with the curated order intact
(including the Ertiga's `inside_2.jpg.webp` and the Glanza's missing `inside_3`), every one of the
21 admin endpoints returns 401 unauthenticated, `dist/` contains no secret, and the WhatsApp
message comes out byte-identical to the pre-build output apart from the two Amendment 2 date lines.
Amendment 2's exclusive-end rule — the thing most likely to be off by one — is correct in all four
places at once: the DB row, the month grid, the public payload and the fleet card (Section H1).

Three things need fixing before deploy. The largest is **not** a logic bug: the public
`Cache-Control` has no `max-age`, so a returning visitor's browser serves the *previous* visit's
`/api/cars` payload from disk for the whole visit — I watched a page show ₹3,333 while the API
already said ₹4,444. The other two are narrower: the detail page promises a return date for a car
whose master switch is off, and the WhatsApp message silently drops the rate and total for a priced
car that is off the road.

The single biggest risk is the caching one, because it is invisible in development (a hard refresh
hides it) and it contradicts what the README tells the owner.

---

## Findings

### BLOCKER

None.

### MAJOR

**1. The detail page promises a return date for a car that is off the road indefinitely**

`src/components/DateRangePicker.tsx:38-41` and `:85-99`

CONTRACT.md §16.2 and P07 §H6: *"A car that is both switched off and blocked must read as
indefinitely unavailable — no return date may be implied."*

`DateRangePicker` computes its conflict warning from the blocks alone and never looks at
`car.availability`:

```ts
const conflicts = Boolean(car) && isBlocked(blocks, startDate, endDate);
const freeFrom = conflicts ? nextFreeDate(blocks, startDate) : null;
```

`AllCarsPage.tsx:257` gets this right (`const offTheRoad = carAvailability(car).kind === 'unavailable'`);
the picker does not.

*Expected:* no return date anywhere on the page for a switched-off car.
*Observed:* the status pill correctly reads `Booked` and the CTA correctly reads
`Check availability on WhatsApp`, but directly underneath sits
*"This car is out for part of those dates. It is free from 08 Sep 2026."* and a one-tap
**"Shift to 08 Sep 2026"** button.

*Repro (exact commands run):*
1. `POST /api/admin/cars/force-traveller-mini-bus/availability {"startDate":"2026-09-05","endDate":"2026-09-08"}`
2. `PATCH /api/admin/cars/force-traveller-mini-bus {"availability":false}`
3. Load `http://localhost:3000/car/force-traveller-mini-bus` with the HTTP cache disabled.

Rendered text captured:

```
Booked
This car is out for part of those dates. It is free from 08 Sep 2026.
Shift to 08 Sep 2026
Check availability on WhatsApp
```

---

**2. The public `Cache-Control` lets a visitor's own browser serve a whole visit from a stale payload**

`server/routes/public.ts:35` — `'public, s-maxage=60, stale-while-revalidate=86400'`

There is no `max-age` and no `ETag`/`Last-Modified`. `s-maxage` binds shared caches only, so a
browser falls back to heuristic freshness (nothing to compute it from) and then honours
`stale-while-revalidate=86400`: it serves the stored copy from disk *immediately* and revalidates in
the background. The revalidated body lands in the HTTP cache, not in the running page, and
`src/main.tsx:24` sets React Query `staleTime: 60_000`, so nothing refetches during the visit. The
customer therefore sees the previous visit's data for the entire session.

`README.md:122-131` and `docs/backend.md:217-234` both tell the owner the bound is 60 seconds. It is
not; it is "until the next page load", up to 24 hours away.

*Repro:*
```
PATCH /api/admin/cars/toyota-innova-crysta {"pricePerDay":3333}   → GET /api/cars says 3333
load /all-cars (cache on, 12s)                                    → card shows ₹3,333   ✓
PATCH /api/admin/cars/toyota-innova-crysta {"pricePerDay":4444}   → GET /api/cars says 4444
load /all-cars (cache on, 12s)                                    → card shows ₹3,333   ✗ stale
load /all-cars again (cache on, 12s)                              → card shows ₹4,444
load /all-cars (cache disabled)                                   → card shows ₹4,444
```
CDP `Network.responseReceived` on every load: `GET /api/cars` → `fromDiskCache=true`, followed by a
second `fromDiskCache=false` background revalidation. `/api/locations` behaves identically.

Corollary observed at the network level but not separately reproduced in the UI: `AdminPage.tsx:42`
and `CarFormDialog.tsx:70` read the **public** `/api/locations`, so the same disk cache sits in front
of the owner's branch dropdown.

---

**3. The WhatsApp message drops the rate and the total — with no replacement line — for a priced car whose master switch is off**

`src/lib/booking.ts:80`, `:102-106`, `:139-143`

```ts
const priceKnown = dailyRate > 0;
const showPrices = priceKnown && car.availability;
...
if (showPrices)        lines.push(`Total: ₹${total.toLocaleString()}`);
else if (!priceKnown)  lines.push(`Please share the rate for these dates.`);
```

When `pricePerDay > 0` **and** `availability === false`, both branches are skipped. CONTRACT.md §11
freezes the body: *"The two message bodies must come out byte-identical to today's output"*, and
§11.1 unfreezes it for exactly two date lines. This is a third deviation, and unlike the
`pricePerDay === 0` case it leaves nothing in the message's place.

*Expected (details variant):* `Price Per Day: ₹2,500` … `Total: ₹7,500`, per the pre-build builder
at `git show 2bf460f:src/pages/CarDetailsPage.tsx` lines 100-129, which pushed `Total:`
unconditionally.
*Observed:* both lines absent, and no "please share the rate" line either.

*Repro:* `npx tsx` against `buildWhatsAppLines` with `{...car, pricePerDay: 2500, availability: false}`:

```
Duration: 3 Days
Start Date: 05 Sep 2026
End Date: 08 Sep 2026
KM Limit: 100 km/day
Extra KM Charge: ₹50/km
                          <- Price Per Day and Total both missing
Selected Car Page: …
```
Same in the confirm variant (`• Rate:` and `• Total:` both vanish).

---

### MINOR

**4. `/booking` scrolls horizontally at 375px** — `src/pages/BookingPage.tsx:95`

`document.documentElement.scrollWidth = 397` vs `clientWidth = 375` at a 375×812 emulated viewport.
The overflowing box is `<div class="grid lg:grid-cols-12 gap-12 items-start">` (scrollWidth 373 /
clientWidth 327). Cause: the message preview renders the absolute car-page URL as one unbreakable
token; `break-words` (`ConciergeSidebarContent.tsx:114`) wraps it visually but, by spec,
`overflow-wrap: break-word` does not reduce the element's min-content width, so the single-column
grid cannot shrink below it. `overflow-wrap: anywhere` or `min-w-0` on the grid children would fix it.

The layout classes are unchanged from `2bf460f`, so this predates the build; the preview's URL line
is not new. `/`, `/all-cars`, `/car/:id`, `/admin` and `/admin/availability` all measure exactly 375.

**5. The detail page's pickup address changed from the short form to the long form** —
`src/pages/CarDetailsPage.tsx:410`

`displayAddress(branch)` returns `addressFull` when set. The seed sets it, so the sidebar now reads
*"Narasimhapuram village, Proddatur mandal, Kadapa district, Andhra Pradesh, India"* where
`git show 2bf460f:src/pages/CarDetailsPage.tsx:345` rendered *"Narasimhapuram, Proddatur"*. Both
strings are real (both come verbatim from the pre-build code — see `db/seed/officeData.ts:52-55`), so
this is not invented data, but it is a visible content change on a page `docs/design-system.md` says
should not change. The WhatsApp `Pickup:` line correctly still uses `addressShort`.

**6. `availabilityLabel` includes the year in the far-date form** — `src/lib/availability.ts:185`

CONTRACT.md §16.3 freezes the wording as `Available from 12 Sep`; the code emits
`Available from 12 Sep 2026` (verified: `availabilityLabel({kind:'booked',until:'2026-10-05',daysAway:30})`
→ `'Available from 05 Oct 2026'`). More informative, but not the frozen string — worth deciding
once rather than leaving the doc and the code disagreeing.

**7. Twelve controls on `/all-cars` and one on `/admin` still do nothing**

`src/pages/AllCarsPage.tsx:185,189,192` (Available Now / Self Drive / With Driver pills),
`:200,206,212,219` (Car Model / Fuel Type / Seating / Sort By selects — no `onChange`),
`:330,333,334,335,336` (pagination), `src/pages/AdminPage.tsx:204` (the bell).

All of them were dead at `2bf460f` too, so nothing was broken here. It is worth recording because
the four selects are now populated from live data, which makes them look functional, and because
`CitySelector` and `DateRangePicker` — which do work — now sit in the same bar as seven that don't.
P07 §E2 asks that "filters work"; the two new ones do, the seven pre-existing ones never did.

**8. `Category: ` is emitted empty in the details-variant message** — `src/lib/booking.ts:123`

`Category: ${car.carType ?? ''}` produces a bare `Category: ` line for the five cars that
legitimately have no `carType` (Trax Cruiser, Innova, Innova Crysta, Dzire, Glanza). Correct under
the no-invented-data rule, slightly untidy in the owner's inbox. Reproduced live on
`/car/toyota-innova-crysta`.

**9. The login timing-equalisation hash is a weaker cost than the real one** — `server/routes/auth.ts:35`

`DUMMY_HASH` is `$2b$10$…` (cost 10) while `scripts/create-admin.ts:27` writes cost 12. Comparing
against the dummy is roughly 4× faster than comparing against a real hash, so a measurable timing
difference between "unknown email" and "wrong password" survives. The response bodies and statuses
are identical (verified: both return `401 {"error":{"code":"invalid_credentials","message":"Incorrect email or password."}}`),
so this is a residual side channel, not an oracle in the response.

**10. A second `wa.me` URL is built outside `src/lib/booking.ts`** — `src/components/ShareLocation.tsx:26`

P07 §C5 asks that `grep -rn "wa.me" src/` show only `src/lib/booking.ts` and its call sites. This one
builds `https://wa.me/${phone}?text=…` for the home page's "Share My Location for Delivery" flow. It
is a different message (not a booking), the phone comes from `settings.whatsappPhone`, and the
component predates the build — but it is a second place a `wa.me` link can drift, and it does not go
through `bookingPhone()`, so it will not pick up a per-branch number.

**11. The admin city filter reads the customer-facing branch list** — `src/pages/AdminPage.tsx:42`

`useLocations()` hits `GET /api/locations`, which is active-only by design. A branch the owner
deactivates therefore disappears from the dashboard's city filter pills while its cars remain in the
grid, so he cannot filter to them. `LocationManagerDialog` correctly uses `useAllLocations()`
(`/api/admin/locations`). Not reproduced end-to-end in the UI — read from the code plus the verified
endpoint behaviour (`GET /api/locations` returns active only; `GET /api/admin/locations` includes
inactive).

**12. The driver-charge line disappears when a car's driver rate is deliberately 0** —
`src/lib/booking.ts:99` and `:136`

`if (mode === 'driver' && driverRate > 0)` drops the line entirely. `CarFormDialog.tsx:337-340`
explicitly tells the owner *"Entering 0 means this car really charges nothing for it"* — in that case
the message says nothing about the driver at all, rather than "included". The pre-build builder
pushed the line unconditionally. Never triggers on the current fleet (all null → 1000).

**13. `index.html` hardcodes the city in the page title**

`<title>Sri Venkateshwara Cars | Self Drive & Rental Cars in Proddatur</title>` — rendered on every
page including `/admin`. CONTRACT.md §1 rule 8 scopes the ban to `src/`, so this is inside the letter
of the rule, but it is the last hardcoded place name a second city would contradict.

**14. Pre-existing invented content still ships on the home page**

`src/components/Testimonials.tsx` (a G-Wagon delivered to a hotel, a Tesla Model S — neither is in
this fleet; two named people with job titles), `src/components/VideoGallery.tsx:3-27`
("Amalfi Coast Drive", "Cold Start: M5", "Alpine Escape" under the heading *"Watch Our Cars & Route
Videos"*), `src/components/Hero.tsx:83` (a stock car photo), and the "Chat with Sarah now" concierge
block at `src/pages/CarDetailsPage.tsx:545`. All are Stitch-import leftovers, untouched by this
build and outside every session's ownership list — but they are invented business details on a
customer page, which `.github/copilot-instructions.md` forbids. Recording it so the decision to keep
them is deliberate. They also bypass `<CarImage>` entirely and depend on `lh3.googleusercontent.com`
URLs staying alive.

### NOTE

- **`/booking` is unreachable from anywhere in the UI.** `grep -rn "to=\"/booking\"" src/` finds
  nothing, and nothing did at `2bf460f` either. The route works when typed or deep-linked (verified,
  including the legacy `?days=5` → `05→10 Sep` conversion at `BookingPage.tsx:25-29`), and totals
  match the detail page exactly. Pre-existing; flagging it because Section E4 and H14 both assume a
  path into it.
- **P07 §H1's stated expectation contradicts CONTRACT.md §16.3.** H1 says the fleet card should read
  *"Available from 08 Sep"* for a car blocked 05→08 with today = the 5th. §16.3 says a return date
  ≤ 7 days away is rendered relatively. The code follows §16.3 and renders **"Available in 3 days"**
  plus **"Free from 08 Sep 2026"**. I scored this a pass; the prompt is what is wrong, not the build.
- **§16.8's documented consequence is real and documented.** Two customers can request the same car
  for the same dates and both get a working CTA. `README.md:212-224` explains it in the owner's
  words. Not reported as a defect, per instruction.
- **The working tree changed during this run and not by me.** `git status` now shows
  `.claude/CLAUDE.md.md` deleted and `.claude/CLAUDE.md` untracked. Content is byte-identical apart
  from line endings (CRLF), the file's mtime is unchanged (Apr 14), and the directory mtime is
  18:48 — mid-session. I ran no file operation on `.claude/`; this looks like the editor/harness
  normalising the filename. Restoring it is a one-line `git checkout`.
- **Deferred features are genuinely absent, not half-built.** No enquiry logging, no `SVC-####`
  codes, no Settings screen, no WhatsApp Cloud API. The four deferred sidebar entries
  (`AdminSidebar.tsx:29-35,131-138`) render as `aria-disabled` with an explanatory `title` rather
  than as dead `href="#"` links. `api.updateSettings()` exists in the client but no UI calls it,
  which matches PLAN.md's "settings are seeded via script in this phase".
- **The one deliberate compromise is documented.** `docs/backend.md:217-239` explains the 60s edge
  cache and why `revalidateTag` was ruled out. Finding 2 is about the *browser* cache, which that
  section does not cover.

---

## Coverage

| Section | Result | Notes |
| --- | --- | --- |
| A Requirements | **PASS** | Phase 0–7 all delivered. `src/pages/{admin,booking,car_details,all_cars}/`, `main.py`, `.python-version` gone; `GEMINI_API_KEY` survives only in `prompts/*.md` prose. `db/schema.ts` covers every `docs/data-model.md` field. 8 cars / 43 images, order verified car-by-car against `src/data/carImageMap.ts` — Ertiga `inside_2.jpg.webp` and Glanza `inside_4`-with-no-`inside_3` both intact. All 21 CONTRACT §8 endpoints curled. `npx tsc --noEmit` clean. Deferred items genuinely deferred. |
| B Project rules | **PASS** | No payment affordance anywhere (`grep -rniE "razorpay\|stripe\|paytm\|phonepe\|cashfree\|paypal\|checkout\|card number"` on `src/ server/ api/ db/ scripts/` → 0). No invented data introduced (all `unsplash`/`INITIAL_VEHICLES`/`utilization`/`picsum` hits are comments recording their removal). No new colours: the only hexes in `src/` are `#00408b #ffffff #f2f3fc #742d00 #10b981` in `index.css` (all at `2bf460f`) plus `#25D366 #128C7E #075e54 #10b981 #059669` (all pre-existing). ₹ everywhere with `toLocaleString()`; no `$`, no `Rs.`. No `admin` string in `Navbar.tsx` or `Footer.tsx`; `/admin` renders outside `CustomerLayout`. All four routes work and slugs are unchanged (`/car/toyota-innova-crysta` resolves). `locations` holds exactly one row, seeded verbatim from the pre-build strings. See MINOR 13, 14. |
| C WhatsApp | **PASS** | Both bodies diffed line-by-line against `git show 2bf460f:…` for self/driver × details/confirm. **Only difference is the two `Start Date:` / `End Date:` lines immediately after `Duration:`**, in each variant's bullet style, formatted `05 Sep 2026`. Emoji `🚗`/`📍`, `•` bullets, blank lines, line order and the `Selected Car Page` / `🚗 Car Details` lines all identical. Live phone `919704201247` and `Pickup: Narasimhapuram, Proddatur` both come from the DB; `grep -rn "919704201247\|driverRate = 1000\|100 km/day\|₹50/km\|Narasimhapuram" src/` finds only comments and type-doc examples. No `₹0` or `Total: ₹0` at `pricePerDay: 0`. All geolocation error branches present (`CarDetailsPage.tsx:80-98`, `ConciergeSidebarContent.tsx:44-49`). See MAJOR 3, MINOR 8, 10, 12. |
| D Security | **PASS** | `npm run build` then `grep -rniE "api_secret\|CLOUDINARY_API_SECRET\|JWT_SECRET\|DATABASE_URL\|postgresql://\|neon\.tech\|bcrypt" dist/` → nothing; the only Cloudinary value in the bundle is the public cloud name, present once. All 21 admin endpoints return **401** unauthenticated, including trailing-slash and `..`-traversal variants; only `login`/`logout` are open by design. Cookie: `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`, `secure` gated on `NODE_ENV`/`VERCEL_ENV` (`server/lib/auth.ts:50-52,82`); the JWT is never written to `localStorage` (only `sv-cities`/`sv-dates` are). A dead `DATABASE_URL` yields `500 {"error":{"code":"internal","message":"Something went wrong."}}` with no connection string. `/api/admin/uploads/sign` is guarded and 404s an unknown `carId`. `.env` never committed (`git log --all --full-history -- .env .env.local` empty; `.gitignore:13` has `.env*`). No raw SQL carries user input — the three `` sql` `` hits are `select 1` and two schema check constraints. See MINOR 9. |
| E Functional | **PASS (with gaps)** | Rendered headless Chrome at 1440px and 375px with the console captured: **no console errors or warnings** on `/`, `/all-cars`, `/car/:id`, `/booking`, `/admin`, `/admin/availability` (only Vite's connect message and a `favicon.ico` 404). Home carousel loads and links correctly; `/all-cars` shows all 8 with correct derived pills and no `₹0`; gallery arrows advance in curated order (`main_front_1` → `front_2`); day presets rewrite the URL and the message (`5 Days` → `end=2026-09-10`, `Total: ₹12,500`); drive-mode toggle recomputes (`₹12,000` with the 1500 override) and the booking page agrees for identical inputs; `/car/nonexistent` → "Car Not Found", `/nonsense-route` → "Page Not Found". Deep links to every route render (dev history fallback). `/admin` logged out → `/admin/login`; wrong password → neutral 401; logout clears the cookie and `/api/admin/me` then 401s. Add-a-car with only a name → slug `p07-verify-car`, collision → `-2`. Image reorder (two-phase) and set-primary both work and revert cleanly. Every admin control has a handler except the bell. See MINOR 4, 7 and "Not verified". |
| F Data integrity | **PASS** | `transmission`/`year`/`carType` are null fleet-wide and render as *absent tiles*, not `null`/`undefined`/`NaN` (`CarDetailsPage.tsx:271-276`, `AllCarsPage.tsx:41-45`). `pricePerDay: 0` hides the price on card and detail and produces "Please share the rate for these dates." in the message. Per-car overrides verified in both directions live: Crysta at `driverPricePerDay: 1500` → `Driver Charge (₹1,500/day × 3)` / `• Driver: ₹1,500/day (₹4,500 total)`; Scorpio at `null` → `₹1,000`. Image `sortOrder` is a clean `0..n-1` per car with exactly one `isPrimary` (all 8 cars checked in the DB). `npm run migrate:images` rerun: **0 uploaded, 43 skipped, 0 inserted, 0 updated** — and an owner-set price (2500), an owner-set override (1500) and a reassigned branch all survived it. |
| G Multi-city (Amendment 1) | **PASS** | Created a second branch through the API, assigned a car, then removed it. Manage Cities has all three inputs the client asked for — City, Short address, Google Maps link — as the first three fields (`LocationManagerDialog.tsx:298-345`), plus a branch selector in the car form (`CarFormDialog.tsx:252-281`). Get Directions works in **both** states: with `directionsUrl` set it opens that URL, with it null it opens `maps/search/?api=1&query=<address>`; both carry `target="_blank" rel="noopener noreferrer"`, on the office section and the detail page. The iframe is derived from the address — the invented `!2d78.55!3d14.73` / `0x0:0x0` coordinates are gone and were never seeded (`db/seed/officeData.ts:56-64`). With two cities the picker appeared on `/` and `/all-cars`, multi-selected, wrote `?cities=`, and the office section grew a city switcher; with one city **nothing renders** (§15.4 held). A stale `?cities=nonexistent-city` shows the whole fleet, never "0 cars". Per-branch phone verified in both directions: the branch car's link was `wa.me/919999999999` with `Pickup: P07 Short Address`, the others `wa.me/919704201247`. No branch/city/directions line was added to the message. Delete guard: `409 "8 cars are still assigned…"`, then `409 "1 car…"` for the temp branch, then `?force=true` → 200 with that car's `location` nulled. `directionsUrl` XSS blocked at both layers: `javascript:`, `data:` and relative all `422` on POST *and* PATCH, and after writing `javascript:alert(document.cookie)` straight into the DB the page rendered the maps-search fallback with zero occurrences of `javascript:` in the DOM. `grep -rniE "proddatur\|narasimhapuram\|kadapa\|google\.com/maps" src/` hits only comments, the two URL templates in `locationHelpers.ts`, and the customer-geolocation links. |
| H Availability & dates (Amendment 2) | **PASS (1 major)** | **H1 verified in all four places for a 05→08 block:** `db:studio` row `start_date=2026-09-05, end_date=2026-09-08`; the month grid renders the 5th/6th/7th as blocked cells and the 8th as free-and-selectable (`data-selectable="true"`); `GET /api/cars` returns exactly those two dates; the fleet card reads *"Available in 3 days"* + *"Free from 08 Sep 2026"*; asking for the 8th on the detail page produces **no** conflict warning, while asking for the 6th produces the warning plus "Shift to 08 Sep 2026". Day counting: `05→08` = 3 Days, same-day = 1 Day, agreeing across detail, booking and message. Timezone: with Chrome emulating `Pacific/Kiritimati` (browser local date 2026-09-**06**), `America/Los_Angeles` and `Pacific/Midway`, the default start stayed `2026-09-05` and no rendered date shifted; the helpers also pass 28 assertions under `TZ=Asia/Kolkata|America/Los_Angeles|Pacific/Kiritimati|UTC`. A block ending yesterday is dropped from the public payload and the car reads Available. Overlap → `409` with the conflicting dates and nothing written; adjacency `05→08` then `08→12` → both `200`; `endDate == startDate` and reversed → `422`; `2026-02-30` → `422`. `nextFreeDate` with chained blocks returns the **12th**, and the live fleet card said "Free from 12 Sep 2026". The Message Preview is character-identical to the decoded `wa.me` text (13/13 lines) and renders from `buildWhatsAppLines()`. No bookings table exists — the DB has exactly `admin_users, car_availability_blocks, car_images, cars, locations, settings` — and the CTA is a plain `<a href>` with no handler, so no request is made. The fleet never empties over dates: unavailable cars are muted, pushed to the bottom and labelled. Past days in the calendar are inert `<div>`s at `opacity-4x` with no `data-selectable`. `curl -s /api/cars \| grep -i note` finds nothing even with a block whose note is set. **The one failure is MAJOR 1.** |
| I Visual regression | **PARTIAL** | Not a pixel diff — see "Not verified". Compared the full `className` inventory of every customer surface against `2bf460f` and the rendered DOM text at 375px and 1440px. `src/index.css` changed only by two `@source not` build directives. Every removed class is accounted for: the booked-card CTA went from a disabled `bg-slate-100 text-slate-400` button to a clickable `bg-surface-container-low text-slate-500` link (required by §16.6), Get Directions went from `<button>` to `<a class="block text-center …">` with the same border/padding/radius, and `BrandLogos`' two "removed" classes were only extracted into a `SECTION_CLASS` constant and a `containerClassName`. One real content difference: MINOR 5. One real layout observation: MINOR 4. |

---

## Not verified

Everything below is a risk the human still owns.

1. **Photo upload, image delete and car delete against the live Cloudinary account (E12, E13, E14).**
   I got as far as `POST /api/admin/uploads/sign` returning a valid signature for a real car and a
   404 for a bogus one, but the outbound multipart upload to `api.cloudinary.com` was refused by the
   sandbox's permission gate, so the browser→Cloudinary→`POST /images` round trip is **untested**.
   I also deliberately did not exercise `DELETE /api/admin/images/:id` or `DELETE /api/admin/cars/:id`
   on real rows, because both destroy Cloudinary assets irreversibly. What *was* tested: reorder
   (two-phase, verified against the `(carId, sortOrder)` unique index) and set-primary, both reverted;
   and car delete on two throwaway cars I created myself. **The upload path is the single largest
   untested surface in the build, and P06's report does not claim to have run it either.**

2. **Pixel-level visual regression (Section I).** Running `2bf460f` side by side needs a second
   checkout with its own `node_modules`, which means writing to the repo (a worktree) or installing
   dependencies — both outside "write exactly one file". I substituted a class-inventory diff and a
   rendered-text diff, which catches structural and content changes but would miss a spacing or
   shadow regression that only shows up rendered.

3. **Anything that only exists in production.** `vercel.json`'s SPA rewrite, the `secure` cookie flag,
   and the CDN actually honouring `s-maxage=60` were all read, not deployed. The dev topology
   (Vite :3000 proxying `/api` → :3001) was used throughout.

4. **Real mobile devices.** Section E6 was done with Chrome device emulation at 375×812, not on a
   phone. The touch drag-to-create gesture in the fleet calendar (`FleetCalendar.tsx:169-214`, the
   long-press/`elementFromPoint` path) was verified only by reading the code and by inspecting the
   grid's `data-selectable` / `data-day` attributes — I did not synthesise a pointer drag.

5. **Lighthouse (PLAN.md Phase 7).** Not run. The build emits one 630 KB JS chunk (189 KB gzipped)
   with a Vite warning about it; no code splitting is configured. That is a performance observation,
   not a measurement.

6. **Two offices in one city.** `cityOptions()`'s dedup-and-count path (`locationHelpers.ts:78-110`)
   was read, not exercised — I only ever had two branches in two different cities.

7. **`localStorage['sv-cities']` restore.** Read from `cityFilter.ts:94-101`. The identical mechanism
   for dates (`sv-dates`) *was* observed working: a range set via the "5 Days" preset came back on a
   later load that had no `?start`/`?end`.

8. **Whether MAJOR 2 also bites the admin panel in practice.** `fromDiskCache=true` was logged for
   `/api/locations`, and `AdminPage`/`CarFormDialog` consume it, but I did not reproduce a stale
   branch dropdown in the UI.

9. **The `?force=true` branch delete under concurrent load**, and any behaviour of the Neon HTTP
   driver's `db.batch()` under contention. Single-threaded only.

---

## What this run changed, and how it was put back

Verification needed a login and write access. For the record:

- Created a throwaway admin `p07-verify@example.invalid`, used it, then **deleted the row**. The
  owner's own account (`sreenivasulu.c04@infosys.com`) is the only one left and was never touched.
- Created and deleted: two availability blocks on `force-traveller-mini-bus`, one expired block on
  `mahindra-scorpio`, one branch `p07-test-city`, two cars `p07-verify-car` / `p07-verify-car-2`.
- Temporarily changed and restored: `toyota-innova-crysta` price (0 → 2500 → 3333 → 4444 → **0**) and
  driver override (null → 1500 → **null**); `force-traveller-mini-bus` availability and branch
  (proddatur → null → **proddatur**); `force-traveller-mini-bus` image order and primary flag.

Final state re-read from `GET /api/cars` and `GET /api/locations`: 8 cars, all `pricePerDay: 0`, all
overrides `null`, all `availability: true`, all `locationId: proddatur`, 0 blocks, 43 images
(2/4/7/7/5/7/5/6), 1 location. **Identical to the state at the start of this run.** No Cloudinary
asset was created or destroyed.

`git status` shows only the `.claude/CLAUDE.md.md` → `.claude/CLAUDE.md` rename described in the
NOTES, which this verification did not perform.