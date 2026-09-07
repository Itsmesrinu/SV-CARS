# P05 — Public Pages & WhatsApp Consolidation  ·  WAVE 1  ·  **PARALLEL** (runs alongside P01–P04)

You are switching every customer-facing page from the hardcoded `src/data/cars.ts` to live API data, replacing every raw `<img>` with `CarImage`, collapsing four duplicated WhatsApp URL builders into one data-driven function, and — since the multi-city amendment — letting the customer **pick the cities he wants to rent in** and giving the dead "Get Directions" button a real destination.

**First:** read `prompts/CONTRACT.md` end to end — §3.1 (old→new field mapping), §4 (helpers), §6 (`CarImage`), §10 (hooks) and **§11 (the WhatsApp builder) are your specification.** Then read `docs/booking-rules.md`, `docs/skills.md`, `docs/design-system.md` and `.github/copilot-instructions.md`.

**You own:**

```
src/lib/booking.ts                          (new)
src/lib/cityFilter.ts                       (new — the city-selection state, CONTRACT.md §15.2)
src/lib/dateFilter.ts                       (new — the date-selection state, CONTRACT.md §16.4)
src/components/CitySelector.tsx             (new)
src/components/DateRangePicker.tsx          (new)
src/pages/HomePage.tsx
src/pages/AllCarsPage.tsx
src/pages/CarDetailsPage.tsx
src/pages/BookingPage.tsx
src/components/AvailableCars.tsx
src/components/OfficeLocation.tsx           (branch data + the dead Get Directions button)
src/components/Hero.tsx                     (THE CITY STRING ONLY — nothing else)
src/components/booking/**                   BookingSummaryContent, ConciergeSidebarContent
src/components/ShareLocation.tsx
DELETION: src/data/cars.ts
```

