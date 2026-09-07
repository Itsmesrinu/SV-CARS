# P07 — Verification  ·  WAVE 3  ·  **SOLO — run this on a quiet tree, and run it carefully**

You are the acceptance gate. Six sessions built this; your job is to find what they broke, missed, or quietly faked — **not** to build anything.

**Run this solo.** No other session may be editing files while you work, or you will chase phantoms and miss real defects.

**Your posture:** adversarial but fair. Assume every session's self-report is optimistic. Wave 1 sessions were explicitly permitted to defer runtime verification when their dependencies hadn't landed, so **some flows have genuinely never been executed by anyone.** Those are where the bugs live. Read P06's report to find out which.

**You may write exactly one file:** `prompts/VERIFICATION-REPORT.md`. **Fix nothing.** A verifier who fixes things stops being able to tell you what was broken, and a "quick fix" mid-audit invalidates everything checked before it. Log findings; let a follow-up session fix them.

**First:** read `prompts/PLAN.md`, `prompts/CONTRACT.md`, `docs/*.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md`, then `README.md` and `docs/backend.md` from P06. Then read P06's report to learn what it already knows is broken.

---

## Severity scale — use these exact labels

| Label | Meaning |
| --- | --- |
| **BLOCKER** | Ships wrong data to a customer, loses the owner's data, exposes a secret, or breaks a core flow (browse → book, or add-a-car). Must be fixed before deploy. |
| **MAJOR** | A requirement in `PLAN.md` or `docs/*.md` is not met, or a control silently doesn't work. |
| **MINOR** | Cosmetic, a rough edge, or a missing nicety. |
| **NOTE** | Observation, tech debt, or a deliberate tradeoff worth recording. |

Every finding needs: severity, `file:line`, what you expected, what you observed, and **how you reproduced it.** A finding nobody can reproduce is noise.

---

## Section A — Requirements compliance (against the frozen plan)

Go through `prompts/PLAN.md` phase by phase and confirm each was actually delivered. Specifically:

- **Phase 0** — are `src/pages/{admin,booking,car_details,all_cars}/`, `main.py`, `.python-version` gone? Any surviving `GEMINI_API_KEY` reference? `grep -rn "GEMINI_API_KEY" . --exclude-dir=node_modules`
- **Phase 1** — does `db/schema.ts` cover **every** field in `docs/data-model.md`? Walk that doc's list item by item: `carId`, `carName`, `carType`, `availability`, `pricePerDay`, `driverPricePerDay`, `kmLimitPerDay`, `extraKmCharge`, `images`, `tags`, `location`, `deliveryAvailable`. A missing one is MAJOR. Note `location` is satisfied by the `locationId` FK into the `locations` table, not by a text column — that is Amendment 1, not a gap.
- **Amendment 1 (multi-city)** — see Section G. It was approved after P00 shipped, so treat it as a first-class requirement, not an extra.
- **Amendment 2 (availability calendar + booking dates)** — see Section H. Same standing. Note it is the **only** change ever permitted to alter the WhatsApp message body, and only by two lines.
- **Phase 2** — 8 cars, ~43 images, curated order preserved. **Verify the order against `src/data/carImageMap.ts` yourself**, car by car, in `db:studio`. Confirm the Ertiga's `inside_2.jpg.webp` and the Glanza's `inside_4` (no `inside_3`) both survived.
- **Phase 3** — every endpoint in CONTRACT.md §8 exists with the specified shape. Curl each one.
- **Phase 4** — `CarImage` used everywhere; no raw `<img>` left for car photos.
- **Phase 5** — admin does add/edit/delete cars, availability, and photos (`docs/admin-rules.md`).
- **Phase 6** — one WhatsApp builder, data-driven.
- **Phase 7** — `vercel.json`, env docs, README runbook.

Also confirm the **deferred** items were genuinely left out rather than half-built: no enquiry logging, no Settings UI, no WhatsApp Cloud API. A half-built deferred feature is MAJOR.

