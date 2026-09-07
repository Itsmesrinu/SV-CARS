# 00 — ORCHESTRATOR · Master runbook

**Read this first. It tells you what to run, in what order, what runs in parallel, and when to verify.**

This is the only file you need open while driving the build. Everything else is a worker prompt.

> **Amendment 1 (2026-09-03) — multi-city branches.** The client can now create branches (city + office address + map link) and assign each car to one; customers filter the fleet by city. Approved after P00 shipped, before Wave 1 started. Spec: [CONTRACT.md](./CONTRACT.md) §15. Rationale: [PLAN.md](./PLAN.md) *Amendment 1*. It touches every prompt from P01 onward, and it moved two previously-untouched components (`OfficeLocation.tsx`, `Hero.tsx`) into P05's ownership — re-read §4 below even if you read it before.
>
> **Amendment 2 (2026-09-05) — availability calendar & booking dates.** The owner keeps a per-car calendar of when each car is out; customers pick real start/end dates, filter the fleet by them, and those dates ride along in the WhatsApp message. Spec: [CONTRACT.md](./CONTRACT.md) §16 and §11.1. Rationale: [PLAN.md](./PLAN.md) *Amendment 2*. **It adds a sixth Wave 1 session, `P09`**, and it is the first change ever permitted to alter the WhatsApp message body — exactly two lines, no more.

---

## 1. The one-page summary

```
                          ┌──────────────────────────────┐
   WAVE 0  (SOLO)         │  P00 — Foundation & contract │   ~45–60 min
   blocks everything      └──────────────┬───────────────┘
                                         │  MUST be green before Wave 1
     ┌────────────┬────────────┬────────┼────────┬────────────┬────────────┐
     ▼            ▼            ▼        ▼        ▼            ▼            
   WAVE 1 (PARALLEL — 6 sessions, all start at the same time)
   ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐ ┌──────────┐
   │P01 API   │ │P02 Migrate│ │P03 Front │ │P04 Adm │ │P05 Public │ │P09 Avail │
   │+ auth    │ │+ seed     │ │data layer│ │rebuild │ │pages+dates│ │calendar  │
   └────┬─────┘ └─────┬─────┘ └────┬─────┘ └───┬────┘ └─────┬─────┘ └────┬─────┘
        └────────────┴────────────┴─────┼──────┴────────────┴────────────┘
                                         ▼
   WAVE 2  (SOLO)         ┌──────────────────────────────┐
   integration            │  P06 — Integration & wiring  │   ~30–45 min
                          └──────────────┬───────────────┘
                                         │  tree must be fully green here
                          ┌──────────────┴───────────────┐
   WAVE 3                 ▼                              ▼
   ┌────────────────────────────────┐   ┌────────────────────────────────┐
   │ P07 — Verification (SOLO,      │   │ P08 — Perf + security audit    │
   │ careful, run FIRST)            │   │ (read-only, parallel-safe)     │
   └────────────────────────────────┘   └────────────────────────────────┘
```

**Total wall-clock with parallelism: roughly 3–4 hours.** Sequentially it would be closer to 9–10.

## 2. Before you start — prerequisites the human must do

These cannot be done by an agent. Do them **before** launching P00.

