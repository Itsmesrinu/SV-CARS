# P04 — Admin Rebuild  ·  WAVE 1  ·  **PARALLEL** (runs alongside P01, P02, P03, P05)

You are building the thing the client actually asked for: a dashboard where the owner adds cars, edits their details and prices, uploads photos — and, since the multi-city amendment, **creates the branches he rents from**. Today's admin page is a shell running on four fake Unsplash cars.

**First:** read `prompts/CONTRACT.md` end to end (§3.1 old→new field mapping, §4 helpers, §6 `CarImage`, §7 `lqip`, §9 client, §10 hooks). Then read `docs/admin-rules.md`, `docs/design-system.md` and `.github/instructions/admin.instructions.md` — they constrain what you're allowed to change visually.

**You own:**

```
src/pages/AdminPage.tsx
src/pages/AdminLoginPage.tsx        (replace P00's stub entirely)
src/components/admin/**             AdminSidebar, AdminStatCard, AdminVehicleCard + new files
src/types/admin.ts
```

**You must not touch:** `src/App.tsx` (P00 already registered `/admin` + `/admin/login` and the `RequireAdmin` guard — you do **not** need to add routing), `src/main.tsx`, any customer page, `src/lib/**`, `src/hooks/**`, `src/components/CarImage.tsx`, `src/components/ui/**`, `server/**`.

**Coding against unfinished work.** P03 is writing `src/lib/api.ts`, `src/hooks/`, `CarImage` and `createLqip` in another session at the same time. Import them by their frozen contract signatures. Your imports will not resolve until P03 lands — that is expected. Judge `tsc` only on errors originating in your own files.

---

## Current state you are replacing

`src/pages/AdminPage.tsx` has `INITIAL_VEHICLES` — four hardcoded Unsplash cars (Swift Dzire, Volkswagen, Porsche 911, Range Rover) — held in `useState`, so every edit is lost on refresh. `src/types/admin.ts` defines a `Vehicle` type with `serial`, `dailyRate` and `category: 'Luxury' | 'SUV' | 'Sport'` that matches neither `docs/data-model.md` nor the real fleet (which is Mini Bus, MPV, SUV, and several cars with no body type at all). "Swap Image" and "Edit Specs" in `AdminVehicleCard` are buttons with no `onClick`.

**Delete `INITIAL_VEHICLES` and the `Vehicle` type entirely.** `src/types/admin.ts` keeps only `StatItem` (still used by `AdminStatCard`) plus any new admin-only view types you need. Everything else flows from `CarDTO`.

## The visual constraint — read this before you write JSX

`docs/design-system.md` says: keep the existing blue, rounded cards, soft shadows, typography and button shapes; **do not introduce new visual styles.** `.github/copilot-instructions.md` says: do not redesign the UI unless explicitly instructed.

So: `AdminSidebar`, `AdminStatCard` and `AdminVehicleCard` keep their exact current appearance — same class strings, same `motion` animations, same `shadow-[0_20px_40px_rgba(25,28,34,0.04)]`, same emerald/primary accents. You are rewiring their **data and handlers**, not restyling them. For genuinely new UI (the add-car form, the image manager), compose from classes already present in those three files. If you find yourself picking a colour, you've gone wrong — go copy one.

## Task 1 — `src/pages/AdminLoginPage.tsx`

A single centred card: email, password, submit, error message. Uses `useAdminAuth().login` from P03.

- On success, navigate to `/admin` and invalidate `qk.me` so the guard re-runs.
- On a 401 (`ApiRequestError` with `code: 'invalid_credentials'`), show one neutral message — *"Incorrect email or password."* Do not distinguish unknown-email from wrong-password; P01 deliberately made the server not leak that, so don't leak it in the UI.
- Disable submit while pending; show a spinner (reuse `Loader2` from `lucide-react`, as `ConciergeSidebarContent` already does).
- **No customer navbar or footer.** P00 registered this route outside `CustomerLayout` — keep it that way. `docs/admin-rules.md`: admin-only features stay hidden from customers.
- No "forgot password", no "sign up". One owner, password rotated via `npm run create:admin`.
- `type="password"`, `autoComplete="current-password"`, and let the browser manage it. Do not build a custom show/hide toggle unless it costs nothing.