## Section B — The project's own hard rules

These come from `.github/copilot-instructions.md` and `docs/`, and they override any implementer's preference.

1. **No payments.** The absolute requirement.
   ```bash
   grep -rniE "razorpay|stripe|payment|checkout|paytm|upi|phonepe|cashfree|paypal|card number" src/ server/ api/
   ```
   Any real payment affordance is a **BLOCKER**.
2. **No invented data.** The one most likely to have been violated under pressure to make screens look finished. Hunt for: fabricated prices, fake years, invented `transmission` values, made-up serial numbers, fake trend strings like `'85% utilization rate'` or `'+2 this month'`, placeholder Unsplash car photos, invented `carType` on the cars that deliberately have none (Force Trax Cruiser, Innova, Innova Crysta, Dzire, Glanza). Check `src/components/admin/`, `src/pages/AdminPage.tsx` and the seed script especially.
   ```bash
   grep -rn "unsplash\|INITIAL_VEHICLES\|Porsche\|Range Rover\|Volkswagen\|utilization" src/
   ```
3. **Design system untouched.** `docs/design-system.md` forbids new visual styles. Diff the three admin components against their pre-build state and confirm the changes are data/handlers, not class churn:
   ```bash
   git log --oneline -- src/components/admin/
   git diff <pre-build-commit> HEAD -- src/components/admin/AdminVehicleCard.tsx
   ```
   Look for newly introduced hex colours, new font sizes outside the existing scale, new border radii, new shadow values. Grep for `#` hex literals in `src/` that aren't the pre-existing WhatsApp brand colours (`#25D366`, `#128C7E`, `#075e54`).
4. **₹ everywhere**, with `toLocaleString()`. No `$`, no bare `Rs.`, no unformatted five-digit numbers.
5. **Admin invisible to customers.** No admin link in `Navbar` or `Footer`. `/admin` and `/admin/login` render outside `CustomerLayout`. `grep -rn "admin" src/components/Navbar.tsx src/components/Footer.tsx`
6. **Routes preserved.** `/`, `/all-cars`, `/car/:id`, `/booking` all still work, and the car **slugs are unchanged** — `/car/toyota-innova-crysta` must resolve. A changed slug silently breaks every link the owner has ever shared on WhatsApp. **BLOCKER** if broken. The `?cities=` param added by Amendment 1 is additive: `/all-cars` with no query string must still show the whole fleet.
7. **No invented cities, addresses or map links.** The amendment added three new places to fabricate business data — a seeded example city, a placeholder office address, a guessed Google Maps URL. None may exist. `select * from locations` should hold exactly what the owner (or P02's seed of today's real office) put there.

## Section C — The WhatsApp message (verify this hardest)

This is the app's entire booking mechanism and the client's explicit "keep it as it is" requirement. Do not accept P05's or P06's word for it — reproduce it.

1. Recover the original builders:
   ```bash
   git log --oneline --all -- src/pages/CarDetailsPage.tsx
   git show <commit-before-P05>:src/pages/CarDetailsPage.tsx | sed -n '96,130p'
   git show <commit-before-P05>:src/components/booking/ConciergeSidebarContent.tsx | sed -n '56,88p'
   ```
2. In the running app, set one car to a real price (`2500`) and generate both messages. Decode the `wa.me` URL's `text` param.
3. **Diff line by line against the original**, for both self-drive and with-driver, both variants. Check: emoji (`🚗`, `📍`) present and in place; the `•` bullets in the confirm variant; blank lines preserved; line order identical; `₹` with thousands separators; the `Selected Car Page` / `Car Details` URL line correct; `Pickup:` line present. **The only permitted difference is the two date lines from §11.1** — `Start Date:` and `End Date:`, immediately after `Duration:`. Everything else being byte-identical is still the requirement.
4. Confirm the phone in the URL is `919704201247` and comes from the DB, not a literal:
   ```bash
   grep -rn "919704201247\|driverRate = 1000\|100 km/day\|₹50/km\|Narasimhapuram" src/
   ```
   Any hit is **MAJOR** — the whole point of Phase 6 was to eliminate these.
