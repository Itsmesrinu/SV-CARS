# P06 — Integration & Wiring  ·  WAVE 2  ·  **SOLO — all Wave 1 sessions must be finished**

Six sessions just wrote six slices of one application against a frozen contract. Your job is to make them a single working app: run the real migrations, boot everything end to end, and fix the seams that every Wave 1 session was forbidden from touching.

**You own everything.** You are the integrator — the ownership matrix no longer applies to you. But prefer the smallest correcting edit: the Wave 1 sessions know their own slices better than you do, and a broad rewrite here throws away their reasoning.

**First, orient yourself:**

```bash
git log --oneline -20          # what actually landed
git status                     # anything uncommitted or unexpected
npx tsc --noEmit               # the true state of the tree
```

Then read `prompts/CONTRACT.md`, `prompts/PLAN.md`, and each Wave 1 session's final summary if you have it. Read `server/README.md` (P01) for the exact endpoint shapes as built.

---

## Task 1 — Reconcile the tree

**Check for ownership violations first.** Two sessions editing the same file is the failure mode this whole scheme is designed to prevent, so verify it didn't happen:

```bash
git log --oneline --name-only -15
```

Look for any file appearing under two different Wave 1 commits. If you find one, read both versions before choosing — the later commit may have clobbered the earlier session's work without either noticing.

Then make `npx tsc --noEmit` **completely green**. Expect these specific classes of breakage, which are normal and not anyone's mistake:

- **Contract drift** — P03 exported a slightly different signature than P04/P05 coded against. CONTRACT.md is the tiebreaker. Fix whichever side deviated; if both deviated in the same direction and it's an improvement, keep it and note it.
- **Stubs never replaced** — P00 left three: `server/app.ts`, `src/pages/AdminLoginPage.tsx` and `src/pages/AdminAvailabilityPage.tsx`. Confirm P01, P04 and P09 replaced all three. A surviving stub means a session silently didn't finish.
- **Dangling imports of `src/data/cars.ts`** — P05 deleted it. Anything still importing it was missed. `grep -rn "data/cars" src/`
- **`src/App.tsx` mismatch** — P00 wrote the routes and `RequireAdmin` guard against components that didn't exist yet. Verify the real `AdminPage` and `AdminLoginPage` signatures match, and that the guard actually calls the endpoint P01 built.

## Task 2 — Bring up the database

Confirm `.env.local` has all six variables from CONTRACT.md §12, then:

```bash
npm run db:push                                          # schema -> Neon
npm run seed:settings                                    # the single settings row
npm run seed:locations                                   # the one branch that exists today
npm run create:admin -- <owner-email> '<password>'       # the one admin user
npm run migrate:images                                   # 8 cars, ~43 images -> Cloudinary
npm run migrate:images                                   # AGAIN — must report 0 uploads, 0 inserts
```

`seed:locations` **must run before** `migrate:images`: the cars carry a `locationId` foreign key to that branch (CONTRACT.md §15). If P02 wrote the script but the npm entry is missing, run `npx tsx scripts/seed-locations.ts` and add the script line yourself — you own everything now.

The second migration run is not optional. Idempotency was a hard requirement on P02 and this is the only place it gets proven. If the second run duplicates rows or re-uploads, stop and fix P02's script before continuing — a non-idempotent migration will eventually destroy the owner's real prices.

Then verify the data directly:

```bash
npm run db:studio
```

- 8 cars, `sortOrder` 0–7, matching the order in `src/data/carImageMap.ts`
- ~43 `car_images` rows; per car, `sortOrder` is 0..n-1 and exactly one `isPrimary`
- Every `width`/`height` is a real number, not 0
- Every `blurDataUrl` starts with `data:image/webp;base64,`
- All `pricePerDay` are 0 — **correct and expected**; the owner fills these in
- `settings` has phone `919704201247`, pickup `Narasimhapuram, Proddatur`, defaults 1000 / 100 / 50
- **exactly one `locations` row** (`proddatur`, active), and **all 8 cars carry `locationId = 'proddatur'`** — a null there hides that car from every city-filtered view (CONTRACT.md §15.5)
- that row's `directionsUrl` is **null** and that is correct: the client hasn't supplied a map link yet, and `directionsHref()` falls back to a maps search. If you find a URL there, check P02 didn't invent one from the fake iframe coordinates