## Task 2 — `src/pages/AdminPage.tsx` — the dashboard

Replace `useState(INITIAL_VEHICLES)` with `useCars()` from P03. Keep the entire page structure: mobile top bar, header with "System Live" pill and bell, the three-stat grid, the filter row, the `motion.div` fleet grid with `AnimatePresence`, and the "Load More Vehicles" button.

**Stats** — recompute from real data, keeping `AdminStatCard` untouched:

- *Total Cars* → `cars.length`
- *Available Now* → `cars.filter(c => carAvailability(c).kind === 'available').length` — the **derived** status, so a car blocked today is correctly not counted as available
- *Needs Attention* → `cars.filter(c => c.pricePerDay === 0 || c.images.length === 0 || c.location === null).length`

A car with no branch belongs in that third tile: it is invisible to any customer who has picked a city (CONTRACT.md §15.5), and this tile is the only place the owner would ever find out.

That third tile replaces "In Maintenance" (there is no maintenance concept in the data model) and it earns its place: it tells the owner exactly which cars are not yet ready to show customers, which is the single most useful thing this dashboard can surface right after migration, when all 8 cars are sitting at price 0. Keep the `variant: 'warning'` styling and the `build` trend icon.

The current `trend` strings — `'+2 this month'`, `'85% utilization rate'`, `'3 due for release today'` — are **fabricated numbers**. Delete them or replace them with something genuinely derivable (e.g. `${n} of ${total} ready to publish`). `.github/copilot-instructions.md` forbids inventing business details, and a fake utilisation rate on the owner's own dashboard is worse than no number.

**Filter row** — replace `['All','Luxury','SUV','Sport']` with categories derived from the live data: `['All', ...new Set(cars.map(c => c.carType).filter(Boolean))]`, plus a `'No type'` bucket if any car has `carType === null` (several do, deliberately). Keep the exact pill styling.

**"Load More Vehicles"** — with 8–30 cars, pagination is theatre. Either wire it honestly (slice at 12, reveal on click, hide the button when everything is shown) or remove it. **Do not leave a dead button.** Wiring it honestly is the better choice since the fleet will grow.

**Filter row, second control — city.** Once more than one branch exists, add a city filter pill group beside the category pills, sourced from `useLocations()`. Below two cities, render nothing: with one office the row must look exactly as it does today. Reuse the exact pill classes; no new styles.

**Add "+ Add Car"** in the header next to the bell, styled like the existing primary buttons (`bg-primary text-white ... rounded-xl font-bold`). Opens the Task 4 form.

**Add "Availability"** in the header too, as a `<Link to="/admin/availability">` styled like the secondary button. P00 registered that route against a stub and **P09 is building the fleet calendar behind it in another session** — your job is only the entry point. Do not build a calendar yourself and do not touch `src/components/admin/availability/**`; that directory is P09's.

**Add "Manage Cities"** next to it, styled as the secondary variant already used elsewhere (the outline button in `OfficeLocation.tsx:38` is the pattern: `border-2 border-primary text-primary`). Opens the Task 6 branch manager. This is the entry point for the whole multi-city feature, so it has to be visible without hunting — do **not** bury it behind the sidebar's dead nav items (`Pricing`, `Availability`, `Bookings`, `Analytics` are all `href="#"` today; leave them alone and report them, they are pre-existing and out of your scope).

**Loading and error states.** While `useCars()` is pending, render P03's `<FleetCardSkeleton />` in the grid. On error, show a retry affordance — not a blank page. Include a logout button in `AdminSidebar` (bottom, matching its existing item styling) calling `useAdminAuth().logout` then navigating to `/admin/login`.

## Task 3 — `src/components/admin/AdminVehicleCard.tsx`

Same visual card, real data and real persistence. Props become `{ car: CarDTO }` and it uses P03's mutation hooks directly.

Field mapping — use CONTRACT.md §3.1 and the `src/lib/carHelpers.ts` helpers, **never** a hand-rolled mapping (P05 is mapping the same fields in parallel and both must agree):

