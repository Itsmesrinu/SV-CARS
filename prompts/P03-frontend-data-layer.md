# P03 — Frontend Data Layer & `CarImage`  ·  WAVE 1  ·  **PARALLEL** (runs alongside P01, P02, P04, P05)

You are building the plumbing that P04 and P05 consume: the typed API client, the React Query hooks, the loading skeletons, and `CarImage` — the component that makes the whole site fast. Two other sessions are writing imports against your signatures **right now**, so the signatures in `prompts/CONTRACT.md` are frozen.

**First:** read `prompts/CONTRACT.md` end to end. §6 (`CarImage` props), §7 (`lqip`), §9 (`api`) and §10 (hooks) are your exact specification. Then read `src/types/api.ts` and `src/lib/cloudinary.ts` (both from P00 — read-only for you).

**You own:**

```
src/lib/api.ts
src/lib/lqip.ts
src/hooks/**              useCars.ts, useSettings.ts, useLocations.ts, useAvailability.ts, useAdminAuth.ts, index.ts
src/components/CarImage.tsx
src/components/ui/**      Skeleton.tsx and friends
```

**You must not touch:** `src/App.tsx`, `src/main.tsx` (P00 already mounted `QueryClientProvider`), any page, any existing component, `src/lib/cloudinary.ts`, `src/lib/carHelpers.ts`, `src/lib/locationHelpers.ts`, `src/lib/availability.ts`, `src/lib/cityFilter.ts` and `src/lib/dateFilter.ts` (**P05 owns the city and date selection state — you own only the data fetch**), `src/types/api.ts`, or anything under `server/`, `scripts/`, `db/`.

---

## Task 1 — `src/lib/api.ts`

Implement exactly the `api` object and `ApiRequestError` class from CONTRACT.md §9.

- One internal `request()` helper. Base path `/api` (same-origin; the Vite dev proxy forwards to the API on port 3001, and in production Vercel serves both from one domain — so **never** hardcode a host or read a base-URL env var).
- Parse the `{ error: { code, message } }` body on non-2xx and throw `ApiRequestError` carrying `code` and `status`. If the body isn't JSON — which is what you get when the SPA rewrite accidentally swallows `/api` and returns `index.html` — throw a clear error saying so rather than a bare `Unexpected token <`. That specific misconfiguration is easy to hit and maddening to diagnose without a good message.
- **Every admin method** sends `credentials: 'same-origin'` and `cache: 'no-store'`. The no-store is what makes the owner see his own saves instantly despite the 60s public cache — it's a requirement from `docs/admin-rules.md`, not an optimisation.
- Public methods unwrap the envelope: `getCars()` returns `CarDTO[]`, not `{ cars: [...] }`. The server sends the envelope (CONTRACT.md §8); your client hides it.
- No retry logic here — React Query owns retries.

## Task 2 — `src/hooks/`

Implement the hooks and the frozen `qk` query-key factory from CONTRACT.md §10. Export everything from `src/hooks/index.ts` so consumers have one import path.

- `useCars()`, `useCar(id)` — `useCar` must be `enabled: !!id` so it doesn't fire on an undefined route param.
- `useSettings()` — settings change almost never; give it a longer `staleTime` (10 minutes).
- `useLocations()` — the active branches (CONTRACT.md §15). Same long `staleTime` as settings; cities change about as often. An empty array is a normal answer, not an error state, and consumers must not spin forever on it.
- `useAdminAuth()` — wraps `qk.me`, plus `login`/`logout` mutations that invalidate it. `retry: false` on the `me` query: a 401 is a legitimate answer, not a failure to retry.
- Admin mutation hooks for P04: `useCreateCar`, `useUpdateCar`, `useDeleteCar`, `useAddImage`, `useReorderImages`, `useUpdateImage`, `useDeleteImage`, plus `useAdminLocations`, `useCreateLocation`, `useUpdateLocation`, `useDeleteLocation`. Each invalidates `qk.cars` **and** `qk.car(id)` on success — miss the second and the detail page shows stale data after an edit.
- The four location mutations additionally invalidate **`qk.locations` and `qk.adminLocations`**, and they must invalidate `qk.cars` too: every car embeds its branch, so renaming a city has to refresh every car card that displays it. `useDeleteLocation` takes `{ id, force? }` and must surface the `409 conflict` to the caller rather than swallowing it — P04 turns that into "3 cars are still assigned to this branch".
- Availability hooks for P09 and P04 (CONTRACT.md §16): `useFleetAvailability(from, to)`, `useCarAvailability(carId)`, `useAddBlock`, `useUpdateBlock`, `useDeleteBlock`. Every one of the three mutations invalidates **`qk.cars` as well as the availability keys** — a car's public `blocks` array is part of `CarDTO`, so blocking dates in admin must immediately change the fleet card's badge. Miss that and the owner blocks a car and sees no effect, which reads as a broken save.
- `useAddBlock` and `useUpdateBlock` must surface the **`409 conflict`** (overlapping block) to the caller with the conflicting dates intact. P09 renders it inline on the grid; swallowing it there means the owner drags a range, nothing happens, and he has no idea why.
- For `useReorderImages`, implement an optimistic update with rollback on error. Drag-and-drop that visibly snaps back for 300ms before settling feels broken, and this is the one place it's worth the extra code.

Do not add a global error toast system — P04 handles its own error display.

## Task 3 — `src/components/CarImage.tsx` — the performance centrepiece

Implement exactly the props in CONTRACT.md §6. This single component is what delivers the "fast, no page-loading jank" requirement, so it deserves real care. Behaviour:

1. **Zero layout shift.** Wrap the `<img>` in a container with an explicit aspect ratio computed from the DB's `width`/`height`, and set the intrinsic `width`/`height` attributes on the `<img>` itself. The browser then reserves the exact box before a single byte of image arrives. Today's gallery at `src/pages/CarDetailsPage.tsx:136` animates images in over an empty box — that's the jank you are eliminating.
2. **LQIP.** Render `image.blurDataUrl` as a blurred, scaled background behind the `<img>`, and fade the real image over it on `load`. Handle the `blurDataUrl === null` case with a neutral `bg-surface-container-low` fill (an existing token — do not invent a colour).
3. **Responsive delivery.** `srcSet` from `cldSrcSet(image.publicId, image.width)`, `sizes` from the required prop. `src` falls back to a mid-range width. Never serve a 1600px file into a 400px card. Pass `cldFit` through to the builder so a caller can request the content-aware `c_auto,g_auto` crop for a fixed-height box — see CONTRACT.md §6.1 for the `fit` (CSS `object-fit`) versus `cldFit` (Cloudinary crop) distinction and the per-surface table. Honour the `aspect` prop when supplied: the wrapper uses that ratio and the intrinsic `width`/`height` are derived from it, so a fixed-ratio card reserves the correct box even when the photo behind it is a different shape.
4. **Priority.** `priority` → `loading="eager"` + `fetchPriority="high"`. Otherwise `loading="lazy"`. Always `decoding="async"`. P05 will set `priority` on the hero and the first gallery frame; everything else stays lazy.
5. **Null-safe.** `image === null` renders the neutral placeholder box at a sane default ratio — **never** a broken-image icon. A car whose photos haven't been uploaded yet must still lay out correctly.
6. **Error fallback.** On the `<img>`'s `onError`, keep the LQIP/placeholder visible instead of showing the browser's broken-image glyph.

Note React 19 uses the camelCase `fetchPriority` prop (it renders the lowercase attribute). Verify it lands in the DOM as `fetchpriority` — check the rendered HTML rather than assuming.

Also export a small helper P05 needs for gallery prefetching:

```ts
/** Warms the browser cache for the next gallery frame. No-op when image is null. */
export function prefetchCarImage(image: CarImageDTO | null, width: number): void;
```

Implement it with `new Image()` and the same `cldUrl` transform the gallery will actually request, so the prefetch hits the same cache entry — a prefetch at a different width is wasted bandwidth, not a speed-up.

## Task 4 — `src/components/ui/Skeleton.tsx`

A minimal skeleton primitive plus purpose-built shapes that P04 and P05 drop in while queries are pending:

- `<Skeleton className="..." />` — base pulse block. Use the existing palette (`bg-surface-container-low`, `bg-slate-100`) and the existing rounding (`rounded-xl`, `rounded-2xl`). **`docs/design-system.md` forbids new visual styles** — a skeleton is not an excuse to introduce a new grey.
- `<FleetCardSkeleton />` — must match the real fleet card's dimensions from `src/pages/AllCarsPage.tsx` (image block `h-28 md:h-64`, then the `p-2.5 md:p-6` body). Read that file and mirror it; a skeleton of the wrong height causes exactly the layout shift you're trying to prevent.
- `<CarDetailSkeleton />` — matches the detail page's `aspect-[16/9] md:aspect-[21/9]` gallery plus the thumbnail strip.

Export them from `src/components/ui/index.ts`.

---

## Verify your slice

You cannot render the real pages (P04/P05 own them) and the API may not exist yet (P01 is mid-flight). So verify like this:

1. `npx tsc --noEmit` — no errors originating in **your** files. Errors elsewhere are expected during Wave 1; ignore them.
2. Against P01's dev server if it's up (`npm run dev:api`), or against `curl` fixtures, confirm `api.getCars()` unwraps correctly and a 404 throws `ApiRequestError` with `code: 'not_found'` and `status: 404`.
3. Build a scratch check for `CarImage` — a temporary file you delete before committing, or a Node assertion over `cldSrcSet` output. Confirm: the srcSet omits widths above the natural width; the aspect box math is right for a 1600×900 input; `priority` flips the loading attribute.
4. Confirm `createLqip()` in a browser console on a real `.webp` from `public/` returns a data URL under ~1 KB with correct natural dimensions.

## Acceptance

1. `src/lib/api.ts` exports exactly CONTRACT.md §9 — every method, same names, same return types, `getLocations` and the four admin location methods included.
2. Hooks export exactly CONTRACT.md §10, including the frozen `qk` keys and `qk.locations` / `qk.adminLocations`.
3. `CarImage` accepts exactly the CONTRACT.md §6 props, renders `srcSet` + `sizes` + intrinsic `width`/`height`, and handles `image === null` without a broken image.
4. `createLqip` matches CONTRACT.md §7.
5. No new colours, fonts, radii or shadows anywhere in your files.
6. You changed zero files outside your ownership list.

## Commit

`git add src/lib/api.ts src/lib/lqip.ts src/hooks src/components/CarImage.tsx src/components/ui && git commit -m "feat(web): typed API client, query hooks, CarImage with LQIP and responsive srcSet"`

Never `git add -A` — four other sessions have work in progress in this tree.

## Report back

The exact exported surface of each file (P04 and P05 are coding against it, so any deviation must be flagged loudly), how you verified `CarImage`'s layout-shift behaviour, and any place CONTRACT.md was ambiguous.