Spot-check that a Cloudinary URL actually resolves: take one `publicId` and open `https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,w_800/<publicId>` in a browser.

## Task 3 — Boot the whole thing

```bash
npm run dev:all
```

Both processes up, Vite on 3000, API on 3001, proxy working. Then walk every route with the browser console and network tab open, and **treat any console error or failed request as a defect to fix, not noise**:

| Route | Must show |
| --- | --- |
| `/` | Hero, the car carousel with real Cloudinary images, testimonials, office location |
| `/all-cars` | All 8 cars, real images, availability pills, no `₹0` anywhere |
| `/car/toyota-innova-crysta` | 7-image gallery in the curated order, working arrows, pricing panel, WhatsApp CTA |
| `/car/does-not-exist` | The "Car Not Found" block — not a crash, not a wrong car |
| `/booking?carId=toyota-innova-crysta&days=3&mode=driver` | Summary + concierge sidebar with correct totals |
| `/admin` (logged out) | Redirect to `/admin/login` |
| `/admin/login` | Login card, **no customer navbar or footer** |
| `/admin` (logged in) | All 8 real cars, three stats, working toggles |
| `/admin/availability` | The fleet month grid, all 8 cars as rows, today marked, no stub text |
| `/definitely-not-a-route` | The 404 page inside the customer layout |

## Task 4 — Cross-slice flows

These span two or more sessions' work, so nobody in Wave 1 could have tested them. This is the core of your job.

1. **Auth round trip.** Log in → cookie set (`httpOnly`, `sameSite=Lax`, `secure` off on localhost) → reload → still logged in → logout → `/admin` redirects.
2. **Write-then-read.** In admin, set a real price on one car (e.g. `2500`). Confirm the admin view updates immediately (`no-store`), then confirm `/all-cars` shows `₹2,500` — allow up to 60s for the public cache, or hard-reload with cache disabled.
3. **The full image lifecycle** — the highest-risk path in the build, spanning P01 + P03 + P04:
   - Upload a photo in admin → LQIP generated client-side → signature obtained → direct browser upload to Cloudinary → metadata persisted → the image renders in the admin grid.
   - Then confirm it appears on the public detail page gallery too.
   - Reorder images → refresh → the order stuck. **Watch for the unique `(carId, sortOrder)` index**; a non-transactional reorder throws a constraint violation here, and this is where it surfaces.
   - Set a different image primary → the fleet-card thumbnail changes on `/all-cars`.
   - Delete an image → gone from both views, and gone from Cloudinary (check the Media Library).
4. **Add a car from scratch.** Create it with just a name → it gets a slugified id → appears at the end of the fleet → upload one photo → set a price → it now renders correctly to customers. This is the client's actual core requirement; it must work end to end.
5. **Delete a car** → its rows cascade and its Cloudinary assets are destroyed.
6. **WhatsApp message.** Open both CTAs (detail page and booking page) and inspect the decoded `wa.me` URL. Compare against the pre-migration output:
   ```bash
   git stash list                                     # or:
   git show <P00-cleanup-commit>:src/pages/CarDetailsPage.tsx | sed -n '98,129p'
   ```
   Diff the message bodies line by line. **They must match byte for byte** apart from the values now sourced from the DB **and exactly two added lines** — `Start Date:` and `End Date:`, immediately after `Duration:`, per CONTRACT.md §11.1. Two lines, in that position, in that variant's bullet style, dates as `05 Sep 2026`. A third added line, a reordering, or a numeric date format is a defect.

   Then confirm the on-screen **Message Preview** in `ConciergeSidebarContent` is character-identical to the decoded `wa.me` text. It used to be a hand-written JSX duplicate; P05 was told to render it from `buildWhatsAppLines()`. If they differ, the duplicate survived.