5. Confirm exactly **one** builder exists: `grep -rn "wa.me" src/` should show `src/lib/booking.ts` plus call sites only.
6. Geolocation flow: toggle location sharing, confirm the maps link is appended in the same position as before, and confirm all the error branches still behave (deny permission in the browser and check you get the graceful path, not a crash).
7. The `pricePerDay === 0` case: confirm no `₹0` or `Total: ₹0` reaches the message.

## Section D — Security

1. **No secrets in the client bundle** — the highest-value check here:
   ```bash
   npm run build
   grep -rniE "api_secret|CLOUDINARY_API_SECRET|JWT_SECRET|DATABASE_URL|postgresql://|neon\.tech|bcrypt" dist/
   ```
   Anything but `VITE_CLOUDINARY_CLOUD_NAME` is a **BLOCKER**.
2. **Every admin endpoint rejects unauthenticated calls.** Test *every* one, not a sample — the one somebody forgot to guard is the whole point:
   ```bash
   for p in cars settings me uploads/sign; do echo "--- $p"; curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/admin/$p; done
   curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:3001/api/admin/cars/toyota-innova
   curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3001/api/admin/cars
   ```
   Every one must be 401. Any 200/404/500 instead means the route is reachable unauthenticated → **BLOCKER**.
3. **Cookie flags** — `httpOnly` set, `sameSite=Lax`, `secure` in production. Confirm the JWT is not also mirrored into `localStorage` (that would defeat `httpOnly`): check devtools Application → Local Storage.
4. **No secrets in error responses.** Force a DB error (bad `DATABASE_URL`) and confirm the client gets a generic `{ error: { code: 'internal' } }`, not a connection string or stack trace.
5. **Login doesn't leak account existence** — unknown email and wrong password must return the identical status and message.
6. **Upload signing can't be abused** — confirm `/api/admin/uploads/sign` is auth-guarded and rejects a nonexistent `carId`. An open signing endpoint lets anyone upload to the owner's Cloudinary account at his cost.
7. `.env.local` never committed: `git log --all --full-history -- .env.local .env`
8. **SQL injection** — confirm queries go through Drizzle's parameterised builder. Grep for raw template SQL: `grep -rn "sql\`" server/ db/` and inspect each hit for interpolated user input.

## Section E — Functional walkthrough

Run these in a real browser with the console and network tab open. **A console error is a defect.**

**Customer flows**
1. Home → carousel images load, arrows scroll, a card links to the right detail page.
2. `/all-cars` → all 8 cars, correct availability pills, filters work, no `₹0`.
3. Detail page → gallery in the curated order, arrows and thumbnails work, day selector updates the total, self/driver toggle changes the price correctly, WhatsApp CTA opens the right message.
4. `/booking?carId=...&days=5&mode=driver` → totals match the detail page's arithmetic for the same inputs.
5. `/car/nonexistent` → Not Found. `/nonsense-route` → 404 page.
6. **Mobile viewport (375px)** → every page usable, no horizontal scroll, the compact card layout intact. `docs/skills.md` requires the same responsive behaviour, and mobile is how most of this client's customers will arrive.
7. Refresh each page directly (deep link) → the SPA rewrite serves them, no 404 from the host.