**You must not touch:** `src/App.tsx`, `src/main.tsx`, `src/data/carImageMap.ts` (**leave it — P02's migration script imports it**), `src/pages/AdminPage.tsx`, `src/components/admin/**`, `src/lib/{api,cloudinary,carHelpers,locationHelpers,lqip}.ts`, `src/hooks/**`, `src/components/CarImage.tsx`, `src/components/ui/**`, `server/**`. Also leave `Navbar`, `Footer`, `Testimonials`, `BrandLogos`, `VideoGallery` alone — they contain no car or branch data.

> `OfficeLocation.tsx` and `Hero.tsx` were on that leave-alone list before the multi-city amendment. They are yours now, for one reason each: `OfficeLocation` hardcodes the office (address at line 19, a **dead** Get Directions button at line 38, a map iframe with invented coordinates at line 61) and `Hero` says *"in Proddaturu"* at line 32. In `Hero.tsx` change **the place name and nothing else** — not the layout, not the classes, not the rest of the copy.

**Coding against unfinished work.** P03 is writing `src/lib/api.ts`, the hooks, `CarImage` and `prefetchCarImage` right now in another session. Import them by their frozen signatures; the imports won't resolve until P03 lands. Judge `tsc` only on errors originating in your own files.

---

## The single most important rule in this prompt

`.github/copilot-instructions.md`: *"Keep WhatsApp booking as the main booking action."* `docs/skills.md` lists exactly what the message must contain. The client's requirement is explicit: **keep the existing WhatsApp flow, add no payments.**

So: **the generated WhatsApp message text must come out byte-identical to today's output** for the same inputs. The only change is that the phone number, pickup address, driver rate, km limit and extra-km charge now come from the database instead of being hardcoded literals.

Open `src/pages/CarDetailsPage.tsx:98-129` and `src/components/booking/ConciergeSidebarContent.tsx:58-86` and **copy the line arrays across character by character.** Do not retype them from memory. The emoji (`🚗`, `📍`), the bullet character (`•`), the exact wording, the blank lines, the line order, `toLocaleString()` on every amount — all of it is part of the contract. The two pages have deliberately *different* wording (one says "I'd like to book", the other "I'd like to confirm my booking for"), which is why `buildWhatsAppUrl` takes a `variant: 'details' | 'confirm'` flag.

No payments. No Razorpay, no Stripe, no checkout, no cart, no "Pay ₹X now", no deposit field. If you catch yourself adding one, stop.

## Task 1 — `src/lib/booking.ts`

Implement exactly `BookingContext` and `buildWhatsAppUrl` from CONTRACT.md §11.

Replace these hardcoded values with data, using `src/lib/carHelpers.ts` (P00) so you and P04 can't drift apart:

| Hardcoded today | Replacement |
| --- | --- |
| `const phone = '919704201247'` | `bookingPhone(car, settings)` — the car's branch number, else the global one |
| `'Pickup: Narasimhapuram, Proddatur'` | `pickupAddress(car, settings)` — the car's branch address, else `settings.pickupAddress` |
| `const driverRate = 1000` | `effectiveDriverRate(car, settings)` |
| `'KM Limit: 100 km/day'` | `effectiveKmLimit(car, settings)` |
| `'Extra KM Charge: ₹50/km'` | `effectiveExtraKm(car, settings)` |
| `car.category` | `car.carType ?? ''` |

Totals come from `calcTotal(car, settings, days, mode)` — the same arithmetic as today (`basePrice = pricePerDay * days`, driver charge added only in driver mode).

**The multi-city amendment changes where two values come from, and nothing else.** The `wa.me` number and the `Pickup:` line now resolve per branch, and for today's fleet they resolve to exactly the same strings as the literals they replace — which is why byte-identity still holds. **Do not add a branch line, a city line, or a directions link to the message.**

**Amendment 2 adds exactly two lines and no more** — CONTRACT.md §11.1. Straight after `Duration:`, in that variant's bullet style:

```
Duration: 3 Days                 • Duration: 3 Days
Start Date: 05 Sep 2026          • Start Date: 05 Sep 2026
End Date: 08 Sep 2026            • End Date: 08 Sep 2026
```

Formatted with `formatDate()` from `src/lib/availability.ts` — `'05 Sep 2026'`, a month **name**. Never `05/09/2026`: the owner reads this on a phone and `05/09` versus `09/05` is a car handed over on the wrong day. Everything else in both messages stays byte-identical.

**Export `buildWhatsAppLines(ctx): string[]` and build `buildWhatsAppUrl` on top of it.** `ConciergeSidebarContent` currently renders its own hand-written JSX copy of the message as a live "Message Preview" (lines 118-138) — two hand-maintained copies of the same text, already free to drift, and you are about to add lines to both. Render the preview **from this array** so it cannot lie about what will actually be sent. Bold the label up to the first colon if you want to keep the current emphasis; do not reconstruct the sentences by hand a second time.

One judgement call to handle honestly: **when `pricePerDay === 0`**, today's code would send `Price Per Day: ₹0` and `Total: ₹0` to the owner's WhatsApp. After migration all 8 cars sit at 0 until he enters real rates. Omit the price and total lines entirely in that case and add a single line asking for a quote — `Please share the rate for these dates.` A message quoting ₹0 is worse than one that asks. Note this decision in your report; it is the one place you are permitted to add a line to the message body, and only because ₹0 is not a real price.

Add `src/lib/booking.test-notes.md`? No — instead, in your report, paste the exact before/after message text for one car in both modes so P07 can diff it.

## Task 2 — City selection (`src/lib/cityFilter.ts`, `src/components/CitySelector.tsx`)

The client's request, in his words: *"first we ask the user to select the existing location or city names — the user can select multiple — and based on that we show all the cars and then the car details."* Read CONTRACT.md §15.2 and §15.4 before writing a line of this.

**`src/lib/cityFilter.ts`** — implement `useCityFilter()` exactly as §15.2 freezes it. The rules are short and all four matter:

1. The URL owns the state: `?cities=proddatur,kadapa`. Use `useSearchParams()` from `react-router-dom` (already a dependency) so a filtered fleet is a shareable link — this client's customers pass links around on WhatsApp, so this is a real feature, not purism.
2. Mirror to `localStorage['sv-cities']`, and restore from it **only when the URL carries no `cities` param**. A deep link always beats a remembered choice.
3. Ignore unknown slugs instead of erroring — a city the owner deleted must not produce an empty page.
4. "All selected" and "none selected" mean the same thing: show everything. **Never render "0 cars" because of a stale filter.**

**`src/components/CitySelector.tsx`** — the multi-select itself. Props: `{ className?: string }`; it reads `useLocations()` (P03), `useCars()` and `useCityFilter()` itself.

- **Renders `null` when `cityOptions(locations, cars).length <= 1`.** This is §15.4 and it is the single most important line in your slice: with one office the customer pages must look exactly as they do today. Write this check first, not last.
- With two or more cities: a row of toggleable pills, one per city, each showing the city and its car count, plus an "All cities" pill that clears the selection. **Build it from the filter-pill classes already in `AllCarsPage.tsx:131-140`** — `rounded-full`, `bg-primary text-white` when active, `bg-surface-container-low text-slate-500` when not. Do not pick a colour, do not add a dropdown library, do not introduce a new control shape.
- Multi-select means clicking toggles; it does not replace the selection.
- Horizontally scrollable on mobile with the existing `overflow-x-auto no-scrollbar` pattern — the client's traffic is mostly phones and a wrapping pill grid pushes the fleet below the fold.

Then apply the filter with `filterCarsByCities(cars, selected)` from `src/lib/carHelpers.ts` (P00) — **do not hand-roll the matching**, P04 renders the same city names in admin and the two must agree.

## Task 3 — Date selection (`src/lib/dateFilter.ts`, `src/components/DateRangePicker.tsx`)

The client's second request: *"we let them pick a day count but not the actual start and end dates, which is compulsory — and that information goes to the owner on WhatsApp, not into the database."* Read CONTRACT.md §16.1, §16.4 and §16.5 first. **§16.1 is five rules about dates; every one of them exists because the alternative ships an off-by-one to a customer.**

**`src/lib/dateFilter.ts`** — implement `useDateRange()` exactly as §16.4 freezes it. It deliberately mirrors `useCityFilter` from Task 2, so build the second one the same way as the first:

1. URL owns it: `?start=2026-09-05&end=2026-09-08`, via `useSearchParams()`. The customer types his dates once on the fleet page and they follow him to the car page and the booking page.
2. Mirrored to `localStorage['sv-dates']`, restored only when the URL has neither param.
3. **Defaults so the state is never empty**: `start = todayInIndia()`, `end = start + 3`. That reproduces today's default of 3 days exactly, and it is what makes the dates "compulsory" without ever blocking anyone on an empty field.
4. **Repair bad input, never reject it**: clamp a past `start` to today, force `end > start`, fall back to the defaults on garbage. A WhatsApp link shared three weeks ago must still open a usable page.
5. All arithmetic through `src/lib/availability.ts` (P00) — `todayInIndia`, `addDays`, `rentalDays`. **Do not call `new Date()` in this file.** Rule 4 of §16.1: a customer opening the site from Dubai must see the same "today" as the owner in Proddatur.

**`src/components/DateRangePicker.tsx`** — two native `<input type="date">` fields labelled *Start date* and *End date*, plus the derived duration. Props: `{ car?: CarDTO; className?: string }`.

- **Native inputs, no date library.** None is installed, you may not add one, and the native control gives a proper mobile picker for free.
- `min` on start is `todayInIndia()`; `min` on end is `start + 1`. Belt and braces with the repair logic — the browser stops most bad input before it reaches your state.
- Show the resulting duration in the existing type scale: *"3 Days"*. That number is what the price is computed from, so it must be visible next to the fields.
- **When `car` is supplied and the chosen range overlaps one of its blocks**, show an inline warning naming the first free date and a one-tap **"Shift to 12 Sep"** that moves the range forward keeping its length. Use `isBlocked` and `nextFreeDate` from P00's helper — do not re-derive the arithmetic.
- **Never disable the WhatsApp CTA over a date conflict.** Warn, offer the shift, let him send. An enquiry about an unavailable car is still a lead — the same reasoning already applied to booked cars, and the owner would rather receive it.
- Style from what exists: the day-preset buttons at `CarDetailsPage.tsx:232-242` and the filter-bar selects are your palette. No new colours, radii or shadows.

## Task 4 — `src/pages/AllCarsPage.tsx` (fleet)

- Swap `import { cars } from '@/src/data/cars'` for `useCars()`.
- `<FleetCardSkeleton />` grid while pending; a retry affordance on error. Not a blank page — the whole point of the exercise is no visible loading breakage.
- Replace the raw `<img src={car.image}>` at line ~17 with:
  ```tsx
  <CarImage
    image={primaryImage(car)}
    alt={car.name}
    sizes="(max-width: 768px) 50vw, 33vw"
    cldFit="auto"        /* c_auto,g_auto — see CONTRACT.md §6.1 */
    aspect={16 / 9}
    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
  />
  ```
  `cldFit="auto"` matters here specifically: this card is a **fixed-height** box (`h-28 md:h-64`) with `object-cover`, so without a content-aware server-side crop the browser can slice the front off a car. Keep the `h-28 md:h-64` container and the hover transform.
- Field mapping via CONTRACT.md §3.1: `car.status === 'available'` → `car.availability`; `car.category` → `car.carType ?? ''`; `car.type.map(...)` → `driveModes(car)`. The existing `[car.year || null, car.category || null].filter(Boolean).join(' • ')` pattern already handles missing values gracefully — **preserve that defensive style**, since `year` and `transmission` are null for the whole current fleet.
- The specs grid renders `car.transmission` and `car.fuel`, both nullable now. An empty spec tile with a `⚙️` and no label looks broken — hide the tile when its value is absent rather than rendering an empty one.
- Keep hiding the price when `pricePerDay === 0` (line 46 already does this — do not regress it).
- Keep every class string, the `FilterBar` behaviour, and the card layout identical.

City filtering (CONTRACT.md §15):

- Mount `<CitySelector />` in `FleetFilterBar`, at the **start of the left-hand pill row** (before "Available Now"), so the city choice reads as the first, broadest filter. It renders nothing below two cities, so today's bar is unchanged.
- The grid renders `filterCarsByCities(cars, selected)`. When the filter leaves zero cars — a real possibility once a second city exists — show a short empty state offering to clear the filter, reusing the "Car Not Found" block's markup from `CarDetailsPage.tsx:72-79`. A silently empty grid looks like a broken page.
- `FleetHero`'s available count (line 105) counts the **filtered** list, not all cars, or the headline number contradicts the grid beneath it.
- Line 114 hardcodes *"in Proddaturu"*. Replace the place name with the selected cities (`'in Proddatur & Kadapa'`), or with the full active-city list when nothing is selected. One city → the sentence reads exactly as it does today. **Change the place name only**; leave the rest of that sentence, and every class, alone.
- The other selects in that bar (Car Model, Fuel Type, Seating, Sort By) are **dead controls today** — they have no state at all. Wiring them is not your job and not in scope; leave them exactly as they are and note them in your report so P07 records them as pre-existing.

Date filtering (CONTRACT.md §16.6) — this is the payoff for building a calendar at all:

- Mount `<DateRangePicker />` in `FleetFilterBar` beside the city selector. The customer sets his dates once, here, and they travel with him via the URL.
- **Order, don't hide.** Cars that can serve the whole range (`availableForRange(car, start, end)`) render first and normally. The rest render **after** them, visually muted (reuse the existing `opacity-90` treatment the booked card already uses at line 36), with `Free from <date>` on the card via `availabilityLabel`. A customer who sees an empty fleet leaves; one who sees "free from the 12th" messages the owner. Never filter a car off the page for dates.
- The status pill uses `availabilityLabel(carAvailability(car))` — **not** `car.status === 'available'` and **not** `car.availability`. §16.2: reading the boolean directly shows "Available" for a car that is out until Friday.
- `FleetHero`'s count reflects cars available **for the selected range**, and its label should say so once dates are set.
- The "View Details" link carries the dates: `/car/${car.id}?start=…&end=…`. The customer must not retype them.
- The currently-booked card at line 94 renders a disabled *"Currently Booked"* button. Since a customer can now ask about future dates, relabel it to the derived status and **keep it clickable** through to the detail page — a car free from the 12th is a car worth enquiring about.

## Task 5 — `src/pages/CarDetailsPage.tsx` (gallery + booking)

The biggest file in your slice, and the performance-critical one.

- `useCar(id)` and `useSettings()` replace the `cars.find()` at line 22. Keep the existing "Car Not Found" block (lines 72-79) for the 404 case — and make sure a *pending* query doesn't briefly flash it. Render `<CarDetailSkeleton />` while loading; only show Not Found once the query has actually errored with `not_found`.
- **Gallery** — `IMAGES` becomes `CarImageDTO[]`. Replace the `motion.img` at line 138 with `CarImage`, keeping the `AnimatePresence` crossfade, the `aspect-[16/9] md:aspect-[21/9]` box and the prev/next controls. Set **`priority` on the first frame** (index 0) — it is the largest contentful paint on this page. Thumbnails use `CarImage` with a small `sizes`.
- **Prefetch** — on `currentImageIndex` change, call `prefetchCarImage()` (P03) for the next and previous frames at the main-view width. This is what makes the arrows feel instant.
- **Pricing panel** — replace `const driverRate = 1000` (line 84) and the `basePrice`/`driverTotal`/`total` block with `calcTotal(car, settings, bookingDays, driveMode)`. Replace the hardcoded `100 km/day` / `₹50/km` display strings with the effective values.
- **Dates replace the local day counter.** `bookingDays` currently lives in `useState(3)` at line 26. Drive it from `useDateRange()` instead, so the value matches the fleet page and the booking page. Mount `<DateRangePicker car={car} />` inside the existing *"How many days?"* block at lines 227-243 — **keep that block's heading, its subtitle and all eight preset buttons**. The presets now call `setDays(n)`, which moves the end date and leaves the start alone; highlight the preset whose length matches the current range, exactly as the active state works today. Consider retitling the block to *"When do you need it?"* since it now takes dates — that is a copy change to two words, and the only one you are permitted here.
- **Availability, derived** — line 191's *"Available for immediate booking"* must reflect `carAvailability(car)`. For a blocked car it reads *"Available from 08 Sep"*; the emerald `CheckCircle2` should not claim immediate availability for a car that is out. Keep the existing classes and icon set.
- **WhatsApp** — delete the inline builder at lines 98-129 and call `buildWhatsAppUrl({ ..., variant: 'details' })`.
- **Keep the geolocation flow exactly as it is** (lines 31-70): the same toggle, the same `enableHighAccuracy` options, the same four `alert()` error branches. It works and the client didn't ask for a change. Pass the resulting maps link through as `locationLink`.
- **Booked cars** — when `car.availability === false`, soften the CTA: keep the button visible but relabel it (e.g. *"Check availability on WhatsApp"*) and drop the price/total lines from the message. Do not disable it outright — an enquiry about a booked car is still a lead, and the owner would rather receive it.
- **The branch panel** (lines 340-347) currently hardcodes *"Proddatur Branch"* and *"Narasimhapuram, Proddatur"*. Drive both from the car's own branch: `officeLabel(car.location)` and `displayAddress(car.location)` from `src/lib/locationHelpers.ts` (P00). Fall back to `settings.pickupAddress` with no office name when `car.location` is null (§15.5) — never render the word `null` or an empty heading.
- **Add a "Get Directions" link inside that same panel**, below the address, using `directionsHref(car.location)` with `target="_blank" rel="noopener noreferrer"`. This is the whole point of the map link the owner pastes: a customer looking at a car should be one tap from navigating to the branch it is at. Style it as a text link in the existing palette — reuse the `text-primary font-bold` treatment already in that card. Do not add a button block; the sidebar is already dense and `docs/design-system.md` forbids new shapes. Render nothing when the car has no branch.
- Line 191 says *"Available for immediate booking in Proddatur"*. Use the car's branch city; keep the rest of the sentence identical. If the car has no branch, drop the trailing `in <city>` rather than inventing one.

## Task 6 — `src/pages/BookingPage.tsx` + `src/components/booking/**`

- `BookingPage` reads `carId` from the query string and currently falls back to `cars[0]` when the id is unknown (line 14) — silently showing the wrong car and the wrong price. Replace that with `useCar(carId)` and a proper not-found state. Also drop the `|| '1'` default carId; no car has id `'1'`.
- `driverRate = 1000` at line 14 → `calcTotal(...)`.
- **`days` comes from `useDateRange()`, not from `?days=`.** The page currently reads `Number(searchParams.get('days')) || 3` at line 10; the hook reads `?start=`/`?end=` and derives the count, so the totals here provably match the detail page for the same link. Accept a legacy `?days=` by converting it to a range (`start = today`, `end = start + days`) rather than 404-ing on an old shared link.
- `BookingSummaryContent` and `ConciergeSidebarContent` take `CarDTO` + `SettingsDTO`. Replace any raw `<img>` with `CarImage`.
- In `ConciergeSidebarContent`, delete the inline WhatsApp builder (lines 58-86) and call `buildWhatsAppUrl({ ..., variant: 'confirm' })`. **Keep the geolocation share flow, the `LocationStatus` state machine and all its UI states exactly as they are.**
- **Rebuild that component's "Message Preview" (lines 118-138) from `buildWhatsAppLines()`.** It is currently a second, hand-written JSX copy of the message body — the two can already drift, and Amendment 2 adds lines to both. Map the array to `<span>`s with the label bolded up to the first colon; that keeps today's emphasis without maintaining the text twice. The preview showing something different from what WhatsApp receives is a defect a customer would catch before you do.
- That component hardcodes a `lh3.googleusercontent.com` concierge avatar URL. Leave it — it's decoration, not car data, and swapping it is out of scope.

## Task 7 — `src/components/AvailableCars.tsx` (home carousel)

- `useCars()` replaces the module-level `allCars.map(...)` transform at line 7. That transform runs at import time today; make it a `useMemo` inside the component.
- Keep the horizontal snap-scroll carousel and its arrow controls unchanged.
- `CarImage` for the card image with `cldFit="auto"` and `aspect={16/9}` (same fixed-height `h-64` reasoning as the fleet card), and `priority` on the **first card only** — it's above the fold on the home page.
- The status pill currently maps to `'Available' | 'Limited'`; `'Limited'` was invented for the static data. Use `availabilityLabel(carAvailability(car))` so it matches the fleet page exactly, and keep the existing pill classes. The amber styling the old `'Limited'` state used is a reasonable home for the "available from" case — it is already in the file, so it is not a new colour.
- Skeletons while pending. The home page must never render a collapsed empty carousel.
- **The carousel respects the city filter too**: run the same `filterCarsByCities(cars, selected)` so a customer who picked Kadapa on the home page sees Kadapa cars in the carousel right below the picker. If the filter empties the carousel, fall back to showing every car rather than an empty rail — on the home page a blank section reads as a broken site, and the customer has the picker right there to narrow it again.

## Task 8 — `src/components/ShareLocation.tsx` and the deletion

- Line 22 hardcodes `https://wa.me/919704201247`. Route it through `useSettings()`. If settings are still loading, keep the button disabled rather than opening a `wa.me` link with an empty number.
- **Delete `src/data/cars.ts`** once nothing imports it. Verify with `grep -rn "data/cars" src/`. **Do not delete `src/data/carImageMap.ts`** — P02's migration script imports it and it is the historical record of the curated image order.

## Task 9 — `src/components/OfficeLocation.tsx` + the home city picker + `Hero.tsx`

**`OfficeLocation.tsx`** is the section the client's requirement points at most directly. Three things in it are hardcoded or fake:

| Line | Today | Becomes |
| --- | --- | --- |
| 19 | `Narasimhapuram village, Proddatur mandal, Kadapa district, Andhra Pradesh, India` | `displayAddress(location)` |
| 38 | A `<button>Get Directions</button>` **with no `onClick`** — dead since the Stitch import | An `<a href={directionsHref(location)} target="_blank" rel="noopener noreferrer">` with the identical classes |
| 61 | An `iframe` whose coordinates (`!2d78.55!3d14.73`) and place id (`0x0:0x0`) are **invented** | `mapEmbedSrc(location)` |

Rules:

- Keep the section's markup, grid, classes and icons exactly as they are. You are changing where four strings come from, not how the section looks.
- Line 18's heading and lines 30-34 (proprietor name and phone) stay as they are — they are business identity, not branch data, and nothing in the amendment touches them.
- **One active branch → the section renders exactly as today**, one address card and one map. **More than one** → add a city switcher row above the card using the same filter-pill classes as `CitySelector`, defaulting to the first selected city (or the first active branch when nothing is selected), and swap the card and iframe together. Do not stack every branch down the page; the section is half the viewport already.
- The `Get Directions` `<a>` must always have a working target: `directionsHref` falls back to a maps search on the address when the owner hasn't pasted a link. **This button has never worked. Do not ship it dead a second time.**

**The home page city picker.** In `HomePage.tsx`, mount `<CitySelector />` directly above `<AvailableCars />`, inside the existing section padding — that is the "ask the user which city first" step, placed where the customer is about to look at cars. It renders nothing while there is one city, so today's home page is untouched. Do not add a heading, a banner, or an overlay.

**`Hero.tsx` line 32** — *"Self drive or rental cars in Proddaturu"*. Replace the place name with the active cities from `useLocations()` (`'in Proddatur & Kadapa'`, and for three or more, `'in Proddatur, Kadapa & Nellore'`). One city renders the current sentence unchanged. **Touch nothing else in that file** — not the classes, not the layout, not the rest of the copy. If `useLocations()` is still loading or empty, render the sentence without the trailing place name rather than flashing a placeholder.

---

## Verify your slice

Once P01 and P03 have landed and `npm run dev:all` is up:

1. Home, `/all-cars`, `/car/toyota-innova-crysta`, `/booking?carId=toyota-innova-crysta&days=3&mode=driver` all render from live data.
2. Throttle the network to Slow 3G in devtools: skeletons appear, LQIP blurs show, and **nothing jumps** as images load. Watch the CLS number in the Performance panel.
3. Click the WhatsApp button in both places and **compare the generated message against `git stash`'d output from the old code, character by character.** This is the check that matters most.
4. Gallery arrows feel instant after the first pass (prefetch working).
5. An unknown car id shows Not Found, not a wrong car.
6. With `pricePerDay = 0` (the post-migration state), no `₹0` reaches the message or the cards.
7. Set one car to `availability = false` in admin → its CTA softens.
8. **With one branch seeded, every customer page is pixel-identical to the pre-amendment build** — no city pills anywhere. Compare screenshots; this is §15.4 and P07 will check it.
9. Add a second city in admin, then: the picker appears on home and fleet, selecting one city filters both, the URL gains `?cities=`, reloading keeps the selection, and pasting that URL in a fresh browser profile reproduces the same filtered fleet.
10. "Get Directions" opens the pasted map link in a new tab — and still opens a maps search when the branch has no link.
11. A car assigned to the second branch shows that branch's address and phone in its WhatsApp message; a car with no branch falls back to the settings values.
12. Block a car's dates in `/admin/availability`, then on `/all-cars`: its card is muted, sorted below the free cars, and reads `Available from <date>` — **and its detail page agrees**.
13. Pick a range overlapping that block on the detail page → inline warning, "Shift to …" moves the range and keeps its length, and the CTA still works throughout.
14. The dates survive the whole journey: set them on `/all-cars`, click through to a car, click through to `/booking` — same dates, same day count, same total at every step, all visible in the URL.
15. **Decoded `wa.me` text contains exactly two new lines** versus the pre-build output — `Start Date:` and `End Date:` after `Duration:`. Diff it; anything else that moved is a bug.
16. The on-screen Message Preview is character-identical to the decoded `wa.me` text.
17. Open the site with the machine's timezone set to something far from IST (e.g. `America/Los_Angeles`) → the default start date is still today **in India**, and no displayed date shifts by a day.

If P01/P03 haven't landed when you finish, say so and hand runtime verification to P06 — **do not claim you tested flows you couldn't run.**

## Acceptance

1. Zero imports of `src/data/cars.ts` remain; the file is deleted; `carImageMap.ts` survives.
2. Zero raw `<img>` tags remain in your files for car photos (`grep -n "<img" src/pages src/components/AvailableCars.tsx src/components/booking`). The concierge avatar is the one allowed exception.
3. Zero occurrences of `919704201247`, `driverRate = 1000`, `100 km/day`, `₹50/km`, `Narasimhapuram`, `Proddatur`, `Proddaturu` or `google.com/maps` as literals in `src/` — `grep -rn` for each. Cities, addresses and map links are data now (CONTRACT.md §1 rule 8). The two allowed exceptions are the maps URL **templates** inside `src/lib/locationHelpers.ts` (P00's file, not yours) and the geolocation `https://www.google.com/maps?q=${lat},${lng}` builders in the share-location flow, which describe the *customer's* position, not the office.
4. Exactly one WhatsApp URL builder exists in the codebase: `src/lib/booking.ts`.
5. The message body is byte-identical to today's for non-zero prices, **except the two date lines from §11.1**. Not three lines. Not a reordering.
6. No customer booking is written anywhere — no POST on the WhatsApp click, no `localStorage` booking record beyond the date range itself, no analytics call carrying it (CONTRACT.md §1 rule 9).
7. Nothing on a customer surface reads `car.availability` directly: `grep -n "\.availability" src/pages src/components` should show only `carAvailability(...)` call sites.
6. No payment UI of any kind. No new colours, fonts, radii or shadows. No new npm dependencies.
7. Every page has a skeleton loading state and an error state.
8. You changed zero files outside your ownership list — **especially not `src/App.tsx`**.

## Commit

`git add src/lib/booking.ts src/lib/cityFilter.ts src/lib/dateFilter.ts src/components/CitySelector.tsx src/components/DateRangePicker.tsx src/pages/HomePage.tsx src/pages/AllCarsPage.tsx src/pages/CarDetailsPage.tsx src/pages/BookingPage.tsx src/components/AvailableCars.tsx src/components/OfficeLocation.tsx src/components/Hero.tsx src/components/booking src/components/ShareLocation.tsx && git rm src/data/cars.ts && git commit -m "feat(web): live API data, city filtering and one WhatsApp builder"`

Never `git add -A` — four other sessions have work in progress in this tree.

## Report back

The before/after WhatsApp message text for one car in both self-drive and with-driver mode (paste both in full — P07 diffs them), your handling of the `pricePerDay === 0` case, which verification steps you ran versus deferred, and any contract mismatch against P03's exports.