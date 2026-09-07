# P08 — Performance & Security Audit  ·  WAVE 3  ·  **PARALLEL-SAFE (read-only)**

You audit the two things the client asked for by name — *"render those images"* fast and *"very fast without loading the pages... without errors"* — plus the security posture of a public app with an admin panel behind it.

This prompt is read-only, so it can run alongside someone fixing P07's findings. Just note the commit you audited (`git rev-parse --short HEAD`) so your numbers are attributable.

**You may write exactly one file:** `prompts/AUDIT-REPORT.md`. **Change nothing else.** Recommendations go in the report; another session applies them.

**First:** read `prompts/PLAN.md` Phase 4 (the image strategy — those seven points are your scoring rubric), `prompts/CONTRACT.md` §5–§7, then `src/components/CarImage.tsx`, `src/lib/cloudinary.ts` and `docs/backend.md`.

---

## Part 1 — Image delivery (the client's headline concern)

`prompts/PLAN.md` Phase 4 committed to a specific strategy. Audit each point against what shipped:

1. **Upload-time / URL-time variants, not full-size everywhere.** Open devtools → Network → Img on `/all-cars` and record the **actual transferred bytes per image**. A fleet card is `h-28` on mobile and `h-64` on desktop; if it's pulling a 1600px asset, the `sizes` attribute is wrong. Check each surface: home carousel, fleet cards, detail gallery main, detail thumbnails, admin grid.
2. **Intrinsic dimensions from the DB → zero CLS.** Confirm every `<img>` in the rendered DOM carries `width` and `height` attributes and that the aspect-ratio wrapper matches. Then measure CLS for real (below).
3. **LQIP.** Confirm `blurDataUrl` renders before the real image on a throttled connection, and measure its payload cost: `curl -s localhost:3000/api/cars | wc -c` and estimate what fraction is base64 blur data. If the catalogue JSON has ballooned past ~150 KB, the LQIPs are too big — flag it with numbers.
4. **`srcSet` + `sizes` + lazy/priority.** Verify in the DOM: `srcSet` lists multiple widths, none above the image's natural width; `loading="lazy"` on below-fold images; `loading="eager"` **and** `fetchpriority="high"` on exactly the hero carousel's first card and the detail gallery's first frame. Over-applying `priority` is as harmful as omitting it — flag any page with more than one high-priority image.
5. **Format negotiation.** Confirm the Cloudinary URLs carry `f_auto,q_auto` and that the response `content-type` is `image/avif` or `image/webp` in a modern browser. Check the `Cache-Control` on the CDN response — it should be long-lived and immutable. Also verify the crop mode per surface against CONTRACT.md §6.1: the fleet cards and home carousel should emit `c_auto,g_auto` (content-aware, because they crop into a fixed-height box), everything else `c_limit`. Spot-check one fleet card image visually — if a car's front or roof is sliced off, either the crop mode or the `aspect` is wrong.
6. **Gallery prefetch.** On the detail page, click through the gallery and confirm the next frame was already fetched (it appears in Network *before* you click, and the click produces no new request). Then confirm the prefetch requests the **same width** the gallery actually renders — a prefetch at a different width is wasted bandwidth masquerading as an optimisation.
7. **No repo-served images left.** `grep -rn 'src="/[A-Z]' src/` and confirm nothing still points at the `public/<Folder_Name>/` files. Note whether `public/`'s 43 originals are still committed — they're now redundant weight in the repo and in every deploy, though removing them is a decision for the human (they are the only backup if Cloudinary is ever lost). Recommend, don't act.

## Part 2 — Lighthouse

Run against the **production build**, not the dev server — dev numbers are meaningless because of unminified modules and HMR:

```bash
npm run build && npm run preview
```

Then Lighthouse (Chrome devtools or `npx lighthouse`), **mobile preset**, on:

- `/` (home)
- `/all-cars` (image-heaviest)
- `/car/toyota-innova-crysta` (gallery)

Record for each: Performance, LCP, CLS, TBT, Total transferred bytes, and the specific Opportunities/Diagnostics rows.

**Targets from the plan:** Performance ≥ 90, CLS ≈ 0 (< 0.05), LCP < 2.5s on mobile. Report the real numbers, pass or fail — an inflated score helps nobody.

For each miss, name the specific cause with evidence: which resource, how many bytes, which attribute is missing. "Improve LCP" is not a finding; "the fleet page's first card loads a 240 KB 1600px asset into a 176px box because `sizes` says `33vw` without a max" is.

## Part 3 — Runtime performance

