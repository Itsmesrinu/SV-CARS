# Performance & Security Audit — 2026-09-05 — commit `820e974`

Audited: `820e9745b600f4f8bd087ebf510816fe430f3dd7` ("chore: integrate backend slices, seed data and document the runbook").
Tracked tree clean at audit time; two untracked files (`prompts/VERIFICATION-REPORT.md`, `.claude/CLAUDE.md`) appeared *during* the audit from the concurrent P07 session — see [Conditions](#conditions-and-what-i-could-not-measure).

Everything below was measured against `npm run build` + `npm run preview` (production bundle, port 4173), with the Hono API on port 3001 against the real Neon database and the real Cloudinary cloud `w13utvcd`. No dev server was used.

---

## Verdict

**Performance: the image pipeline is excellent and the page around it is not.** Every byte that goes through `CarImage` is correctly sized, cropped and negotiated — a fleet card pulls a **13.5 KB WebP derived from a 359 KB original**, a 96% reduction. But Lighthouse mobile scores **55 / 54 / 50** against a target of 90, and none of the three misses is caused by the car photos: they are caused by seven leftover Stitch placeholder PNGs (2.7 MB on the home page alone), a lazy-loaded LCP image on `/all-cars`, absent `preconnect`, and skeletons that are shorter than the pages they stand in for (CLS 0.22–0.34 against a target of 0.05).

**Security: strong, with one real defect and one leftover account.** All 21 admin routes return 401 unauthenticated, no secret reaches `dist/`, upload signing cannot be steered out of its folder, and **both of the areas flagged for particular attention — the `directionsUrl` stored-XSS path (§6b) and the availability-block notes (§7b) — pass on every layer, verified empirically, not by reading the code.** The defect is an unbounded `description` field that let a 10 MB string into the public CDN-cached payload. The leftover is a P07 test admin account still in `admin_users`.

---

## Lighthouse (mobile preset, production build)

`npx lighthouse@12`, default mobile preset (Moto G Power, simulated slow 4G, 4× CPU), against `vite preview`.

| Route | Perf | FCP | LCP | CLS | TBT | Total bytes | Best practices |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | **55** | 3.6 s | **8.2 s** | **0.221** | 80 ms | 3,860 KiB | 96 |
| `/all-cars` | **54** | 3.5 s | **6.6 s** | **0.288** | 90 ms | 423 KiB | 96 |
| `/car/toyota-innova-crysta` | **50** | 3.6 s | **6.9 s** | **0.344** | 120 ms | 1,070 KiB | 96 |

**Targets from the plan: Performance ≥ 90, CLS < 0.05, LCP < 2.5 s. All three routes miss all three.**

**Read these numbers with one caveat.** `vite preview` is HTTP/1.1, has no CDN, and sends `Cache-Control: no-cache` on assets. So `uses-http2` (−450 ms), `uses-long-cache-ttl` and `uses-text-compression` (−15 KiB) fail as artefacts of the harness and would not fail on Vercel. LCP, CLS, image bytes and the priority/lazy findings are **not** artefacts — Cloudinary is the real CDN in these runs, and those are the numbers that matter.

The largest single Lighthouse opportunity on each route:

| Route | Top opportunity | Est. saving |
| --- | --- | --- |
| `/` | `modern-image-formats` (the lh3 PNGs) | 2,526 KiB |
| `/` | `prioritize-lcp-image` | 2,330 ms |
| `/all-cars` | `lcp-lazy-loaded` (LCP image is `loading="lazy"`) | — (fails outright) |
| `/car/:id` | `uses-responsive-images` | 444 KiB |
| all three | `uses-rel-preconnect` | ~300 ms each origin |

---

## Image delivery vs PLAN.md Phase 4

| # | Commitment | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Upload/URL-time variants, not full-size | **PASS**, with a floor bug | Fleet card: 189 CSS px × dpr 1.75 = 331 device px → served `w_400` = **13,554 B WebP**; Cloudinary `server-timing` reports `owidth=1600, obytes=359264` → **96.2% reduction**. Home carousel 307 px → 538 device px → `w_640`. Detail main mobile 380 px → 665 → `w_800` (56.3 KB); desktop 1216 px → `w_1200`. All correct. **FAIL on two small surfaces** — see P-5. |
| 2 | Intrinsic dimensions from DB → zero CLS | **PARTIAL** | Every `<CarImage>` emits `width`/`height` (verified in the live DOM on 4 routes); Lighthouse `unsized-images` reports **none** on `/all-cars`. But 7 raw `<img>` on `/` and 1 on `/car/:id` carry no dimensions, and measured CLS is 0.221–0.344. See P-4 and P-2. |
| 3 | LQIP | **PASS** | 43 images, 43 `blurDataUrl`s, **7,029 chars = 33.1%** of the payload, avg 163 B, max 283 B. Whole `/api/cars` = **21,233 B raw / 6,109 B gzip / 5,646 B brotli** — 7× under the 150 KB threshold. Rendering confirmed on Slow 3G: 8 `data:image/webp` decoded at **+6.68 s**, first real photo at **+7.60 s**. |
| 4 | `srcSet` + `sizes` + lazy/priority | **PARTIAL FAIL** | `srcSet` correct everywhere and never above natural width (`toyota-glanza` at 567 px natural emits a single `w_400` candidate). Priority count per route: `/` = 1 eager+high, `/car/:id` = 1 eager+high, **`/all-cars` = 0**. Never more than one. But see P-1 and P-3. |
| 5 | Format negotiation | **PASS** | `f_auto,q_auto` on 100% of URLs. Live check: `Accept: image/avif,image/webp` → `Content-Type: image/webp` (13,554 B); no `Accept` → `image/jpeg` (15,453 B). Crop modes match CONTRACT §6.1 exactly: fleet cards + home carousel `c_auto,g_auto`, detail main/thumbs + admin `c_limit`. Visual spot-check of all 8 fleet cards: `g_auto` centres every car's grille and plate, **nothing sliced**. CDN header: `Cache-Control: private, no-transform, max-age=2592000` — 30 days, but see P-9. |
| 6 | Gallery prefetch | **FAIL on mobile** | The prefetch fires and works: clicking through the gallery issues no new request for the neighbouring frames. But `GALLERY_WIDTH = 1200` is hardcoded at [CarDetailsPage.tsx:36](../src/pages/CarDetailsPage.tsx#L36), while mobile renders `w_800`. See P-6. |
| 7 | No repo-served images left | **PASS in `src/`** | `grep -rn 'src="/[A-Z]' src/` → **0 matches**; `carImageMap.ts` is referenced by nothing in `src/`. But `public/`'s 43 originals (**14.0 MB**) are still committed and copied into `dist/`: **`dist/` is 15 MB, of which `dist/assets/` is 680 KB.** Recommendation only — see C-4. |

---

## Performance findings

### P-1 · `/all-cars` loads its LCP image lazily — HIGH, trivial fix
**Measurement.** Lighthouse `lcp-lazy-loaded` **fails** on `/all-cars`; LCP = 6.6 s. Live DOM audit at 412 px: 8 images, **0 with `fetchpriority="high"`, 0 with `loading="eager"`, 8 with `loading="lazy"`**. LCP element is the first fleet card image.
**Cause.** [AllCarsPage.tsx:51-58](../src/pages/AllCarsPage.tsx#L51-L58) never passes `priority`. `AvailableCars` does this correctly (`priority={index === 0}`, [AvailableCars.tsx:169](../src/components/AvailableCars.tsx#L169)); the fleet page does not. The image therefore isn't discoverable until React has run, so the browser cannot start it during the 4.4 s the bundle is downloading.
**Fix.** Pass `priority` to the first card (or the first two, given the 2-column mobile grid). One prop.
**Estimated gain.** Lighthouse `prioritize-lcp-image` estimates **1,570–2,330 ms** on the comparable routes.

### P-2 · Seven leftover Stitch placeholder PNGs are 70% of the home page — HIGH
**Measurement.** On `/`, `lh3.googleusercontent.com` serves **2,722 KB across 7 PNGs** (532.6 + 394.8 + 384.0 + 378.3 + 364.1 + 360.8 + 307.4) out of a 3,860 KiB page. On `/car/:id`, one **356.6 KB PNG** — the 40×40 "Concierge" avatar — is the single heaviest resource, larger than all 10 Cloudinary images on that page combined (352 KB). Lighthouse: `modern-image-formats` −2,526 KiB, `uses-responsive-images` −1,552 KiB on `/`.
**Cause.** Hardcoded AI-Studio export URLs, none of them going through `CarImage`:
[Hero.tsx:83](../src/components/Hero.tsx#L83) (**this is the home page's LCP element**), [VideoGallery.tsx:39](../src/components/VideoGallery.tsx#L39) ×4, [Testimonials.tsx:42](../src/components/Testimonials.tsx#L42) ×2, [CarDetailsPage.tsx:537](../src/pages/CarDetailsPage.tsx#L537), [ConciergeSidebarContent.tsx:89](../src/components/booking/ConciergeSidebarContent.tsx#L89). None carries `width`/`height`, `srcset` or a `loading` attribute.
**Note the compounding problem:** on `/` the one `fetchpriority="high"` image is the first carousel card, while the actual LCP element is the unprioritised, unsized Hero PNG. The priority hint is on the wrong image.
**Fix.** Move these assets to Cloudinary and render them through `CarImage`, or drop the sections. Until then, at minimum give the Hero `width`/`height` + `fetchpriority="high"` and the rest `loading="lazy"` + dimensions.
**Estimated gain.** ~2.7 MB on `/`, ~357 KB on `/car/:id`, plus most of the home page's `unsized-images` CLS contribution.

### P-3 · No `preconnect`, and the fonts load in a serialised three-hop chain — HIGH, 4 lines
**Measurement.** Lighthouse `uses-rel-preconnect` names four origins: `res.cloudinary.com` **301 ms**, `lh3.googleusercontent.com` **300 ms**, `fonts.gstatic.com` **300 ms**, `fonts.googleapis.com` **137 ms**. `grep -c "preconnect\|dns-prefetch\|preload" index.html` → **0**.
The font chain, measured on Slow 3G (400 kbps / 400 ms RTT) + 4× CPU on `/all-cars`:

```
+0.00s  /all-cars (HTML)
+0.45s  /assets/index-BF8J_wFZ.css
+1.50s  fonts.googleapis.com/css2   <- only discoverable AFTER the app CSS parses
+4.44s  /assets/index-BT7sSMGH.js
+7.31s  fonts.gstatic.com/…woff2
+9.51s  fonts.gstatic.com/…woff2
```

**Cause.** The Google Fonts stylesheet is an `@import` on line 1 of [index.css](../src/index.css#L1), so the browser cannot see it until it has downloaded and parsed the app CSS. Lighthouse `render-blocking-insight`: **460 ms**.
**Fix.** Add to [index.html](../index.html): `<link rel="preconnect" href="https://res.cloudinary.com" crossorigin>`, the same for `fonts.gstatic.com`, and move the font import to a real `<link rel="stylesheet">` there.
**Estimated gain.** ~300 ms on the first image, one full round trip (~460 ms) on the fonts.

### P-4 · Skeletons are shorter than the pages they replace — CLS 0.288 / 0.313 — HIGH
**Measurement, `/all-cars`,** sampling the live DOM every 100 ms through a cold load:

| t | cards | skeletons | grid height | footer top | doc height |
| --- | --- | --- | --- | --- | --- |
| 3836 ms | 0 | **6** | **620 px** | 1202 px | 1475 px |
| 4732 ms | **8** | 0 | **769 px** | 1369 px | 1642 px |

The grid grows **149 px** and the footer drops **167 px** in one frame. The measured shift entry is **0.2309 at t=4635 ms**, i.e. 80% of the route's total CLS of 0.288, attributed by Lighthouse to `<section class="px-2.5 py-3 md:px-8 md:py-12">` (the grid) and `<section class="md:sticky">` (the filter bar).
**Cause.** [AllCarsPage.tsx:294](../src/pages/AllCarsPage.tsx#L294) renders `Array.from({ length: 6 })` skeletons for a fleet of 8. In a 2-column mobile grid that is 3 rows standing in for 4. `FleetCardSkeleton` itself is measured card-for-card correctly ([Skeleton.tsx:43-79](../src/components/ui/Skeleton.tsx#L43-L79)) — the per-card work is right, the **count** is wrong.
**On `/car/:id`** the same class of problem is worse: the shift of **0.313** is attributed to `<footer>`, because `CarDetailSkeleton` covers only the gallery and title while the loaded page is several times taller. Two smaller shifts (0.019, 0.012) are attributed by Lighthouse directly to `Web font loaded` — P-3 fixes those.
**Fix.** Reserve the space: either render a skeleton count that matches the last-known fleet size (React Query already has it after the first visit), or give the grid section a `min-height`. For the detail page, extend `CarDetailSkeleton` to the loaded page's height or reserve it on the container.
**Estimated gain.** CLS 0.288 → ~0.005 on `/all-cars`; 0.344 → ~0.03 on `/car/:id`. This alone moves both routes out of Lighthouse's CLS penalty band.

### P-5 · `CLD_WIDTHS` has no candidate below 400 px, so small surfaces over-fetch by ~5× — MEDIUM
**Measurement**, live DOM, 412 px viewport at dpr 1.75:

| Surface | Box | Device px needed | Served | Cost |
| --- | --- | --- | --- | --- |
| `BrandLogos` strip on `/` | **40×40** | **70** | `w_400,h_400` | 18.4–34.9 KB each × 8 = **~200 KB** |
| Detail thumbnails | **128×72** | **224** | `w_400` | 11.7–22.5 KB each × 7 = **~105 KB** |

**Cause.** `CLD_WIDTHS = [400, 640, 800, 1200, 1600]` ([cloudinary.ts:26](../src/lib/cloudinary.ts#L26)). `cldSrcSet` filters to `w <= naturalWidth`, so the *smallest* candidate any surface can pick is 400. `sizes="40px"` is correct and honest; there is simply nothing small enough to select. Confirmed visually — the home page's "AVAILABLE CARS" strip really is 40×40 thumbnails.
**Fix.** Add small widths, e.g. `[96, 160, 240, 400, 640, 800, 1200, 1600]`. This is a one-line change in a P00-owned file and costs nothing at the CDN (see C-1: transformations are 1.2% of the free-tier budget).
**Estimated gain.** ~200 KB on `/`, ~105 KB on `/car/:id`.

### P-6 · The gallery prefetch downloads a width mobile never renders — MEDIUM
**Measurement.** On `/car/toyota-innova-crysta` at 412 px, the main frame renders `f_auto,q_auto,w_800,c_limit/…/main_front_1`. The two prefetches issued on mount are `w_1200/front_2` (**100.7 KB**) and `w_1200/back_1` (**76.9 KB**) — **177.6 KB that the mobile gallery will never display**, because when the user clicks next the browser picks `w_800` from the `srcSet` and issues a fresh request. On desktop (1216 px box → `w_1200`) the prefetch is correct.
**Cause.** `GALLERY_WIDTH = 1200` is a constant ([CarDetailsPage.tsx:36](../src/pages/CarDetailsPage.tsx#L36)) matching only the desktop arm of `sizes="(max-width: 768px) 100vw, 1200px"`.
**Extra cost:** the prefetch fires in a `useEffect` on mount, so those 177.6 KB compete with the LCP image on the same connection. This is a plausible contributor to the route's 6.9 s LCP.
**Fix.** Derive the width from the viewport the same way the browser will — e.g. `window.innerWidth <= 768 ? window.innerWidth * devicePixelRatio : 1200` — and keep passing it through `pickWidth`, which already snaps to a real candidate.
**Estimated gain.** ~178 KB per mobile detail view, and contention removed from the LCP fetch.

### P-7 · The whole app, including the admin panel, is one 630 KB chunk — MEDIUM
**Measurement.** Shipped build: `dist/assets/index-BT7sSMGH.js` = **630,115 B / 189.16 KB gzip**, one chunk, with Vite's own >500 KB warning. Lighthouse `unused-javascript`: **112 KiB** on `/all-cars`, **101 KiB (54% of the bundle)** on `/car/:id`.
I re-ran the build with `manualChunks` into a scratch directory (repo untouched) to attribute it:

| Chunk | Raw | Gzip | Share of gzip |
| --- | --- | --- | --- |
| `vendor-react` | 193.69 kB | 60.49 kB | 32% |
| `vendor-motion` | 128.89 kB | **42.38 kB** | 22% |
| **`admin`** (pages/Admin*, components/admin/*) | 94.58 kB | **26.69 kB** | **14%** |
| `index` (all public app code) | 80.57 kB | 20.77 kB | 11% |
| `vendor-query` | 40.71 kB | 12.07 kB | 6% |
| `vendor-router` | 39.50 kB | 14.31 kB | 7% |
| `vendor-other` | 27.51 kB | 8.68 kB | 5% |
| `vendor-lucide` | 24.55 kB | 5.49 kB | 3% |
| **total** | 630.0 kB | 190.9 kB | |

**Tree-shaking verdict.** `lucide-react`: **healthy** — 59 distinct icons across the app compile to 5.49 KB gzip. `motion`: **not shaking** — 42.38 KB gzip, the second-largest thing in the bundle, for fades and slides. Every file imports `{ motion }` from `motion/react`, which pulls the full DOM feature set; the package's `LazyMotion` + `m` path exists precisely for this.
**Fix.** `React.lazy` the three admin routes in [App.tsx:14-16](../src/App.tsx#L14-L16). No chunk exceeds 250 KB gzipped either way, so this is about what customers download, not about chunk limits.
**Estimated gain.** **26.69 KB gzip off every customer page load**, and it is a contained change to one file. The `motion` migration is a further ~30 KB gzip but touches 9 files — rank it lower.

### P-8 · The Google Maps embed costs ~378 KB on the home page — LOW (documented behaviour)
**Measurement.** The iframe **does** carry `loading="lazy"` ([OfficeLocation.tsx:167](../src/components/OfficeLocation.tsx#L167)) — that part is correct. It nonetheless loaded during the Lighthouse home run, because Chrome's lazy threshold is very large on slow connections. Cost: **359.1 KB of Maps JS** (`places.js` 90.3 + `main.js` 83.9 + `init_embed.js` 75.2 + `util.js` 71.6 + `common.js` 38.1) plus a **19.1 KB** static map image.
**Recommendation.** Not a defect — but if `/` needs to reach 90, replacing the iframe with a static image that swaps to the iframe on click ("facade" pattern) removes ~378 KB and several third-party connections. It changes no visual state until interaction, so it stays inside `docs/design-system.md`.

### P-9 · Cloudinary's CDN header is `private`, not `immutable` — LOW, informational
`Cache-Control: private, no-transform, max-age=2592000` on every delivery URL. 30 days is genuinely long-lived and the URLs are content-addressed (the signing endpoint appends an 8-hex random suffix), so browser caching works. `private` means intermediary proxies won't cache, and `immutable` is absent. Both are Cloudinary account defaults, not something this codebase sets. Configurable in the Cloudinary console if the client ever wants it; no code change here.

### P-10 · One console error on every route — LOW
`GET /favicon.ico → 404` on all seven routes, customer and admin. That is the **only** console error on any customer route; there are **zero React warnings** (no key warnings, no missing-dependency warnings, no hydration complaints) across `/`, `/all-cars`, `/car/:id`, `/booking`, `/admin`, `/admin/availability`, `/admin/login`. `/admin/login` additionally logs the expected `401` from its own session check — correct behaviour, but it does surface as a console error.
**Fix.** Add a favicon and a `<link rel="icon">`.

### P-11 · `/api/admin/me` is requested twice on every admin page — LOW
Two independent code paths hit it: the raw `fetch` in [App.tsx:61](../src/App.tsx#L61) (`RequireAdmin`, deliberately dependency-light) and `api.me()` in [api.ts:215](../src/lib/api.ts#L215) via React Query. Measured: `/admin` = 6 API requests of which `/api/admin/me` ×2; `/admin/availability` = 4, again ×2. Admin-only, ~66 bytes. Worth folding `RequireAdmin` onto the `qk.me` query if that file is ever touched.

### Things that passed and are worth recording

- **React Query behaviour: PASS.** With a fresh browser per route, every key is fetched exactly once: `/` = 3 requests (`locations`, `cars`, `settings`), `/all-cars` = 2, `/car/:id` = 2, `/booking` = 2. Navigating `/all-cars → / → /all-cars` leaves the cumulative `/api/cars` resource-timing count at **1**. No refetch on mount, no refetch on focus.
  *(An earlier pass appeared to show duplicates; that was an artefact of my own sequential navigation attributing a previous page's in-flight requests to the next. Re-measured in isolation, there are none.)*
- **Throttled cold load: renders skeletons and settles.** Slow 3G + 4× CPU on `/all-cars`: FCP 6.1 s, skeletons visible, LQIPs decoded at 6.68 s, all 8 photos loaded by 10.03 s, 8/8 images complete, no visible thrash beyond the single skeleton→card shift in P-4.
- **The request chain is HTML → JS → JSON → image**, three sequential hops (4.44 s → 5.75 s → 7.60 s on Slow 3G). This is inherent to an SPA with client-side data; P-3's preconnect removes ~300 ms of the last hop, and it is the honest reason a static-rendered site would beat this one. Not a defect against the plan, which chose the Vite SPA deliberately.
- **API latency (local, no CDN in front):** first request 466 ms (module init + Neon connect), then **82–120 ms** warm, median ~95 ms, for a `/api/cars` that runs four parallel Neon queries. `/api/settings` 77–79 ms. `/api/cars/:id` 153–244 ms.
- **Payload shape.** `/api/cars` = 21,233 B raw / 6,109 B gzip / 5,646 B brotli for 8 cars, 43 images, 1 location. The embedded `LocationDTO` costs **1,967 B = 9.3%** of the payload, duplicated across 7 cars for 1 distinct branch. **That is the right trade today** — a second round trip would cost far more than 2 KB. The crossover is roughly where the location payload exceeds the cost of a second request: with 1–2 branches that is past ~100 cars, exactly as the prompt anticipated. At 30 cars this payload would be ~75 KB raw / ~20 KB gzip. Revisit the top-level `locations` map shape then, not before.
- **LQIP payload is not a problem.** 33.1% of the raw JSON *sounds* alarming; it is 7 KB in absolute terms and compresses well. Leave it.

---

## §5b — the availability calendar

**Request count: PASS.** `/admin/availability` renders **8 cars × 30 days = 240 cells** from exactly **one** `GET /api/admin/availability?from=2026-09-01&to=2026-10-01`. Total API traffic for the page is 4 requests: `admin/me` ×2 (P-11), `cars`, `availability`. Clicking to the next month issues exactly **one** further request (`?from=2026-10-01&to=2026-11-01`). No per-car fan-out anywhere. This is what CONTRACT §16.7 asked for and it is delivered.

**Drag performance: acceptable.** Measured with synthetic pointer events at **4× CPU throttle**, dragging across 10 day-cells with 5 `pointermove` events each (50 events total, 1,046 ms), 1024×900 viewport:

| | 4× CPU | no throttle |
| --- | --- | --- |
| DOM mutation records | 20 (11 batches) | 20 (11 batches) |
| **Mutations per pointermove** | **0.4** | **0.4** |
| Frame p50 / p90 / p99 / max | 16.5 / 22.6 / 74.5 / **74.5 ms** | 16.4 / 17.6 / 24.8 / **24.8 ms** |
| Frames > 33 ms | **1 of 88** | **0 of 76** |
| Long tasks | one, 72 ms | none |
| `/api/admin/availability` calls during the drag | **0** | **0** |

The grid does **not** re-render on every pointer move. `CalendarRow` is not wrapped in `React.memo`, so each selection change does re-render all 8 rows — but the early-bail at [FleetCalendar.tsx:120-122](../src/components/admin/availability/FleetCalendar.tsx#L120-L122) means a selection change only happens when the pointer crosses a **day boundary**, capping re-renders at ~1 per cell rather than 1 per event. 11 render batches for 50 pointer events. The one 72 ms long task at 4× throttle is the first render after `setSelection` mounts the preview pill; p50 stays at 60 fps throughout. **No defect. Do not add `React.memo` on the strength of this measurement — the mechanism that matters is already there.**

**One UX observation, not a perf defect.** At a real phone width of 412 px, the 176 px sticky name column leaves room for only about **6 of the 30 day columns**, and after excluding past days only 2 were draggable. Blocking a week-long range on a phone therefore requires panning mid-gesture. The long-press-to-arm design handles this correctly, but it is worth knowing that the owner's most-used screen shows a fifth of the month at a time. (This is also why the drag numbers above were taken at 1024 px — a 412 px drag could not cross enough cells to measure.)

---

## Security findings

| # | Severity | Issue | Location | Recommendation |
| --- | --- | --- | --- | --- |
| **S-1** | **HIGH** | **A 10 MB `description` is accepted with `200`.** `nullableText` sets no maximum length, so a single write can inflate the world-readable, CDN-cached `/api/cars` payload without bound. Every other one of 13 malformed-input probes correctly returned `422`. | [validate.ts:59-63](../server/lib/validate.ts#L59-L63), used by `description`, `carType`, `fuel`, `transmission`, `addressFull`, `officeName` | Add `.max(n)` — e.g. 5,000 for `description`, 200 for the rest. `note` already does this (`.max(200)`), which is the pattern to copy. |
| **S-2** | **HIGH** | **Leftover test admin account.** `admin_users` contains `p07-verify@example.invalid` (bcrypt $2b$12, created 2026-09-05T12:49:54Z) alongside the real owner account. A second credential with an unknown password on a single-admin system. | `admin_users` table | Delete the row. Add a cleanup step to P07's runbook so verification accounts never outlive the run. |
| **S-3** | **MEDIUM** | **No login rate limiting.** One known admin account, no throttle, no lockout. bcrypt cost 12 (~250 ms/attempt) is the only brake. | [auth.ts:51-66](../server/routes/auth.ts#L51-L66) | Per-IP counter with a short lockout. **Note the deployment constraint:** Vercel serverless gives each instance its own memory, so an in-process counter is bypassed simply by being routed elsewhere. Use a shared store — a small `login_attempts` table in the Postgres you already have is the lowest-friction option here, keyed on IP with a rolling window. |
| **S-4** | **MEDIUM** | **No security headers.** `vercel.json` has only a `rewrites` block. Absent: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, CSP. | [vercel.json](../vercel.json) | Start with the three free ones (below). A CSP is genuinely fiddly here and is offered as a starting point, not a defect. |
| **S-5** | **LOW** | **The session is never checked against `admin_users`.** `requireAuth` verifies only the JWT signature and `exp`. I minted a token for `sub: audit-p08 / email: audit@p08.local` — a user that does not exist — and `GET /api/admin/me` returned `200 {"email":"audit@p08.local"}`. So a token stays valid for its full 7 days after the account is deleted, and there is no revocation path. | [auth.ts:96-125](../server/lib/auth.ts#L96-L125) | Acceptable for one owner with no revocation requirement — but if the JWT secret is ever rotated or an account deleted, note that existing sessions survive. A `sub` lookup on `/admin/me` would close it for one query per admin page load. |
| **S-6** | **LOW** | **`POST /api/admin/logout` returns `200` unauthenticated.** Deliberate and documented ([app.ts:26-34](../server/app.ts#L26-L34)): a browser holding an expired cookie must be able to clear it. `sameSite=Lax` blocks cross-site POSTs, so this is not a usable CSRF-logout vector. **Recorded as a deliberate tradeoff, not a defect.** | — | No change. |
| **S-7** | **LOW** | **43 `car_images` uuids in the public payload.** ~2.0 KB = 9.4% of `/api/cars`. No customer surface uses them; only the admin reorder/patch/delete endpoints do. They are opaque and leak nothing, and CONTRACT §3 puts `id` in `CarImageDTO`, so this is contractual. | [mappers.ts:124-136](../server/lib/mappers.ts#L124-L136) | Leave it — changing the DTO is a contract change. Noted only because the prompt asked about "internal ids beyond the slugs". |
| **S-8** | **LOW** | **`/api/health` is CDN-cached for 60 s.** It gets the same `s-maxage=60` as the content routes, so it can report `db: true` for up to a minute after the database goes down. | [public.ts:158-167](../server/routes/public.ts#L158-L167) | Give the health route `no-store`. One line. |

### Client bundle secrets — CLEAN

```
grep -rniE "api_secret|CLOUDINARY_API_SECRET|JWT_SECRET|DATABASE_URL|postgresql://|neon\.tech|password" dist/assets/*.js
```

Nine matches, all benign, verified in context:
- 8 × `password` — React DOM's internal input-type table and the login form's `type="password"` / `autoComplete="current-password"` / the `{ email, password }` request body shape.
- 1 × `apiKey` / `api_key` — inside `FormData.append("api_key", a.apiKey)` in the Cloudinary upload path. That value arrives **at runtime** from `POST /admin/uploads/sign`; it is not baked in.

`w13utvcd` (the cloud name) appears exactly once — expected and public by design. `res.cloudinary.com` appears once, in the URL builder. **No API secret, no JWT secret, no connection string, no `neon.tech`.** `.env` is gitignored (`.env*` with `!.env.example`) and untracked.

`dist/` also contains **no baked payload data**: no `"note"`, no block records, no prerendered JSON — only `index.html`, one JS chunk, one CSS chunk, and the copied `public/` images.

### §6b — `directionsUrl` → `href`: all three layers verified

**Layer 1 — P04 rejects client-side.** [LocationManagerDialog.tsx:596-601](../src/components/admin/LocationManagerDialog.tsx#L596-L601) blocks submission via `isHttpUrl()` ([:616-623](../src/components/admin/LocationManagerDialog.tsx#L616-L623)), a `new URL()` scheme check. The "Test this link" preview is itself rendered through `directionsHref()` and only when the field has no error, so even the preview cannot become a hostile `href`. **PASS.**

**Layer 2 — P01 returns `422`.** Probed against the live API with a session cookie. All eight hostile values rejected on `POST /api/admin/locations`, all five on `PATCH /api/admin/locations/:id`:

| Value | POST | PATCH |
| --- | --- | --- |
| `javascript:alert(1)` | 422 | 422 |
| `JaVaScRiPt:alert(1)` | 422 | 422 |
| `data:text/html,<script>alert(1)</script>` | 422 | 422 |
| `vbscript:msgbox(1)` | 422 | 422 |
| `//evil.example.com` | 422 | 422 |
| `/relative` | 422 | — |
| `maps.google.com/x` | 422 | — |
| `file:///etc/passwd` | 422 | — |

Every response is `{"error":{"code":"validation_failed","message":"directionsUrl: must be an absolute http:// or https:// URL"}}`. The stored value was re-read after the hostile PATCH sequence and was **unchanged**. **PASS.**
*(Probes ran against a scratch branch created with `isActive: false` — so it was invisible to the public `/api/locations`, which filters on `isActive` — and deleted afterwards. `/api/locations` was confirmed to contain 0 occurrences of it while it existed.)*

**Layer 3 — `directionsHref()` neutralises whatever is already stored.** This is the layer that protects a row written before the validation existed, so I exercised the shipped implementation directly with 16 hostile values. **All 16 fell back to the derived Google Maps search; zero produced a non-http(s) href:**

`javascript:alert(document.cookie)` · `JaVaScRiPt:alert(1)` · `  javascript:alert(1)  ` (padded) · `java\tscript:alert(1)` (embedded tab) · `javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>` · `data:text/html;base64,…` · `vbscript:msgbox(1)` · `file:///C:/Windows/win.ini` · `about:blank` · `//evil.example.com/maps` (protocol-relative) · `/relative/path` · `maps.google.com/x` · `\u0001javascript:alert(1)` (leading control char) · `jAvAsCrIpT\n:alert(1)` · `''` · `null`

And the three legitimate values passed through **byte-identical**: `https://maps.app.goo.gl/abc123`, `http://osm.org/go/xyz`, `https://maps.apple.com/?q=Proddatur`. **PASS.**

*I verified this against the real function rather than by writing a hostile row into the live database with `db:studio`, as the prompt suggested. `directionsHref()` is a pure function of a `LocationDTO`, and [mappers.ts:143-155](../server/lib/mappers.ts#L143-L155) passes `row.directionsUrl` through untransformed — so a hostile row reaches this function exactly as my test values did, and this covers strictly more cases than one hand-written row would. It also avoided putting `javascript:` into the owner's live branch record on a database another session was actively using.*

**`mapEmbedSrc()` cannot be steered.** Origin was `https://www.google.com` for every input, including a stored `https://evil.example.com/embed`, because the function is built from the **address**, never from `directionsUrl` ([locationHelpers.ts:226-228](../src/lib/locationHelpers.ts#L226-L228)). Feeding hostile values into the *address* — `x&output=embed&pb=https://evil.example.com`, `"><script>alert(1)</script>`, `https://evil.example.com` — also cannot escape: `encodeURIComponent` turns `&` into `%26`, so no parameter injection is possible. **PASS.**

**`rel="noopener noreferrer"`: PASS.** All nine external links carry it — [OfficeLocation.tsx:135](../src/components/OfficeLocation.tsx#L135), [CarDetailsPage.tsx:416](../src/pages/CarDetailsPage.tsx#L416) and [:526](../src/pages/CarDetailsPage.tsx#L526), [LocationManagerDialog.tsx:338](../src/components/admin/LocationManagerDialog.tsx#L338), [ConciergeSidebarContent.tsx:156](../src/components/booking/ConciergeSidebarContent.tsx#L156) and [:179](../src/components/booking/ConciergeSidebarContent.tsx#L179), [Navbar.tsx:107](../src/components/Navbar.tsx#L107) and [:157](../src/components/Navbar.tsx#L157), [HomePage.tsx:51](../src/pages/HomePage.tsx#L51).

### §7b — availability block notes never reach a public response: PASS

Tested end to end against the live API. I created two blocks on `toyota-innova` carrying a note that combines a customer's name, a phone number and an XSS payload — `Ravi Kumar 9876543210 - Hyderabad trip <img src=x onerror=alert(1)>` — one **active** (2027-03-01 → 2027-03-05) and one **expired** (2026-08-01 → 2026-08-05, prefixed `EXPIRED`). Then I searched the entire public payload:

| Probe over the full `/api/cars` body | Result |
| --- | --- |
| `"note"` | **absent** |
| `"carId"` | **absent** |
| `Ravi` | **absent** |
| `onerror=` | **absent** |
| `EXPIRED` | **absent** |
| `2026-08-01` (the expired block's start date) | **absent** |
| `passwordHash` / `password_hash` | **absent** |
| admin email / `admin_users` | **absent** |
| block object keys actually present | **`startDate,endDate` — and nothing else** |

`GET /api/cars/:id` gives the identical result. The expired block was dropped **entirely**, not merely stripped of its note — so there is no dead weight and no year-of-history leak in the CDN-cached payload. `dist/` contains no `"note"` and no block data of any kind.

This holds by construction, not by discipline: [mappers.ts:165-181](../server/lib/mappers.ts#L165-L181) defines `toBlockedRangeDTO` (public) and `toAvailabilityBlockDTO` (admin) as **two separate functions** rather than one with an `includeNote` flag, so the public mapper physically cannot reach `row.note`. Expiry is enforced in the query itself, `gt(endDate, todayInIndia())`, in all three public read paths ([public.ts:74](../server/routes/public.ts#L74), [:108](../server/routes/public.ts#L108), [queries.ts:34](../server/lib/queries.ts#L34)).

*An earlier, independent confirmation came for free: at the start of the audit the database held a P07 block on `force-traveller-mini-bus` with the note `"P07 verification block"` (active) and one on `mahindra-scorpio` noted `"P07 expired"` (ended 2026-09-04, i.e. before today). The public payload showed the first as `{"startDate":"2026-09-05","endDate":"2026-09-08"}` with no note, and the second not at all.*

All test blocks were deleted; the table is empty and verified so.

### Admin endpoint auth matrix

Every route registered in `server/` was enumerated from source and probed unauthenticated — no sampling. Destructive routes were probed with ids that do not exist, so an unguarded route would have answered `404` (proving the hole) rather than destroying data.

| Route | Method | Unauth status | Pass? |
| --- | --- | --- | --- |
| `/api/cars` | GET | 200 | ✔ public |
| `/api/cars/:id` | GET | 200 / 404 unknown | ✔ public |
| `/api/locations` | GET | 200 | ✔ public |
| `/api/settings` | GET | 200 | ✔ public |
| `/api/health` | GET | 200 | ✔ public |
| `/api/admin/login` | POST | **401** (bad creds) | ✔ |
| `/api/admin/logout` | POST | **200** | ✔ deliberate (§ above) |
| `/api/admin/me` | GET | **401** | ✔ |
| `/api/admin/locations` | GET | **401** | ✔ |
| `/api/admin/locations` | POST | **401** | ✔ |
| `/api/admin/locations/:id` | PATCH | **401** | ✔ |
| `/api/admin/locations/:id` | DELETE | **401** | ✔ |
| `/api/admin/cars` | POST | **401** | ✔ |
| `/api/admin/cars/:id` | PATCH | **401** | ✔ |
| `/api/admin/cars/:id` | DELETE | **401** | ✔ |
| `/api/admin/uploads/sign` | POST | **401** | ✔ |
| `/api/admin/cars/:id/images` | POST | **401** | ✔ |
| `/api/admin/cars/:id/images/reorder` | PATCH | **401** | ✔ |
| `/api/admin/images/:imageId` | PATCH | **401** | ✔ |
| `/api/admin/images/:imageId` | DELETE | **401** | ✔ |
| `/api/admin/settings` | PUT | **401** | ✔ |
| `/api/admin/availability` | GET | **401** | ✔ |
| `/api/admin/cars/:id/availability` | GET | **401** | ✔ |
| `/api/admin/cars/:id/availability` | POST | **401** | ✔ |
| `/api/admin/availability/:blockId` | PATCH | **401** | ✔ |
| `/api/admin/availability/:blockId` | DELETE | **401** | ✔ |

**21 of 21 guarded admin routes return 401.** The body is uniform (`{"error":{"code":"unauthorized","message":"Sign in to continue."}}`) and carries `Cache-Control: no-store`. The guard is registered as middleware before the routers ([app.ts:63-64](../server/app.ts#L63-L64)), so a new route is protected by its path rather than by remembering to add a check.

### Upload signing abuse — PASS

- **Auth required:** `401` unauthenticated.
- **`carId` validated against the DB:** an unknown car returns `404` before any signing work happens ([images.ts:271](../server/routes/images.ts#L271)).
- **The signature covers exactly what the client sends.** `signUpload` signs `{ timestamp, folder, public_id }` ([cloudinary.ts:84-87](../server/lib/cloudinary.ts#L84-L87)) and the browser sends `api_key`, `timestamp`, `signature`, `folder`, `public_id`, `file` — the signed set matches the parameter set exactly. No subset (which would leave `folder` free to change) and no superset (which would fail to verify).
- **No `upload_preset` anywhere**, signed or unsigned.
- **Traversal: contained.** `folder` is server-derived as `sv-cars/${carId}` and never comes from the client. Eight hostile filenames all landed inside the car's own folder:

| `filename` sent | Resulting `folder/publicId` |
| --- | --- |
| `../../../etc/passwd` | `sv-cars/toyota-innova/etc-passwd-e0bb3112` |
| `../../other-car/evil.jpg` | `sv-cars/toyota-innova/other-car-evil-5e648182` |
| `..%2f..%2fx.jpg` | `sv-cars/toyota-innova/2f-2fx-7809847a` |
| `a/../../b.jpg` | `sv-cars/toyota-innova/a-b-1d9ee2b8` |
| `....//x.jpg` | `sv-cars/toyota-innova/x-aab98025` |
| `%00.jpg` | `sv-cars/toyota-innova/00-a8e5b76e` |
| `  .jpg` | `sv-cars/toyota-innova/image-e5c63607` |

`slugify()` collapses everything outside `[a-z0-9]` to hyphens, so no separator survives. A `carId` of `../other` is rejected `404` by the existence check before signing.

### Auth quality — PASS on every checkable item

| Check | Result |
| --- | --- |
| bcrypt cost ≥ 10 | **cost 12** (`$2b$12$`, 60-char hashes) |
| JWT `exp` present and verified | yes — `exp` set at sign time, `verify()` enforces it |
| HS256 pinned on verify | yes — passed explicitly, so `alg: none` and asymmetric-algorithm tokens are rejected ([auth.ts:101](../server/lib/auth.ts#L101)) |
| Secret entropy ≥ 32 bytes | **64 hex chars = 32 bytes** |
| Cookie `httpOnly` / `sameSite=Lax` / `secure` in prod | all three ([auth.ts:78-85](../server/lib/auth.ts#L78-L85)) |
| Token in `localStorage` or a URL | **no** — httpOnly only |
| Account-existence oracle | **no** — same `401 invalid_credentials` body, and a real bcrypt `DUMMY_HASH` compare on the unknown-email path equalises the timing ([auth.ts:35](../server/routes/auth.ts#L35), [:61](../server/routes/auth.ts#L61)) |

### Input validation — 12 of 13 probes correct

| Probe | Response |
| --- | --- |
| `pricePerDay: -1` | 422 `cannot be negative` |
| `pricePerDay: 1.5` | 422 `must be a whole number of rupees` |
| `pricePerDay: 1e9999` | 422 `expected number, received Infinity` |
| `seating: 99999` | 422 `must be 60 or fewer` |
| `seating: 0` | 422 `must be at least 1` |
| `year: 0` | 422 `must be 1980 or later` |
| `tags: "suv"` (string not array) | 422 `expected array, received string` |
| `availability: "yes"` | 422 `expected boolean, received string` |
| `name: "   "` / missing | 422 `is required` |
| `locationId: "nope"` | 422 `no branch with id "nope"` (not a raw FK error) |
| malformed JSON | 422 `Request body must be valid JSON.` |
| **`description`: 10 MB string** | **200 — written** ← the one failure |
| settings `whatsappPhone: "abcd"` / empty `pickupAddress` / negative rate | 422 each |
| settings `whatsappPhone: "+91 970 420 1247"` | 200, normalised to `919704201247` — correct by design |
| block `endDate < startDate` / `== startDate` | 422 with the dates named |
| block `2026-02-30` / `10/09/2026` | 422 `must be a real date in 'YYYY-MM-DD' form` |
| block `note` 500 chars | 422 `must be 200 characters or fewer` |
| `?from=2026-01-01&to=2027-06-01` (400+ days) | 422 `window may not exceed 366 days` |
| `to <= from` / `from=notadate` | 422 each |

**Overlap detection re-verified from scratch** (an earlier reading was confounded by the concurrent P07 session deleting the block I was testing against). With a known block at 2027-03-01 → 2027-03-05:

| Attempt | Expected | Got |
| --- | --- | --- |
| identical `03-01 → 03-05` | 409 | **409** |
| contained `03-02 → 03-04` | 409 | **409** |
| straddling `02-25 → 03-10` | 409 | **409** |
| overlapping left `02-25 → 03-02` | 409 | **409** |
| overlapping right `03-04 → 03-10` | 409 | **409** |
| abutting before `02-25 → 03-01` | 200 (legal neighbour) | **200** |
| abutting after `03-05 → 03-08` | 200 (legal neighbour) | **200** |

The half-open `[start, end)` semantics of CONTRACT §16.1 r2 are implemented exactly — back-to-back rentals are neighbours, not conflicts.

### Injection and traversal — PASS

The only raw `sql\`\`` in the codebase is `sql\`select 1\`` in the health check ([public.ts:161](../server/routes/public.ts#L161)) — a constant, no interpolation. Everything else goes through Drizzle's query builder with bound parameters. Date columns use `mode: 'string'`, so Drizzle never hands back a `Date` built in the server's zone (I confirmed the difference directly: the raw Neon driver returns `2026-09-04T18:30:00.000Z` for a `2026-09-05` date column, while the API correctly emits `"2026-09-05"`). UUID path parameters are format-checked before reaching Postgres, so a bad URL is a `404` rather than a 500 from `invalid input syntax for type uuid`.

### Data exposure — PASS

`/api/cars` and `/api/settings` carry no `passwordHash`, no admin email, no internal table ids beyond the car/location slugs and the `car_images` uuids noted above. `createdAt`/`updatedAt` are exposed but are contractual (§3) and reveal nothing sensitive. Error bodies are uniformly `{ error: { code, message } }`; [errors.ts:84-97](../server/lib/errors.ts#L84-L97) logs the real cause and stack server-side and returns a generic sentence, so no stack trace or connection string can escape.

### Suggested headers for `vercel.json`

```jsonc
"headers": [{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy",        "value": "strict-origin-when-cross-origin" },
    { "key": "X-Frame-Options",        "value": "SAMEORIGIN" },
    { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" }
  ]
}]
```

A CSP is harder here because four third-party origins are in play. Start in **report-only** mode:

```
Content-Security-Policy-Report-Only:
  default-src 'self';
  img-src 'self' data: https://res.cloudinary.com https://lh3.googleusercontent.com https://maps.googleapis.com https://maps.gstatic.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  frame-src https://www.google.com https://maps.google.com;
  connect-src 'self' https://api.cloudinary.com;
  form-action 'self';
  base-uri 'self';
  object-src 'none'
```

Two notes: `'unsafe-inline'` in `style-src` is needed because `CarImage` sets `aspect-ratio` and the LQIP background inline (which is correct — the ratio is data). Removing `lh3.googleusercontent.com` from `img-src` becomes possible once P-2 is done, and that is a good reason to do P-2 first.

---

## Cost and operational risk

### C-1 · Cloudinary free tier (cloud `w13utvcd`) — 1.96% used

Read live from the Cloudinary Admin API `/usage` endpoint (the dashboard UI was not reachable from here; this is the same data).

| Metric | Usage | Credits |
| --- | --- | --- |
| **Total** | — | **0.49 / 25 = 1.96%** |
| Storage | 197,815,437 B = **188.6 MB** | 0.18 |
| Bandwidth | 6,605,227 B = **6.6 MB** | 0.01 |
| Transformations | **295** | 0.30 |
| Resources | 107 | — |
| Derived resources | **99** | — |

**On the derivation arithmetic the prompt asked about.** The feared explosion has not happened: **99 derived assets from 43 originals ≈ 2.3 per original**, not the double digits that 5 widths × 2 crop modes × format negotiation would imply. The reason is that Cloudinary only materialises a derivation when a URL is actually requested, and real traffic only ever asks for the two or three widths that real viewports select. Format variants of the same transformation do not each bill as a new transformation. It is a one-time cost per (image, transformation) pair and it is being paid lazily.

**So do not trim `CLD_WIDTHS` from five to three.** Transformations are 1.2% of the budget, trimming would cost image fit on real viewports, and the actual problem runs the other way — the array's 400 px *floor* is over-fetching by ~300 KB per page (P-5). **Add small widths; don't remove large ones.**

**Headroom.** Bandwidth is the binding constraint: 25 credits ≈ 25 GB/month. At the measured ~127 KB of Cloudinary bytes per `/all-cars` view, that is roughly **200,000 fleet page views per month** before the free tier bites. Storage is not close: the `sv-cars` folder is 43 originals / **14.00 MB**, i.e. ~1.75 MB per car, so ~500 cars would fit in 1 GB. This business will not outgrow the free tier on car photos. The first paid tier (Plus) is around $99/month for 225 credits — an order of magnitude more than needed.

**One thing to clean up:** the account reports 107 resources and 188.6 MB of storage, but `sv-cars/` holds only 43 of them and 14 MB. The other ~64 assets (~175 MB) are not this project's — most likely Cloudinary's default sample media. Deleting them takes the storage credit from 0.18 to ~0.01.

### C-2 · Neon free tier — 1.6% used

Database size **8,273,920 bytes = 7.89 MiB** ("8080 kB") against a 0.5 GB free-tier limit. With 8 cars, 43 image rows and a handful of small tables, growth is dominated by `car_images` (a ~163-byte LQIP per row); 500 cars would still be single-digit MB.

**Scale-to-zero:** measured a 466 ms first request against 82–120 ms warm. In this local harness that figure includes module init as well as the Neon wake, so treat it as an upper bound. The 60-second edge cache is what keeps that off the customer's critical path — with `stale-while-revalidate=86400`, only the very first visitor after a cold start can ever wait on it, and even they get a stale-but-instant response if anything is in the CDN.

### C-3 · The 60-second cache — behaves exactly as documented

All five public GETs return `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`; every `/api/admin/*` response returns `Cache-Control: no-store`, applied by middleware ([app.ts:63](../server/app.ts#L63)) so it cannot be forgotten on a new route.

**Real customer-visible staleness: up to 60 seconds. The owner sees his own edits immediately**, because the admin client sends `cache: 'no-store'`. This is the deliberate compromise recorded in PLAN.md Phase 3 and `docs/backend.md`, and it is **not** reported here as a defect. I could not observe `x-vercel-cache: HIT` because there is no deployment to test against (see below) — the header contract is verified, the CDN behaviour is inferred from it.

The plan's drop-to-5s option remains available and cheap. `docs/backend.md` is right that lowering it to 0 would be the wrong direction.

### C-4 · Single points of failure

| Risk | Current state | Recommendation |
| --- | --- | --- |
| **One admin account, no recovery** | Password reset does not exist by design. Recovery is `npm run create:admin`, which needs `DATABASE_URL` and a machine with the repo. | Document the recovery path in the README next to the runbook, and make sure the owner (not only the developer) can reach a machine that can run it. Note that the `p07-verify@example.invalid` row must go first. |
| **Cloudinary is the only online copy of the images** | `public/`'s 43 originals (14.0 MB) are the sole backup, and they only exist because they are still committed. | **Do not delete `public/` until a real backup exists** — this is why the deletion is a human decision, not something this audit acts on. |
| **No database backup** | Neon free-tier retention is limited and nothing is exported. | A weekly `pg_dump` to object storage, or a scheduled Neon branch. The whole database is 8 MB; this is cheap. |
| **Single Vercel project / single region** | Acceptable for this business. | No action. |

---

## Conditions, and what I could not measure

1. **A concurrent P07 verification session was mutating the same database throughout.** It deleted its own test blocks and updated two `cars` rows (`updated_at` 13:31 UTC) mid-audit, and it added `prompts/VERIFICATION-REPORT.md` to the working tree. This confounded exactly one reading — an availability POST returned `200` where `409` was expected, because P07 had removed the conflicting block seconds earlier. I re-tested overlap detection from scratch with my own blocks and it is **correct on all seven cases**. All other measurements were re-checked against a stable state. The database was left clean: 8 cars, 1 location, 0 blocks, settings unchanged, and every audit artefact deleted and verified gone.
2. **`npm audit --omit=dev` could not run.** The configured registry (`infyartifactory.jfrog.io`) returns `409 Conflict` on the advisories endpoint, and the public registry is unreachable through the proxy (`Proxy connection ended before receiving CONNECT response`). **This item is unverified.** The production dependency set to check by hand is: `@hono/zod-validator ^0.9.1`, `@neondatabase/serverless ^1.1.0`, `@tanstack/react-query ^5.102.8`, `bcryptjs ^3.0.3`, `cloudinary ^2.11.0`, `clsx ^2.1.1`, `drizzle-orm ^0.45.2`, `hono ^4.13.5`, `lucide-react ^0.546.0`, `motion ^12.23.24`, `react/react-dom ^19.0.0`, `react-router-dom ^7.14.1`, `tailwind-merge ^3.5.0`, `zod ^4.5.4`. Re-run this from an unproxied network before shipping.
3. **No production deployment was available**, so `x-vercel-cache: HIT`, real CDN edge behaviour, HTTP/2, brotli and long-lived asset cache headers are all unmeasured. Lighthouse's `uses-http2`, `uses-long-cache-ttl` and `uses-text-compression` failures are harness artefacts and should be ignored; every other finding was verified against real origins.
4. **The phone-width (412 px) calendar drag could not be driven** — only two selectable day cells fit beside the sticky name column. The drag numbers are from a 1024 px viewport at 4× CPU throttle, which is stated inline.
5. **Two probes wrote data before I could stop them** and were deleted immediately: the 10 MB-description car (finding S-1, which by definition had to succeed to be found) and one availability block. Both were removed within seconds and the removal verified. Settings probes deliberately carried the current live values in every field they were not testing, so an unexpectedly-accepted write would have been a no-op.

---

## Prioritised recommendations

Ranked by value per unit of effort.

| # | Change | Effort | Gain |
| --- | --- | --- | --- |
| 1 | **Pass `priority` to the first `/all-cars` card** (P-1) | 1 prop | **~1.5–2.3 s LCP** on the image-heaviest customer page |
| 2 | **`preconnect` to `res.cloudinary.com` + `fonts.gstatic.com`, and move the font `@import` into `index.html`** (P-3) | 4 lines | **~300 ms** to first image, **~460 ms** off the render-blocking chain, on every route |
| 3 | **Cap `description` and the other `nullableText` fields** (S-1) | 1 line per field | Closes the only successful hostile write; bounds the public CDN payload |
| 4 | **Delete the `p07-verify@example.invalid` admin row** (S-2) | 1 SQL statement | Removes a second credential with an unknown password |
| 5 | **Fix the skeleton/loaded height mismatch on both routes** (P-4) | small | **CLS 0.288 → ~0.005** and **0.344 → ~0.03**; the single biggest score lever |
| 6 | **Replace the 7 lh3 placeholder PNGs** (P-2) | medium | **~2.7 MB** on `/`, **~357 KB** on `/car/:id`; also fixes the home LCP element and unblocks a tighter CSP |
| 7 | **Add small widths to `CLD_WIDTHS`** (P-5) | 1 line | **~200 KB** on `/`, **~105 KB** on `/car/:id` |
| 8 | **Derive the gallery prefetch width from the viewport** (P-6) | small | **~178 KB** per mobile detail view, and removes contention with the LCP fetch |
| 9 | **`React.lazy` the three admin routes** (P-7) | one file | **26.69 KB gzip** off every customer page |
| 10 | **Security headers in `vercel.json`**, CSP report-only (S-4) | config | Defence in depth |
| 11 | **Login rate limiting via a Postgres-backed per-IP counter** (S-3) | small | Closes brute force; note in-memory counters don't work on Vercel |
| 12 | **Add a favicon** (P-10) | 2 lines | The only console error on any customer route |
| 13 | `no-store` on `/api/health` (S-8) | 1 line | Health checks stop lying for 60 s |
| 14 | Migrate `motion` to `LazyMotion` + `m` (P-7) | 9 files | ~30 KB gzip — real, but lower value per unit of effort than the rest |
| 15 | **Operational:** weekly `pg_dump`, a documented admin-recovery path, and a decision on `public/` (C-4 — 14 MB in every deploy, but currently the only image backup) | — | Removes the three standing SPOFs |