**Owner flows**
8. `/admin` logged out → redirect. Bad password → neutral error. Good password → dashboard.
9. Edit a price → persists across refresh → appears on the public fleet page.
10. Toggle availability, featured, home delivery → each persists.
11. Add a car with only a name → slug generated, appears in the fleet, "Needs Attention" count increments.
12. Upload two photos → both render, progress shown → reorder → persists → set primary → the fleet thumbnail changes.
13. Delete an image → gone from admin and public, gone from Cloudinary.
14. Delete a car → gone, images cascaded, Cloudinary assets destroyed.
15. Logout → `/admin` redirects again.
16. **Every button and control on every admin screen does something.** Click all of them. Dead controls were the original sin of this admin page (`Swap Image` and `Edit Specs` had no handlers) — confirm none remain.

## Section F — Data integrity

1. Nullable fields render gracefully when null — `transmission`, `year`, `carType` are null for the whole current fleet. No empty spec tiles, no `null`, no `undefined`, no `NaN` visible anywhere.
2. A car with zero images → neutral placeholder on card and gallery, no broken-image icon, and the admin still lets you upload to it.
3. `pricePerDay: 0` → price hidden on cards and detail, and the WhatsApp message asks for a quote.
4. Per-car pricing overrides work: set `driverPricePerDay = 1500` on one car, leave another null, and confirm the first uses 1500 while the second uses the settings default of 1000 — in the UI **and** in the WhatsApp message. This is the core purpose of the nullable-override design and it is easy to get backwards.
5. Image `sortOrder` per car is a clean 0..n-1 with no gaps or duplicates, and exactly one `isPrimary`.
6. Run `npm run migrate:images` once more. **It must be a no-op.** Then set a price on a car, run it again, and confirm the price survives — a migration that resets the owner's prices is a **BLOCKER**.

## Section G — Multi-city branches (Amendment 1)

The client's requirement, in his words: *"the client wants to provide car rentals in different locations, so give him access to enter the city name and the office address in text and provide a link for the office address — the backend should use that in the Get Directions button. In the frontend, first ask the user to select from the existing cities (multiple allowed) and show the cars for those."*

Verify it end to end. Spec: CONTRACT.md §15; rationale: PLAN.md Amendment 1.

1. **The owner can actually do it.** In admin → Manage Cities, create a branch with a city, an office address and a pasted Google Maps link, then assign a car to it. If any of those three inputs is missing from the form, that is a **BLOCKER** — it is the literal request.
2. **Get Directions works, in both states.** With a `directionsUrl` set it opens that URL; with it null it opens a maps search on the address. A dead button here is a **BLOCKER**: it was dead in the original codebase (`OfficeLocation.tsx:38`) and fixing it is half the point of this amendment. Also confirm it opens with `target="_blank" rel="noopener noreferrer"`, on both the office section and the car detail page.
3. **The invented map data is gone.** `OfficeLocation.tsx:61`'s original iframe carried made-up coordinates (`!2d78.55!3d14.73`) and a placeholder place id (`0x0:0x0`). Confirm the iframe is now derived from the branch address and that **nobody seeded those fake coordinates into the database** as a `directionsUrl`. A fabricated address a customer could drive to is **BLOCKER** territory under the no-invented-data rule.
4. **Customer city selection.** With two or more cities: the picker appears on the home page and in the fleet filter bar; it multi-selects; the fleet, the home carousel and the counts all respect it; `?cities=` appears in the URL; the link reproduces the same view in a clean browser profile; `localStorage['sv-cities']` restores the choice only when the URL has no param. Selecting every city equals selecting none — if that ever shows "0 cars", it is MAJOR.
5. **The single-city invariant — check this before anything else.** With one branch (the shipped state), every customer page must be **pixel-identical** to the pre-amendment build. Screenshot `/`, `/all-cars` and a detail page and compare against the commit before Wave 1. A visible city picker with one city is MAJOR: CONTRACT.md §15.4 and `docs/design-system.md` both forbid it.
6. **Per-branch booking values.** A car at branch B produces branch B's `Pickup:` address and branch B's `wa.me` number. Set a per-branch phone on one branch and leave another null → the second falls back to `settings.whatsappPhone`. Getting this backwards sends a customer's booking to the wrong branch, so test both directions.
7. **The message shape did not change.** The amendment moved the *source* of the phone and the pickup line, not the message. Confirm the body still has the same lines in the same order — **no branch line, no city line, no directions link was added**. Any extra line is MAJOR (Section C is the byte-level check).
8. **Cars with no branch** behave as §15.5 says: visible with no filter, hidden under a city filter, falling back to the settings address and phone, and counted in the admin "Needs Attention" tile.
9. **Delete guard.** `DELETE /api/admin/locations/:id` on a branch with cars returns `409` with the count; the UI offers deactivate; `?force=true` nulls those cars rather than deleting them. A branch delete that silently orphans cars is MAJOR.
10. **`directionsUrl` cannot carry a script.** `POST`/`PATCH` a location with `directionsUrl: "javascript:alert(document.cookie)"` → `422`. Then write that value straight into the DB with `db:studio` and load the page: `directionsHref()` must fall back to the maps search rather than render it into the `href`. Both layers, because the second is the one that saves you (§15.3). A rendered `javascript:` href is a **BLOCKER**.
11. **No place names left in code:** `grep -rniE "proddatur|narasimhapuram|kadapa|google\.com/maps" src/`. The only permitted hits are the URL templates inside `src/lib/locationHelpers.ts` and the customer-geolocation links in the share-location flow. A hardcoded city name anywhere else defeats the whole amendment — MAJOR.