7. **Empty and edge states.** A car with zero images renders a neutral placeholder, not a broken-image icon. A car at `pricePerDay: 0` shows no price and its WhatsApp message asks for a quote instead of quoting ₹0.
8. **Settings propagate.** Change `whatsappPhone` in the DB directly, restart, and confirm the new number appears in the generated `wa.me` URL — proving nothing is still hardcoded.
9. **The multi-city round trip** — spans P01 + P03 + P04 + P05, so nobody in Wave 1 could test it end to end. This is the amendment's acceptance test:
   - **First, with one branch:** every customer page must look **exactly** as it did before the amendment. No city pills on home, fleet or anywhere else (CONTRACT.md §15.4). If a picker is visible with one city, that is a defect — take a screenshot before you go further.
   - In admin → *Manage Cities* → add a second city with a real-looking address and a Google Maps link you paste yourself.
   - The city picker now appears on the home page and in the fleet filter bar. Selecting a city filters both, and the URL gains `?cities=<slug>`.
   - Copy that URL into a fresh browser profile → the same filtered fleet. Remove the param → all cars, and the previous choice comes back from `localStorage` only when the param is absent.
   - Move one car to the new branch. Its detail page shows that branch's name, address and Get Directions link, and its WhatsApp `Pickup:` line and `wa.me` number both switch to that branch's values.
   - Home page → office section: with two branches a city switcher appears; the address, the map iframe and the Get Directions link all change together.
   - **Click Get Directions.** It must open the pasted link in a new tab. Then clear that branch's `directionsUrl` and click again: it must open a maps search on the address. This button was dead in the original codebase — confirm it is genuinely alive now, in both states.
   - Try to delete a branch that still owns cars → `409` with the count, and the UI offers deactivate. Deactivate it → the city vanishes from the customer picker but its cars keep their branch.
   - Set a car's branch back to none → it disappears when a city filter is active, reappears with no filter, and shows up in admin's "Needs Attention".
10. **The availability round trip** — spans P01 + P03 + P04 + P05 + P09, and it is the second amendment's acceptance test:
    - `/admin/availability` renders the fleet month grid. Block **05→08 Sep** on one car: exactly the 5th, 6th and 7th shade. **Check it against the row in `db:studio`** — if four cells shade, the exclusive-end rule (CONTRACT.md §16.1) was implemented wrong somewhere, and it will be wrong in several places at once.
    - `/all-cars` now shows that car muted, sorted below the free cars, reading `Available from 08 Sep`. Its detail page says the same. **Two surfaces disagreeing means someone read `car.availability` instead of `carAvailability(car)`** (§16.2) — grep for it.
    - Add an adjacent block 08→12 → accepted. Add an overlapping 06→10 → `409`, inline message, nothing saved.
    - Delete the block → the car reads Available again on both surfaces within the 60s public cache window.
    - **Backdate a block into the past** (e.g. ended yesterday) → the car is available again with no action. That is the intended auto-expiry (Amendment 2), not a bug.
    - Turn a car's master switch off in the dashboard → it reads `Booked` with **no date promised**, and its calendar row renders distinctly from a dated block.
11. **The date round trip** — P05's half:
    - On `/all-cars`, set start and end dates. The URL gains `?start=&end=`; cars that can't serve the range are muted and pushed down, never removed.
    - Click into a car, then on to `/booking`. Same dates, same day count, same total at all three steps. `05→08 Sep` must read **3 Days**, and a same-day range **1 Day** (§16.1 rule 3).
    - Pick a range overlapping a block → inline warning and a working "Shift to <date>". **The WhatsApp CTA still works throughout** — never blocked over a date conflict.
    - Paste a stale link with last month's dates → the page repairs them to valid ones rather than erroring.
    - **Set your machine's timezone to `America/Los_Angeles` and reload.** Today's default start date must still be today in India, and no rendered date may shift by a day. This catches the single most likely bug in the whole amendment.

## Task 5 — Production build and deploy config

```bash
npm run build
npm run preview
```

The production build must succeed and the preview must render. Then verify the deploy config, which is easy to get subtly wrong:

- **`vercel.json` rewrites must not swallow `/api`.** The negative lookahead `/((?!api/).*)`  → `/index.html` needs actual testing, not eyeballing. Deep-link `/car/toyota-innova-crysta` directly (must serve the SPA) and hit `/api/cars` (must serve JSON). A wrong rewrite makes every API call return HTML, and P03's client should give you a clear error message if so.
- **No secrets in the client bundle** — this is a real risk given `CLOUDINARY_API_SECRET` exists in the same repo:
  ```bash
  grep -rniE "api_secret|CLOUDINARY_API_SECRET|JWT_SECRET|DATABASE_URL|postgresql://|neon\.tech" dist/
  ```
  Must return nothing. Only `VITE_CLOUDINARY_CLOUD_NAME` (a public value) may appear.