- Image → `<CarImage image={primaryImage(car)} alt={car.name} sizes="(max-width: 768px) 100vw, 400px" />` replacing the raw `<img src={vehicle.image}>`. Leave `cldFit` at its `'limit'` default here — per CONTRACT.md §6.1, the owner should see the whole uncropped photo he uploaded, unlike the customer-facing cards which crop to a fixed box.
- `vehicle.serial` → there is no serial in the data model. Show `car.id` (the slug) in that slot, labelled *"ID"* instead of *"Serial"*. Do not invent serial numbers.
- `vehicle.dailyRate` → `car.pricePerDay`, still an inline `<input type="number">`, but debounced ~600ms and persisted via `useUpdateCar`. **When `pricePerDay === 0`, render the input empty with a `Set price` placeholder** rather than a literal `0` — after migration all 8 cars sit at 0 and showing eight zeros reads like a bug.
- Availability toggle → `car.availability` via `useUpdateCar`. Keep the emerald peer-checked switch exactly as it is. Since Amendment 2 this is the **master switch** — "off the road indefinitely", not "out until Friday" (CONTRACT.md §16.2). Label it so the owner can tell: the tooltip or helper text should say something like *"Off = not rentable at all. For dated bookings use the availability calendar."*
- **Status line** → render `availabilityLabel(carAvailability(car))` from `src/lib/availability.ts` (P00) next to the toggle, so the owner sees the *derived* state: a car whose switch is on but which is blocked today reads **"Available from 08 Sep"**, not "Available". Reuse the existing status-badge classes; no new colour for this state. **Never render `car.availability` as the customer-facing status** — that is the exact bug §16.2 exists to prevent, and it is easy to write by accident here because the toggle is right there.
- Featured toggle → `car.isFeatured`.
- Home Delivery toggle → `car.deliveryAvailable`.
- Delete → `useDeleteCar`, behind a confirm step. This destroys the car **and its Cloudinary images** (P01 destroys the assets server-side), so it is irreversible. Use a proper confirmation, not `window.confirm` if you can compose one cheaply from existing styles — but `window.confirm` is acceptable and far better than no guard.
- Branch → show `officeLabel(car.location)` in the card, or a muted *"No branch"* when it is null. Read-only here; the form is where it changes. Render nothing at all when only one branch exists — with a single office the label is noise on every card, and the card must stay visually identical to today.
- **"Swap Image"** → opens the Task 5 image manager for this car.
- **"Edit Specs"** → opens the Task 4 form in edit mode.

Every toggle needs optimistic feedback and a rollback on failure, plus a visible pending indicator. A switch that silently doesn't save is the worst possible bug in an admin panel.

## Task 4 — Car form (`src/components/admin/CarFormDialog.tsx`)

One component serving both create and edit — `{ mode: 'create' } | { mode: 'edit', car: CarDTO }`. A modal or slide-over composed from existing card styles.

Fields, grouped:

- **Identity** — `name` (required), `carType` (free text with datalist of existing values — the real fleet uses Mini Bus / MPV / SUV and must accept new ones), `seating`, `fuel`, `transmission`, `year`, `description`.
- **Branch** — `locationId`, a `<select>` over `useLocations()` showing `officeLabel(loc)` (`src/lib/locationHelpers.ts`, P00) with an explicit *"No branch yet"* option mapping to `null`. Default a **new** car to the only branch when exactly one exists — that is not inventing data, it is the single true answer, and it stops every new car landing in the invisible-to-customers state of §15.5. When the list is empty, show a short line pointing at "Manage Cities" instead of an empty dropdown.
- **Pricing** — `pricePerDay`, then `driverPricePerDay`, `kmLimitPerDay`, `extraKmCharge`. **These three must support an explicit empty state meaning "inherit the default"**, and the placeholder should show the inherited value from `useSettings()` (e.g. placeholder `1000 (default)`). This is the whole point of the nullable columns: the owner sets a per-car driver rate only when it differs. Sending `0` where you meant `null` silently makes a car's driver free — get this right.
- **Flags** — `selfDrive`, `withDriver`, `availability`, `deliveryAvailable`, `isFeatured`.
- **Other** — `tags` (simple comma-separated or chip input). The old free-text `location` field is gone: a branch is a real row now, chosen above.