## Section H — Availability calendar & booking dates (Amendment 2)

The client's two requests: *"we don't tell the customer when a booked car becomes free — the owner should provide that, and it changes often"* and *"let the customer pick real start and end dates; compulsory; it goes to the owner on WhatsApp only, never to the database."*

Spec: CONTRACT.md §16 and §11.1. **§16.1's five date rules are where the bugs are.** Test boundaries, not middles.

1. **The exclusive-end boundary — check this first, it poisons everything downstream.** Block a car **05→08 Sep** in `/admin/availability`. Then verify, independently: `db:studio` shows `start_date=2026-09-05, end_date=2026-09-08`; the grid shades exactly the 5th, 6th and 7th; `GET /api/cars` returns those two dates; the fleet card says **"Available from 08 Sep"**; and asking for the **8th** on the detail page produces **no** conflict warning. One off-by-one here is MAJOR and will be visible in four places at once.
2. **Day counting.** `05→08 Sep` is **3 Days** and the total is `pricePerDay × 3`. Same-day (`05→05`) is **1 Day**. Check on the detail page, the booking page and in the WhatsApp message — all three must agree (§16.1 rule 3). A mismatch between pages is MAJOR: the customer sees one price and the owner is quoted another.
3. **Timezone.** Set the machine to `America/Los_Angeles`, reload, and confirm the default start date is still today **in India** and no rendered date shifts by a day. Then set it to `Pacific/Kiritimati` (UTC+14) and repeat. Any `new Date()` used for "today" instead of `todayInIndia()` shows up here — `grep -rn "new Date()" src/` and inspect every hit.
4. **Auto-expiry.** Insert a block that ended yesterday. The car must read **Available** with no action from the owner, and the past date must not be displayed anywhere. This is the approved behaviour from Amendment 2 — report it as working, not as a stale-data bug.
5. **Derived status everywhere.** `grep -rn "\.availability" src/pages src/components` — every customer-facing hit must be a `carAvailability(...)` call, never the raw boolean (§16.2). A card reading the boolean shows "Available" for a car that is out today: MAJOR.
6. **Master switch versus dated block.** Turn a car's switch off: it reads `Booked` with **no promised date**, on the card, on the detail page and in the calendar row. A car that is both switched off and blocked must read as indefinitely unavailable — no return date may be implied.
7. **Overlap and adjacency.** `POST` an overlapping block → `409`, nothing written. `POST` an adjacent one (`05→08` then `08→12`) → both succeed. `endDate == startDate` → `422`. Rejecting adjacency is MAJOR: it means the owner cannot record two back-to-back rentals, which is his normal week.
8. **`nextFreeDate` with chained blocks.** Block `05→08` and `08→12` on one car, then ask for the 6th. The suggested next free date must be the **12th**, not the 8th. This is the most likely defect in `src/lib/availability.ts`.
9. **The two message lines, and only two.** Decode both `wa.me` URLs and diff against the pre-build output. Exactly `Start Date:` and `End Date:`, immediately after `Duration:`, in that variant's bullet style, formatted `05 Sep 2026`. A **numeric** date (`05/09/2026`) is MAJOR — `05/09` versus `09/05` is a car handed over on the wrong day. A third added line is MAJOR.
10. **The preview cannot lie.** `ConciergeSidebarContent`'s on-screen Message Preview must be character-identical to the decoded `wa.me` text. It was a hand-written JSX duplicate before the amendment; confirm it now renders from `buildWhatsAppLines()`. Change the dates and the mode and re-check — a stale duplicate usually only diverges once something changes.
11. **Nothing about a customer booking is persisted** (§1 rule 9, §16.8). Pick dates, open the network tab, click the WhatsApp CTA: **no POST**, no analytics beacon carrying the dates, no bookings table in `db:studio`, no row anywhere. `grep -rn "booking" server/ db/` should turn up no persistence. A stored booking is a **BLOCKER** — it is the opposite of what the client asked for.
12. **Two customers, same car, same dates** both get a working WhatsApp CTA. That is §16.8's documented consequence. **Do not report it as a defect** — but do confirm the README explains it.
13. **The fleet never empties over dates.** Pick a range no car can serve: cars must be muted and pushed down with "Free from …", not removed. An empty fleet page is MAJOR.
14. **The customer's dates survive the journey** `/all-cars` → `/car/:id` → `/booking`, visible in the URL at each step, with identical totals.
15. **Past days are not editable** in the calendar, and the `note` on a block **never** appears in a public response: `curl -s localhost:3001/api/cars | grep -i note` must find nothing.