- `.env.local` is gitignored and was never committed: `git log --all --full-history -- .env.local` returns nothing.
- `tsconfig.json` actually type-checks `api/`, `server/`, `db/` and `scripts/` — P00 was asked to widen it. If `tsc --noEmit` passes but you can see an obvious type error in `server/`, that's the symptom.

## Task 6 — Write the runbook

Create or update `README.md` at the repo root with: what the project is, the stack, prerequisites (Neon + Cloudinary accounts), the full env var list, local setup from a fresh clone, every npm script and what it does, the deploy procedure with the Vercel env vars to set, and a short "how the owner adds a car" section written for a non-developer.

Also add `docs/backend.md`: the schema, the endpoint table, the auth model, the image pipeline (signed direct upload → LQIP → responsive delivery), and the 60s public-cache decision with its rationale — so the next person doesn't "fix" the cache header without understanding the tradeoff.

Update `docs/data-model.md` to match what was actually built. It currently lists a flat field list; make it reflect the real **five** tables. Its `location` entry is now a `locationId` foreign key into `locations` — say so explicitly, because P07 walks that document field by field and a stale entry reads as a missing feature.

Add a **"Adding a city"** section to the README next to "how the owner adds a car", written for a non-developer: Manage Cities → city name → office address → paste the Google Maps link (Share → Copy link) → assign cars to it. Mention that the city picker only appears for customers once there are two or more cities, so the owner isn't surprised when nothing visibly changes after adding the first one.

Add a **"Marking a car as booked"** section, also for a non-developer:

- Availability → drag across the dates the car is away → it now shows customers *"Available from …"*.
- The dates mean **out from** the first day and **back on** the last — the car is bookable again on the "Back on" date.
- A block **expires by itself**; nothing needs undoing when the car returns. If the customer keeps it longer, extend the block.
- The Available/Booked switch on the dashboard is different: use it only when a car is off the road with **no** return date.
- **Bookings are not stored.** A customer's dates arrive as a WhatsApp message; the booking becomes real when the owner blocks those dates himself. Two customers can ask for the same car and the same dates — the owner decides. State this plainly (CONTRACT.md §16.8); it is a deliberate design consequence, not a defect, and the next developer must not "fix" it by building a bookings table.

Also document in `docs/backend.md`: the `locations` table, the `/api/locations` endpoints, the `409`-on-delete guard, the `directionsUrl` scheme validation and why it exists (it lands in an `href`), and the decision to filter cities client-side over one cached payload rather than adding a `?city=` param.

## Acceptance — all must be true before Wave 3

1. `npx tsc --noEmit` — **completely green.**
2. `npm run build` succeeds; no secrets in `dist/`.
3. `npm run dev:all` boots with **zero console errors** on every route in Task 3.
4. All 8 cars render with real Cloudinary images on home, fleet and detail pages.
5. Admin login works; every control persists; the full image lifecycle in Task 4.3 works.
6. Creating a car from scratch and making it customer-visible works end to end.
7. The WhatsApp message is byte-identical to the pre-migration output for non-zero prices.
8. `migrate:images` run twice is a no-op the second time.
9. No stubs remain; no dangling imports; no dead buttons — **including "Get Directions"**, which was dead in the original codebase and is the amendment's most visible fix.
10. README and `docs/backend.md` written.
11. The Task 4.9 multi-city round trip passes, and with one branch the customer pages are visually identical to the pre-amendment build.
12. The Task 4.10 availability and 4.11 date round trips pass, including the timezone check.
13. The WhatsApp message differs from the pre-build output by **exactly two lines**, and the on-screen preview matches it character for character.

## Commit

Now you may stage broadly, since Wave 1 is done:

```bash
git add -A && git commit -m "chore: integrate backend slices, seed data and document the runbook"
```

## Report back — P07 depends on this

1. **Every defect you found and fixed**, attributed to its slice (this is the signal for whether the parallel scheme worked).
2. Any ownership violation you detected.
3. Any place CONTRACT.md turned out to be wrong or under-specified.
4. Anything you could **not** get working, stated plainly — do not paper over it. P07 needs to know where to look hardest.
5. The exact WhatsApp message diff result.
6. What you consciously left alone because it was out of scope.