Client-side validation mirroring P01's zod rules (non-negative integers; `seating` 1–60; `year` 1980–2100; non-empty name) so the owner gets immediate feedback, but treat the server as the authority and surface its `validation_failed` messages if they differ.

Leave optional fields **empty**, not pre-filled with guesses. In create mode, `id` is omitted and the server slugifies the name.

## Task 5 — Image manager (`src/components/admin/CarImageManager.tsx`)

This is the "adding new images" requirement from the client brief. Per car:

- **Grid of current images** via `CarImage`, ordered by `sortOrder`, with the primary one badged (reuse the existing `AdminVehicleCard` status-badge styling).
- **Upload** — file input plus drag-and-drop zone, multi-file, accepting `image/*`. Per file:
  1. `createLqip(file)` (P03) → `{ blurDataUrl, width, height }`. Canvas-based, because `sharp` is Node-only and this upload goes straight from the browser.
  2. `api.signUpload(carId, file.name)` → signature.
  3. `POST` directly to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` as `FormData` with `file`, `api_key`, `timestamp`, `signature`, `folder`, `public_id` — **exactly the fields P01 signed, no more and no fewer**, or Cloudinary rejects the signature. Read P01's `server/README.md` for the precise list.
  4. `api.addImage(carId, { publicId, width, height, blurDataUrl, kind, alt })` using Cloudinary's **returned** `public_id`, not your constructed guess.
  - Show per-file progress (`XMLHttpRequest.upload.onprogress`, since `fetch` has no upload progress). Phone photos over mobile data take real time and a frozen dialog looks broken.
  - Handle partial failure: one bad file must not abort the rest; report which failed and allow a retry.
  - Client-side guard on size (~10 MB) and type before uploading, with a clear message.
- **Reorder** — drag to reorder, then `useReorderImages` with P03's optimistic update. Order is what customers see in the gallery, so this matters. If drag-and-drop is fighting you, ship up/down arrow buttons instead — a working simple control beats a broken elegant one. Do **not** add a drag-and-drop library; P00 installed no such dependency and you must not add one.
- **Set primary** — `useUpdateImage({ isPrimary: true })`. The primary image is the fleet-card thumbnail.
- **Kind** — a small select over `ImageKind` (`main`/`front`/`side`/`inside`/`back`/`other`).
- **Delete** — `useDeleteImage` with a confirm. This destroys the Cloudinary asset permanently.

## Task 6 — Branch manager (`src/components/admin/LocationManagerDialog.tsx`)

**This is the multi-city amendment's whole reason for existing** (CONTRACT.md §15, PLAN.md Amendment 1). The client said it plainly: he wants to type in a city, the office address, and a map link, and have the site use them.

Same modal shell as `CarFormDialog`, opened by the "Manage Cities" header button. A list of existing branches plus an add/edit form. Fields, in this order — the first three are the client's literal request, so label them in his words:

| Field | Control | Notes |
| --- | --- | --- |
| **City** | text, required | *"Proddatur"*. What the customer picks. The server slugifies it into the id |
| **Office address** | textarea, required → `addressShort` | Label it *"Short address (shown on booking)"*. This exact string becomes the `Pickup:` line of every WhatsApp message for cars at this branch — say so in helper text under the field, because it is the highest-consequence input on the screen |
| **Map link** | url, optional → `directionsUrl` | Label *"Google Maps link (Get Directions button)"*. Helper text: *"Open the office in Google Maps → Share → Copy link."* Leave empty and the button falls back to a map search on the address — say that too, so the owner knows it is optional rather than broken |
| Full address | textarea, optional → `addressFull` | The long postal address for the office section on the home page |
| Office name | text, optional | *"Proddatur Branch"*. Placeholder shows the `${city} Branch` default so the owner sees what he gets by leaving it blank |
| WhatsApp number | text, optional | Placeholder shows the global number from `useSettings()` and the words *"(default)"* — the same inherit-the-default pattern as the per-car pricing fields. Digits with country code |
| Active | toggle | Off hides the city from customers without deleting anything |
| Order | number → `sortOrder` | Controls the order cities appear in the picker |

Behaviour:

- **Validate the map link client-side before submitting**: `http://` or `https://` only. Paste a `javascript:` value and you get a field error, not a request. The server rejects it too (P01), and `directionsHref()` re-checks at render — three layers, because this value ends up in an `href` the owner's own browser follows (§15.3).
- **Live preview of the Get Directions target.** Under the map-link field, render the resolved `directionsHref({...draft})` as a real link the owner can click before saving. He pasted a URL; let him confirm it points where he thinks. This is worth the fifteen lines.
- **Delete** hits `409 conflict` while cars still reference the branch. Do not swallow it: show *"N cars are still assigned to this branch"* with two honest choices — *Deactivate instead* (`isActive: false`, the safe default, and pre-select it) or *Delete anyway*, which re-sends with `force: true` and warns that those N cars will have no branch and will disappear from city-filtered views. Never make "Delete anyway" the easy path.
- Empty state, before any branch exists: one line explaining that adding a city turns on city filtering for customers, plus the add form. No fake example city.