## Section I — Regression against the original design

Check out the pre-build commit into a second directory (or use `git stash`/a worktree) and compare screenshots of `/`, `/all-cars` and a detail page side by side at both 375px and 1440px.

Differences must be limited to: real images instead of the `public/` ones (same photos, now CDN-served), skeletons while loading, and prices appearing once set. **Any layout, spacing, colour, font or shadow difference is a MAJOR finding** — `docs/design-system.md` and `.github/copilot-instructions.md` both forbid it.

## Deliverable — `prompts/VERIFICATION-REPORT.md`

```markdown
# Verification Report — <date>

## Verdict
SHIP / SHIP WITH FIXES / DO NOT SHIP

## Summary
<3–5 sentences: what works, what doesn't, the single biggest risk>

## Findings
### BLOCKER
1. [file:line] Expected X, observed Y. Repro: <steps>
### MAJOR
### MINOR
### NOTE

## Coverage
| Section | Result | Notes |
| A Requirements | PASS/FAIL | |
| B Project rules | | |
| C WhatsApp | | |
| D Security | | |
| E Functional | | |
| F Data integrity | | |
| G Multi-city (Amendment 1) | | |
| H Availability & dates (Amendment 2) | | |
| I Visual regression | | |

## Not verified
<anything you could not test, and why — be explicit; an untested area is a risk the human must own>
```

## Rules for you

1. **Fix nothing.** Report only.
2. **Reproduce before reporting.** No speculative findings.
3. **Cite `file:line`.**
4. **Do not accept any session's self-report as evidence** — especially for flows P06 said were never runtime-tested.
5. **Say what you didn't check.** An honest gap is useful; a false all-clear is not.
6. If you find a BLOCKER, keep going and finish the sweep. The human wants the whole list in one pass, not the first problem.