1. **Neon**: create a project at [neon.tech](https://neon.tech), copy the pooled connection string.
2. **Cloudinary**: account already created. Cloud name and API key are known (below); **the API secret still needs to be copied** from the Cloudinary dashboard → *View API Keys*.
3. **Generate a JWT secret**: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Create `.env.local` in the repo root with the values from §12 of [CONTRACT.md](./CONTRACT.md). **Do not commit it** — P00 adds it to `.gitignore`.
5. Make sure the working tree is clean-ish and you know how to `git reset` if a wave goes wrong.

### The Cloudinary values for `.env.local`

```
CLOUDINARY_CLOUD_NAME=w13utvcd
CLOUDINARY_API_KEY=389373963278448
CLOUDINARY_API_SECRET=<copy from the Cloudinary dashboard — not yet supplied>
VITE_CLOUDINARY_CLOUD_NAME=w13utvcd
```

`VITE_CLOUDINARY_CLOUD_NAME` duplicates the cloud name deliberately: only `VITE_`-prefixed vars reach the browser, and the client-side URL builder needs the cloud name to construct `res.cloudinary.com/w13utvcd/image/upload/...`. That is safe — a cloud name is public by design, visible in every image URL on the deployed site.

**The API secret is the one that matters.** It must appear only in `.env.local` and in the Vercel project's server-side environment variables. It must never be given a `VITE_` prefix, never be imported from anything under `src/`, and never be committed. `CLOUDINARY_API_KEY` is less sensitive — it is sent to Cloudinary in the browser's signed upload request by design — but keep it in env vars anyway; hardcoding it makes rotation a code change.

Delivery URLs will look like:

```
https://res.cloudinary.com/w13utvcd/image/upload/f_auto,q_auto,w_800,c_limit/sv-cars/toyota-innova-crysta/main_front_1
```

Sanity-check the account is reachable before Wave 0 — this must return `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://res.cloudinary.com/w13utvcd/image/upload/f_auto,q_auto,w_400/sample"
```

`sample` is a demo asset present in every new Cloudinary account. A `404` means the cloud name is wrong; a `401` means the account is restricted.

> If Neon/Cloudinary credentials are not ready yet, P00 through P05 can still all be written — only **P02** (which actually uploads) and **P06** (which runs migrations) need live credentials.

## 3. Wave-by-wave execution

### Wave 0 — `P01`? No. **`P00-foundation.md`. Solo. Nothing else may run.**

```
Open ONE session. Paste: prompts/P00-foundation.md
```

P00 does cleanup, installs every dependency the whole build needs (one `package.json` edit, one lockfile — this is why it must be solo), writes the Drizzle schema, and — most importantly — writes the **shared contract files** that all five Wave 1 sessions import: `src/types/api.ts`, `src/lib/carHelpers.ts`, `src/lib/cloudinary.ts`, plus `src/App.tsx` / `src/main.tsx` / `vite.config.ts`.

**Gate — do not proceed until all four are true:**

- [ ] `npm run lint` (`tsc --noEmit`) is **completely green**
- [ ] `npm run dev` boots and `http://localhost:3000` renders the home page
- [ ] `npm run dev:api` boots and `http://localhost:3001/api/health` returns `{"ok":true,...}`
- [ ] `git log -1` shows the foundation commit

If P00's gate is not green, **fix it before Wave 1**. Launching five sessions onto a broken foundation is the single most expensive mistake available here.

### Wave 1 — five sessions, launched together

```
Session A:  prompts/P01-api-backend.md
Session B:  prompts/P02-migration-scripts.md
Session C:  prompts/P03-frontend-data-layer.md
Session D:  prompts/P04-admin-rebuild.md
Session E:  prompts/P05-public-pages-whatsapp.md
Session F:  prompts/P09-availability-calendar.md
```

All six run against the **same working tree**. That is safe *only* because ownership is strictly disjoint (§4). Each prompt tells its session to commit only its own paths.

> **P09 is numbered out of order deliberately.** It was added by Amendment 2 after P01–P08 were written, and renumbering would have invalidated every cross-reference in the other prompts. It is a Wave 1 session despite the number — launch it with the other five.

> **Alternative if you prefer hard isolation:** run each in its own `git worktree`. You then pay for it with five merges in P06. For a repo this size, the shared-tree approach is materially simpler and the ownership matrix is what makes it work. Shared tree is recommended.

Expect each session to take 45–90 minutes. They do not need to finish simultaneously.

**Gate — do not start P06 until:**

- [ ] All six sessions report done
- [ ] Each one's summary confirms "changed zero files outside my ownership list"
- [ ] `git status` shows no unexpected files (nothing in `src/pages/admin/` etc.)

### Wave 2 — `P06-integration.md`. Solo.

```
Open ONE session. Paste: prompts/P06-integration.md
```

This is where the five slices become one app: push the Drizzle schema to Neon, create the admin user, run the image migration, boot everything, and fix cross-session drift (the leftovers each Wave 1 session was forbidden from touching).

**Gate — do not start verification until:**

- [ ] `npm run lint` is completely green
- [ ] `npm run dev:all` boots with no console errors
- [ ] All 8 cars render on `/all-cars` with real Cloudinary images
- [ ] You can log in at `/admin` and see the real fleet
- [ ] One branch exists, all 8 cars belong to it, and **the customer pages look exactly as they did before the amendment** (the city picker stays hidden below two cities — CONTRACT.md §15.4)
- [ ] Add a second city in admin → the picker appears, filtering works, and "Get Directions" opens that branch's map link
- [ ] `/admin/availability` shows the fleet month grid; blocking a car's dates there makes `/all-cars` show `Available from <date>` on that card
- [ ] The customer's start/end dates reach both WhatsApp messages as `Start Date:` / `End Date:`, and **no other line changed** — diff against the pre-build output

### Wave 3 — verification

**Run `P07` first, and run it solo and carefully.** It is the acceptance gate; it needs a quiet tree so that anything it finds is genuinely a defect and not another session mid-edit.

```
Open ONE session. Paste: prompts/P07-verification.md
```

Then, once P07 is clean (or its findings are triaged), `P08` may run in parallel with fixing P07's findings, because it is read-only:

```
Session A:  prompts/P08-perf-security-audit.md      (read-only, safe to parallelise)
Session B:  fixing whatever P07 found
```

**Final gate — the build is done when:**

- [ ] P07 reports zero **blocker** findings
- [ ] P08 reports no exposed secrets and no unprotected admin route
- [ ] Lighthouse on `/all-cars` and one car detail page: Performance ≥ 90, CLS ≈ 0

## 4. File ownership matrix — THE critical table

> One row per session. **No path appears in two rows.** This is what makes the parallel wave safe.

| Session | Owns (create / edit / delete freely) | Read-only reference |
| --- | --- | --- |
| **P00** | `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `vite.config.ts`, `vercel.json`, `tsconfig.json`, `drizzle.config.ts`, `db/schema.ts`, `db/index.ts`, `src/types/api.ts`, `src/lib/cloudinary.ts`, `src/lib/carHelpers.ts`, `src/lib/locationHelpers.ts`, `src/lib/availability.ts`, `src/main.tsx`, `src/App.tsx`, `src/pages/AdminLoginPage.tsx` *(stub only)*, `src/pages/AdminAvailabilityPage.tsx` *(stub only)*, `server/app.ts` *(stub only)*, `api/[[...route]].ts`, `scripts/dev-server.ts`, **deletions**: `src/pages/{admin,booking,car_details,all_cars}/`, `main.py`, `.python-version` | everything |
| **P01** | `server/**` (replaces the P00 stub), `server/routes/*`, `server/lib/*` | `db/schema.ts`, `src/types/api.ts`, `prompts/CONTRACT.md` |
| **P02** | `scripts/migrate-images.ts`, `scripts/create-admin.ts`, `scripts/seed-settings.ts`, `scripts/seed-locations.ts`, `db/seed/**` | `src/data/carImageMap.ts`, `public/**`, `db/schema.ts` |
| **P03** | `src/lib/api.ts`, `src/lib/lqip.ts`, `src/hooks/**`, `src/components/CarImage.tsx`, `src/components/ui/**` | `src/types/api.ts`, `src/lib/cloudinary.ts`, `prompts/CONTRACT.md` |
| **P04** | `src/pages/AdminPage.tsx`, `src/pages/AdminLoginPage.tsx` (replaces the P00 stub), `src/components/admin/**`, `src/types/admin.ts` | `src/lib/api.ts`, `src/components/CarImage.tsx`, `src/lib/lqip.ts`, `src/lib/locationHelpers.ts`, `docs/design-system.md` |
| **P05** | `src/lib/booking.ts`, `src/lib/cityFilter.ts`, `src/lib/dateFilter.ts`, `src/pages/HomePage.tsx`, `src/pages/AllCarsPage.tsx`, `src/pages/CarDetailsPage.tsx`, `src/pages/BookingPage.tsx`, `src/components/AvailableCars.tsx`, `src/components/CitySelector.tsx`, `src/components/DateRangePicker.tsx`, `src/components/OfficeLocation.tsx`, `src/components/Hero.tsx` *(city string only)*, `src/components/booking/**`, `src/components/ShareLocation.tsx`, **deletion**: `src/data/cars.ts` | `src/hooks/**`, `src/components/CarImage.tsx`, `src/lib/carHelpers.ts`, `src/lib/locationHelpers.ts`, `src/lib/availability.ts` |
| **P09** | `src/pages/AdminAvailabilityPage.tsx` (replaces the P00 stub), `src/components/admin/availability/**` | `src/lib/availability.ts`, `src/lib/api.ts`, `src/hooks/**`, `src/components/admin/*` *(for styling only — do not edit)* |
| **P06** | **everything** — it is the integrator | — |
| **P07** | nothing (may only write `prompts/VERIFICATION-REPORT.md`) | everything |
| **P08** | nothing (may only write `prompts/AUDIT-REPORT.md`) | everything |

> **P04 and P09 both work under `src/components/admin/`.** They do not collide: P09 owns the `availability/` subdirectory and nothing else, P04 owns the files directly in `admin/` and every other subdirectory. P04 adds the link to `/admin/availability`; P09 builds what is behind it. The route itself was registered by P00 against a stub, so neither session touches `src/App.tsx`.

### Files deliberately NOT owned by any Wave 1 session

- `src/App.tsx` and `src/main.tsx` → **P00 only.** Both P03 (QueryClientProvider) and P04 (admin routes) would otherwise need them. P00 wires both upfront against stubs.
- `src/data/carImageMap.ts` → nobody deletes it. P02's migration script is the only consumer and it stays as the historical record of the curated image order.
- `src/components/{Navbar,Footer,Testimonials,VideoGallery}.tsx` → untouched by the whole build. They have no car or branch data in them.
- `src/components/BrandLogos.tsx` → **wrongly listed as car-data-free above; corrected by P06.** It rendered a customer-facing "Available Cars" strip straight off `src/data/cars.ts`, filtered by `status === 'available'`. Because no Wave 1 session owned it, the import survived P05's deletion of that module and both its car list and its availability wording were stale. **P06** moved it to `useCars()` + `carAvailability()` and applied the same city filter as `AvailableCars.tsx`.

> **Changed by the multi-city amendment:** `OfficeLocation.tsx` and `Hero.tsx` used to be in that untouched list. They are not any more, because both hardcode the single office (`OfficeLocation.tsx:19,38,61` — address, dead "Get Directions" button, map iframe; `Hero.tsx:32` — *"in Proddaturu"*). Both now belong to **P05**, and `Hero.tsx` is scoped to the city string alone: no layout, class or copy changes beyond the place name.

## 5. Why this particular split

- **P01 (API) and P03 (frontend data layer)** are the classic split — they meet only at the HTTP contract in §8 of CONTRACT.md, which is frozen. Neither can break the other.
- **P02 (scripts)** touches no application code at all. It is the most independent piece and can even run before credentials exist (write now, execute in P06).
- **P04 (admin) and P05 (public)** are the two big UI jobs and they share zero files — admin lives entirely under `src/pages/AdminPage.tsx` + `src/components/admin/`, public lives in the other pages. They both consume `CarImage` and the hooks from P03 by contract, coding against signatures rather than implementations.
- The riskiest coupling is **P04/P05 depending on P03's `CarImage`**. Mitigated by freezing its props in CONTRACT.md §6 — P04 and P05 write imports that resolve as soon as P03 lands, and P06 catches any mismatch.
- **The multi-city amendment cuts across all five slices** — schema (P00, done), endpoints (P01), seed (P02), hooks (P03), branch admin (P04), city picker (P05). It stays parallel-safe because the *only* shared surfaces are the frozen `LocationDTO`, the §4.1 helpers P00 already shipped, and the §15.2 filter-state contract. The one genuinely new coupling is P05's `cityFilter.ts` being read by two of its own pages — same session, so no cross-session risk.

## 6. If something goes wrong

| Symptom | Action |
| --- | --- |
| A Wave 1 session edited a file it doesn't own | `git diff` that file, revert the foreign edit, let P06 reapply the intent |
| Two sessions produced conflicting assumptions about a DTO | CONTRACT.md wins. Fix the deviating side in P06 |
| `tsc` errors everywhere mid-Wave 1 | Expected. Only judge errors in the current session's own files |
| P02 fails partway through uploading | It is idempotent by design — just rerun it |
| Cars render but images 404 | Check `VITE_CLOUDINARY_CLOUD_NAME` is set and that P02 actually ran |
| Admin login returns 401 with correct password | `scripts/create-admin.ts` was not run, or `JWT_SECRET` differs between the dev API process and the browser's cookie |
| The city picker is nowhere to be found | Correct below two active cities — CONTRACT.md §15.4, not a bug. Add a second city in admin to see it |
| A city filter shows zero cars | Those cars have no `locationId`. Check `seed-locations` ran and assigned the branch; cars with no branch are excluded from a city filter by design (§15.5) |
| "Get Directions" does nothing | The branch has no `directionsUrl` **and** `directionsHref()`'s maps-search fallback is missing — the button must never be dead again |
| A car shows "Available" but is blocked today | Something read `car.availability` directly instead of `carAvailability(car)` (CONTRACT.md §16.2). Grep for `.availability` on customer surfaces |
| Availability is off by one day | The `endDate` exclusivity rule (§16.1). A block `05→08` means back **on** the 8th, not the 9th |
| Dates shift by a day for some users | Someone used `new Date()` in the browser's timezone instead of `todayInIndia()` (§16.1 rule 4) |
| The WhatsApp preview and the sent message differ | `ConciergeSidebarContent` is rendering its own JSX copy instead of `buildWhatsAppLines()` (§11) |

## 7. Prompt index

| File | Wave | Mode | Purpose |
| --- | --- | --- | --- |
| [PLAN.md](./PLAN.md) | — | reference | The frozen approved plan |
| [CONTRACT.md](./CONTRACT.md) | — | reference | **Mandatory reading for every session** |
| [P00-foundation.md](./P00-foundation.md) | 0 | solo | Cleanup, deps, schema, shared contract files |
| [P01-api-backend.md](./P01-api-backend.md) | 1 | parallel | Hono API, JWT auth, cars/images/settings endpoints |
| [P02-migration-scripts.md](./P02-migration-scripts.md) | 1 | parallel | Cloudinary upload + seed + create-admin scripts |
| [P03-frontend-data-layer.md](./P03-frontend-data-layer.md) | 1 | parallel | API client, hooks, `CarImage`, skeletons, LQIP |
| [P04-admin-rebuild.md](./P04-admin-rebuild.md) | 1 | parallel | Admin login, fleet CRUD, image manager |
| [P05-public-pages-whatsapp.md](./P05-public-pages-whatsapp.md) | 1 | parallel | Public pages on live data + WhatsApp consolidation |
| [P09-availability-calendar.md](./P09-availability-calendar.md) | 1 | parallel | Fleet-wide month grid for the owner's availability calendar |
| [P06-integration.md](./P06-integration.md) | 2 | solo | Push schema, seed, boot, reconcile drift |
| [P07-verification.md](./P07-verification.md) | 3 | solo | Acceptance gate — functional + rules compliance |
| [P08-perf-security-audit.md](./P08-perf-security-audit.md) | 3 | parallel | Lighthouse, image delivery, secrets, auth audit |