1. **Cold load, throttled.** Slow 3G + 4× CPU throttle on `/all-cars`. Does the page render skeletons and settle without visible jumping? Record the Performance panel's layout-shift entries.
2. **API latency.** `GET /api/cars` timing: first (cold Neon, expect a scale-to-zero wake of a few hundred ms) versus subsequent (should be CDN-cached). Confirm the second request is served from cache — check for `x-vercel-cache: HIT` in production, or verify the `s-maxage=60, stale-while-revalidate=86400` header locally. The whole point of that header is that visitors never wait on a cold DB; confirm it holds.
3. **Payload sizes.** `/api/cars` JSON size, total JS bundle, total CSS. Since Amendment 1 every car embeds its `LocationDTO`; with 8–30 cars and one or two branches that is a few hundred duplicated bytes and the right trade for avoiding a second request, but **measure it and say so** — if the fleet grows past ~100 cars, a top-level `locations` map with `locationId` references becomes the better shape, and that is a useful thing for the next person to know. Flag any bundle chunk over ~250 KB gzipped and say what's in it. Note whether `motion` and `lucide-react` are tree-shaking properly, and whether admin code is being shipped to customers — `AdminPage` and the image manager have no business in the public bundle. If they are bundled together, recommend a lazy `React.lazy` route split with the estimated saving.
4. **Waterfall shape.** Any request chain where an image waits on JSON that waits on JS? Note whether `<link rel="preconnect">` to `res.cloudinary.com` would help — the first image request otherwise pays a fresh DNS + TLS handshake. Check the same for the office section's Google Maps iframe: it is below the fold, so confirm it carries `loading="lazy"` (the original did) and measure what it costs when it does load — a maps embed is easily the heaviest third-party thing on the home page.
5. **Query behaviour.** Confirm React Query isn't refetching on every mount or focus (P00 set `refetchOnWindowFocus: false`, `staleTime: 60s`). Navigate between pages and watch for duplicate `/api/cars` calls.
5b. **The availability grid's request count.** `/admin/availability` renders 8+ cars × 31 days. Confirm it issues **one** `GET /api/admin/availability?from=&to=` per month view, not one per car — count the requests in the network tab and report the number. Then measure the drag interaction: a click-drag across a row must not re-render the whole grid on every pointer move. Record dropped frames on a 4× CPU throttle; the owner uses this on a phone, and a janky drag on the screen he touches most is a real defect even though no customer sees it.
6. **Console.** Zero errors and zero React warnings on every route, customer and admin. Key warnings, missing-dependency warnings, and hydration complaints all count.

## Part 4 — Security audit

Independent of P07's Section D — overlap here is deliberate, because this is the class of bug that costs real money.

1. **Client bundle secrets:**
   ```bash
   grep -rniE "api_secret|CLOUDINARY_API_SECRET|JWT_SECRET|DATABASE_URL|postgresql://|neon\.tech|password" dist/assets/*.js
   ```
   Only `VITE_CLOUDINARY_CLOUD_NAME` may appear. Anything else is critical.
2. **Admin endpoint coverage.** Enumerate every route registered in `server/` by reading the source, then curl **each one** unauthenticated. Do not sample. Report a table of route → method → unauthenticated status. Every `/admin/*` must be 401.
3. **Upload signing abuse.** The signing endpoint spends the owner's Cloudinary quota. Confirm: auth required; `carId` validated against the DB; the signature covers every parameter the client sends (a signature over a subset lets a caller change `folder` or `public_id` freely); no `upload_preset` with unsigned mode anywhere.
4. **Auth quality.** bcrypt cost ≥ 10; JWT `exp` present and verified; HS256 with a secret of real entropy (≥ 32 bytes); cookie `httpOnly` + `sameSite=Lax` + `secure` in prod; no token in `localStorage` or a URL. Note the absence of login rate-limiting — with a single admin account and no throttle, the login endpoint is brute-forceable. Recommend a simple fix (a short lockout or a per-IP counter) and flag that Vercel serverless makes in-memory counters ineffective across instances.
5. **Input validation.** Confirm every write endpoint is zod-validated. Probe a few: negative `pricePerDay`, `seating: 99999`, a 10 MB string in `description`, `tags` as a string instead of an array, `year: 0`. Each should return `422`, not a 500 and not a successful write.
6. **Injection and traversal.** Drizzle parameterises, but check any raw `sql\`\`` usage for interpolated input. Confirm `publicId` from the client can't escape its folder (try `../` in a filename to `uploads/sign`).
6b. **`directionsUrl` → `href` (Amendment 1).** The owner pastes a map link and the browser navigates to it, so it is a stored-XSS candidate (CONTRACT.md §15.3). Check all three layers and report each separately:
   - **P04** rejects a non-http(s) value client-side before sending;
   - **P01** returns `422` for `javascript:`, `data:` and `vbscript:` on both POST and PATCH;
   - **`directionsHref()`** falls back to the derived maps search when the stored value is not http(s) — test this one by writing a hostile value straight into the DB with `db:studio`, because it is the layer that actually protects a row written before the validation existed.
   Also confirm every external map link carries `rel="noopener noreferrer"`, and that `mapEmbedSrc()` cannot be steered by stored data into loading a third-party origin other than Google Maps (it should be built from the address, not from a stored URL).