**Do not invent a single address, city, phone number or map URL** — not as a placeholder value, not as demo data, not in an empty state. `.github/copilot-instructions.md` forbids inventing business details, and a fabricated branch address is one a real customer could drive to.

---

## Verify your slice

The API may not be running (P01 is mid-flight) and P03's files may not exist yet. Sequence your work: write everything, then once P01 and P03 have landed, run `npm run dev:all`, log in, and exercise every control. If they haven't landed by the time you finish, say so plainly and hand the runtime verification to P06 — **do not claim you tested flows you couldn't run.**

When you can run it, walk this list:

1. `/admin` while logged out → redirects to `/admin/login`.
2. Wrong password → neutral error, no crash. Correct password → lands on the dashboard.
3. All 8 real cars appear with real Cloudinary images.
4. Edit a price → refresh → it persisted.
5. Toggle availability → check `/all-cars` shows the change (within the 60s public cache window; the admin view is instant).
6. Add a car → it appears at the end of the fleet, with the "Needs Attention" stat incrementing.
7. Upload two photos to a car → both appear, reorder them, set the second primary → the fleet card thumbnail changes.
8. Delete an image → gone from the gallery.
9. Reload the page mid-session → still logged in (the cookie is 7-day httpOnly).
10. **Add a second city** with an address and a map link → it appears in the car form's branch dropdown, the dashboard's city filter appears, and moving a car to it sticks across a refresh.
11. Try to delete a branch that still has cars → the 409 path shows the count and offers deactivate; deactivating hides the city from `/api/locations` but keeps the cars.
12. Paste `javascript:alert(1)` into the map link → field error, no request sent.

## Acceptance

1. `INITIAL_VEHICLES` and the `Vehicle` type are gone; nothing in `src/` references them.
2. No fabricated data anywhere — no invented serials, trend percentages, prices, or years.
3. The three admin components look **pixel-identical** to before; `git diff` on them should show data/handler changes, not class-string churn.
4. Every control persists to the DB. No dead buttons remain.
5. No new colours, fonts, radii or shadows. No new npm dependencies.
6. Admin UI is unreachable and invisible to customers — nothing you built leaks into `CustomerLayout`.
7. You changed zero files outside your ownership list — **especially not `src/App.tsx`**.
8. The owner can create a branch with a city, an address and a map link, and assign a car to it — the amendment's acceptance criterion in one line.
9. With exactly one branch, the dashboard and vehicle cards are visually identical to how they were before the amendment (no city filter row, no branch label).

## Commit

`git add src/pages/AdminPage.tsx src/pages/AdminLoginPage.tsx src/components/admin src/types/admin.ts && git commit -m "feat(admin): rebuild dashboard on live car data with image upload and pricing editor"`

Never `git add -A` — four other sessions have work in progress in this tree.

## Report back

What you wired, what you had to stub because P01/P03 hadn't landed, which verification steps you actually ran versus deferred to P06, and any contract mismatch you hit against P03's exports.