7. **Data exposure.** `GET /api/cars` and `/api/settings` are public — confirm they leak nothing internal (no `passwordHash`, no admin email, no internal ids beyond the slugs, no raw DB timestamps that matter). Confirm error bodies never carry stack traces.
7b. **Availability block notes (Amendment 2).** `note` on a block is the owner's private annotation and may say things like *"Ravi — Hyderabad trip"* — a customer's name in a world-readable, CDN-cached payload. Confirm the public `blocks` array carries `{ startDate, endDate }` and nothing else: `curl -s localhost:3001/api/cars | grep -iE '"note"|"carId"|"id":"[0-9a-f]{8}-'` must find nothing inside `blocks`. Check the **built `dist/`** too, in case a block ever gets baked into a prerendered payload. Also confirm expired blocks are dropped rather than shipped — a year of history in a cached payload is both a leak and dead weight.
8. **Dependencies.** `npm audit --omit=dev` — report high/critical only, with whether a fix is available.
9. **Headers.** Note what security headers are absent (`X-Content-Type-Options`, `Referrer-Policy`, a CSP). A CSP is genuinely fiddly here because Cloudinary, Google Maps links and the `lh3.googleusercontent.com` avatar are all third-party origins — recommend a starting policy rather than declaring it a defect.

## Part 5 — Cost and operational risk

Short but valuable to the client:

1. **Cloudinary free tier** (cloud `w13utvcd`) — current usage (assets, storage, monthly transformations/bandwidth) against the limit, read from the dashboard. Estimate headroom: how many more cars before it's a problem, and what the first paid tier costs. Flag the derivation arithmetic honestly: five responsive widths × two crop modes (`c_limit` and `c_auto`) × format negotiation means each of the ~43 originals can spawn a double-digit number of derived assets. They are generated once and cached thereafter, so this is a one-time transformation cost rather than a per-request one — but confirm the actual derived-asset count in the dashboard rather than assuming, and say whether trimming `CLD_WIDTHS` from five widths to three would be worth it.
2. **Neon free tier** — DB size now, projected. Note that Neon scales to zero (a first-request wake of a few hundred ms) and that the 60s edge cache is what hides it from visitors. Confirm that's actually working.
3. **The 60s cache tradeoff** — verify it behaves as documented and state the real customer-visible staleness. `docs/admin-rules.md` asks for "immediately"; the delivered behaviour is ≤60s for visitors and instant for the owner. Confirm and record it, and note the drop-to-5s option from the plan.
4. **Single points of failure** — one admin account with no recovery path beyond `npm run create:admin`; Cloudinary as the only copy of the images if `public/` is ever deleted; no DB backup configured (Neon's free tier retention is limited). Recommend concrete mitigations.

## Deliverable — `prompts/AUDIT-REPORT.md`

```markdown
# Performance & Security Audit — <date> — commit <sha>

## Verdict
<one line on perf, one line on security>

## Lighthouse (mobile, production build)
| Route | Perf | LCP | CLS | TBT | Bytes |
| / | | | | | |
| /all-cars | | | | | |
| /car/:id | | | | | |

## Image delivery vs PLAN.md Phase 4
| # | Commitment | Status | Evidence |
| 1 | Upload/URL-time variants | PASS/FAIL | actual bytes per surface |
| ... |

## Performance findings
<each with: measurement, cause, file:line, recommended fix, estimated gain>

## Security findings
| Severity | Issue | Location | Recommendation |
| CRITICAL / HIGH / MEDIUM / LOW | | | |

## Admin endpoint auth matrix
| Route | Method | Unauthenticated status | Pass? |

## Cost & operational risk
<free-tier headroom, SPOFs, mitigations>

## Prioritised recommendations
1. <highest value per unit of effort first>
```

## Rules for you

1. **Read-only.** Only `prompts/AUDIT-REPORT.md` may be written.
2. **Measure, don't guess.** Every performance claim needs a number from a tool. "Images seem large" is not a finding.
3. **Audit the production build**, and record the commit sha.
4. **Rank by value/effort**, not by how interesting the problem is.
5. **Distinguish a defect from a deliberate tradeoff.** The 60s cache is in the plan on purpose; report it as a documented tradeoff, not a bug.
6. **State what you couldn't measure and why.**