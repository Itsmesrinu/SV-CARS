# P02 — Migration & Seed Scripts  ·  WAVE 1  ·  **PARALLEL** (runs alongside P01, P03–P05)

You are writing the one-time scripts that move the existing fleet into Neon + Cloudinary, create the owner's login, and seed the settings row. Your slice touches no application code at all, which makes it the most independent piece of the build.

**First:** read `prompts/CONTRACT.md` (§3 DTOs, §12 env vars), then `db/schema.ts` (from P00) and — carefully — `src/data/carImageMap.ts`, which is your source of truth.

**You own:**

```
scripts/migrate-images.ts
scripts/create-admin.ts
scripts/seed-settings.ts
scripts/seed-locations.ts
db/seed/**              (if you want a separate data module)
```

**Read-only:** `src/data/carImageMap.ts`, `public/**`, `db/schema.ts`, `db/index.ts`, `src/components/OfficeLocation.tsx` and `src/pages/CarDetailsPage.tsx` (the office strings you are seeding live there).

**You must not touch:** anything under `src/`, `server/`, `api/`, `package.json`, or `scripts/dev-server.ts` (P00 owns that one). The npm scripts `migrate:images`, `create:admin` and `seed:settings` were already added by P00 — you only need to make the files they point at exist.

`npm run seed:locations` was added to `package.json` alongside the other three when the multi-city amendment landed, so all four script entries already exist — you only write the files.

---

## Critical context: the data you are migrating

`src/data/carImageMap.ts` holds 8 cars, hand-curated, with a **deliberate image order** documented in its header comment:

```
main_front_1 → front_1/front_2 → inside_1 → inside_2 → inside_3 → side_1 → side_2 → back_1
```

That ordering is a human decision about how each car should be presented, and it must survive the migration exactly. It also contains three real-world irregularities you must preserve rather than "fix":

1. `Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol/inside_2.jpg.webp` — a genuine double extension on disk.
2. `Toyota_Glanza_5_Seater_Petrol` has **no `inside_3`**; it has `inside_4.webp` instead, and the array already accounts for that.
3. Several cars omit `carType` on purpose — the comment explains that "Cruiser" in `Force_Trax_Cruiser` is part of the model name, not a body type. **Do not fill these in.** `.github/copilot-instructions.md` forbids inventing data.

Iterate the `carData` array in order and take the `images` array as given. **Do not re-scan the `public/` folders with a glob and sort the filenames** — alphabetical order would put `back_1` first and `side_2` before `inside_1`, silently destroying the curation. Use the array; use the folder only to read the bytes.

## Task 1 — `scripts/migrate-images.ts`

Load `.env.local` via `dotenv/config` as the very first import. Validate that `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are all present and exit with a clear message naming the missing one if not.

**Cloudinary SDK setup** — per CONTRACT.md §5.2, configured from the environment, never with literals:

```ts
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
```

`secure: true` is not optional — without it the SDK returns `http://` URLs.

Upload each local file with the SDK's uploader, passing the folder and public id explicitly:

```ts
const result = await cloudinary.uploader.upload(absoluteLocalPath, {
  folder: `sv-cars/${carId}`,
  public_id: baseName,          // filename minus the final extension
  overwrite: false,
  resource_type: 'image',
});
// Persist result.public_id — NOT your constructed guess.
```

Note the difference from Cloudinary's getting-started sample: that sample uploads a **remote URL** and lets Cloudinary fetch it. You are uploading **local files from `public/`**, so pass an absolute filesystem path. Also do not `.catch()` and continue like the sample does — a swallowed upload error means a car silently loses a photo. Let it throw into your per-car try/catch (below) so the failure is counted and reported.

For each entry in `carData`, in order:

**1. Upsert the car row.**

| `cars` column | Value |
| --- | --- |
| `id` | `entry.id` (already a slug — use it verbatim, public URLs `/car/:id` depend on it) |
| `name` | `entry.displayName` |
| `carType` | `entry.carType ?? null` |
| `seating` | `entry.seating ?? null` |
| `fuel` | `entry.fuel ?? null` |
| `transmission` | `null` — not derivable from the folder name |
| `year` | `null` — not derivable |
| `description` | `null` |
| `pricePerDay` | `0` — the owner fills real rates in admin |
| `driverPricePerDay`, `kmLimitPerDay`, `extraKmCharge` | `null` — inherit the settings defaults |
| `selfDrive`, `withDriver` | `true`, `true` (matches today's `type: ['self-drive','with-driver']`) |
| `availability` | `entry.availability` |
| `deliveryAvailable` | `false` |
| `locationId` | `'proddatur'` — the branch seeded by Task 4. Every existing car rents from the one office that exists today |
| `tags`, `isFeatured` | `[]`, `false` |
| `sortOrder` | the index in `carData`, so the fleet page order is unchanged |

**Run `seed-locations` before `migrate-images`**, or the `locationId` foreign key will fail. Make the dependency explicit: check the branch row exists first and exit with a message telling the operator to run `npm run seed:locations` if it doesn't. Do **not** create the branch from inside the migration script — one job per script.

`pricePerDay: 0` is intentional and correct: the fleet card at `src/pages/AllCarsPage.tsx:46` and the carousel at `src/components/AvailableCars.tsx:10` both already hide zero prices, so nothing false reaches a customer.

**2. For each image path, in array order:**

- Resolve to disk: the paths start with `/` and are relative to `public/`, e.g. `/Toyota_Innova_8_Seater_Petrol/main_front_1.webp` → `public/Toyota_Innova_8_Seater_Petrol/main_front_1.webp`. **Assert the file exists** and fail loudly with the path if not — a silent skip here means a car quietly loses a photo.
- Read real dimensions with `sharp(file).metadata()`. Never guess or hardcode; `CarImage` uses `width`/`height` for the aspect-ratio box that prevents layout shift, so wrong numbers mean visible jank.
- Generate the LQIP: `sharp(file).resize(16).webp({ quality: 20 }).toBuffer()` → `data:image/webp;base64,<...>`. Keep it under ~1 KB; log a warning if any exceeds that, since these ship inside the JSON payload of every page load.
- Upload to Cloudinary with `folder: 'sv-cars/<carId>'`, `public_id` = the filename without extension, `overwrite: false`, `resource_type: 'image'`. For the Ertiga's `inside_2.jpg.webp`, strip only the final `.webp` → public id `inside_2.jpg`; that's ugly but harmless, and mangling it further risks a mismatch. Note what you chose in your report.
- Insert a `car_images` row: `publicId` = Cloudinary's returned `public_id` (**use the response value, not your constructed guess** — Cloudinary may adjust it), real `width`/`height`, the `blurDataUrl`, `sortOrder` = the index in the array, `isPrimary` = `index === 0`, and `kind` derived from the filename prefix: `main_front_*` → `'main'`, `front_*` → `'front'`, `inside_*` → `'inside'`, `side_*` → `'side'`, `back_*` → `'back'`, anything else → `'other'`.

**3. Idempotency — the hard requirement.** The script will be run more than once (credentials wrong the first time, a partial failure, a rerun after adding a photo). Rerunning must never duplicate rows or re-upload existing assets:

- Cars: upsert on the primary key. On conflict, **only** update the derived-from-folder fields (`name`, `carType`, `seating`, `fuel`, `availability`, `sortOrder`). **Never overwrite `pricePerDay`, `description`, `transmission`, `year`, `locationId`, `tags`, `isFeatured`, or the pricing overrides** — after the owner has entered his real rates, a rerun that resets prices to 0 would be a genuinely destructive bug. `locationId` is on that list for the same reason: once the owner has moved a car to his Kadapa branch, a rerun must not drag it back to Proddatur. Set it **only on insert**.
- Images: before uploading, check whether a `car_images` row already exists for that `(carId, publicId)`; skip if so. Prefer Cloudinary's `overwrite: false` plus a pre-check over relying on upload errors.

**4. Output.** Print a per-car summary line and a final tally: cars inserted / cars updated / images uploaded / images skipped / errors. Exit non-zero on any error so a failed run is obvious in a terminal.

Wrap each car in its own try/catch so one bad file doesn't abort the remaining seven, and report the failures at the end.

## Task 2 — `scripts/create-admin.ts`

Creates or updates the single owner login.

- Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment, or accept them as CLI args (`tsx scripts/create-admin.ts owner@example.com 'somepassword'`). Prefer prompting via `node:readline` with the password read without echo if neither is supplied — but do not over-engineer; env/args is acceptable.
- Hash with `bcryptjs.hash(password, 12)`.
- Lowercase and trim the email before storing, because `POST /admin/login` looks it up lowercased.
- Upsert on email, so rerunning it is how the owner resets his password.
- Enforce a minimum password length of 10 and refuse anything in an obvious-weak list (`password`, `admin123`, `12345678`). This is the only credential guarding the fleet data.
- **Never log the password or the hash.** Print only `Admin ready: owner@example.com`.

## Task 3 — `scripts/seed-settings.ts`

Writes the single `settings` row (id = 1) with the values **currently hardcoded in the app**. These are real business data — extract them from the existing code, do not invent them:

| Field | Value | Current source |
| --- | --- | --- |
| `whatsappPhone` | `919704201247` | `src/pages/CarDetailsPage.tsx:99`, `src/components/booking/ConciergeSidebarContent.tsx:59`, `src/components/ShareLocation.tsx:22` |
| `pickupAddress` | `Narasimhapuram, Proddatur` | `src/pages/CarDetailsPage.tsx:126` |
| `defaultDriverPricePerDay` | `1000` | `src/pages/CarDetailsPage.tsx:84` (`driverRate`), `src/pages/BookingPage.tsx:14` |
| `defaultKmLimitPerDay` | `100` | `src/pages/CarDetailsPage.tsx:112` (`'100 km/day'`) |
| `defaultExtraKmCharge` | `50` | `src/pages/CarDetailsPage.tsx:113` (`'₹50/km'`) |

Open those files and confirm each value before writing it — if any differs from what's listed here, **the code wins and you must report the discrepancy**. Getting the phone number wrong sends every booking to a stranger.

Idempotent upsert on `id = 1`, but on conflict **do nothing** rather than overwriting — once the owner has adjusted his phone number or rates, a rerun must not stomp them. Add a `--force` flag for a deliberate reset.

Since the multi-city amendment these two are **fallbacks** (CONTRACT.md §15.5), used when a car has no branch or a branch has no phone. Seed them anyway with exactly the values above: they are the safety net, and the current fleet's message output must stay byte-identical either way.

## Task 4 — `scripts/seed-locations.ts`

Creates the **one branch that exists today**, so the multi-city feature starts from real data rather than an empty table (CONTRACT.md §15, PLAN.md Amendment 1). Every string below is already in the codebase — extract them, do not retype or improve them:

| Field | Value | Current source |
| --- | --- | --- |
| `id` | `proddatur` | slug of the city |
| `city` | `Proddatur` | `src/pages/CarDetailsPage.tsx:191` (*"in Proddatur"*) |
| `officeName` | `Proddatur Branch` | `src/pages/CarDetailsPage.tsx:344` |
| `addressShort` | `Narasimhapuram, Proddatur` | `src/pages/CarDetailsPage.tsx:126,345` — this exact string is the WhatsApp `Pickup:` line |
| `addressFull` | `Narasimhapuram village, Proddatur mandal, Kadapa district, Andhra Pradesh, India` | `src/components/OfficeLocation.tsx:19` |
| `directionsUrl` | `null` | **The client has not supplied a map link yet.** Leave it null; `directionsHref()` falls back to a maps search on the address. Do not paste a guessed URL, and do not reuse the iframe `src` at `OfficeLocation.tsx:61` — its coordinates (`!2d78.55!3d14.73`) and place id (`0x0:0x0`) are placeholders someone made up, and seeding them would ship an invented location |
| `whatsappPhone` | `null` | Inherits `settings.whatsappPhone`; there is only one number today |
| `isActive` | `true` | |
| `sortOrder` | `0` | |

Open each source file and confirm the string character for character before writing it. `addressShort` is the one that matters most: it lands verbatim in every WhatsApp booking message, and P07 diffs that message byte for byte against the pre-migration output. A stray comma there is a failing test.

Idempotent upsert on `id = 'proddatur'`, **do nothing on conflict** — the owner may have corrected the address by the time this is rerun. Same `--force` flag as `seed-settings`.

Print the branch and a reminder that the owner adds further cities in the admin panel, not in this script. **Do not seed a second, example or placeholder city.** There is exactly one office today; inventing "Kadapa Branch" to demo the feature would put a fake business address in front of customers.

## Task 5 — Availability blocks: seed nothing

Amendment 2 added `car_availability_blocks` (CONTRACT.md §16). **Do not seed any rows into it, and do not write a script for it.** Nobody knows which cars are out this week except the owner, and a fabricated "booked until Friday" would take a real car off his website. Every car starts with an empty calendar, which correctly renders as "Available".

The only thing you owe this table is not breaking it: `migrate-images` must not touch it, and a rerun must leave any blocks the owner has since entered completely alone.

---

## Verify your slice

You can run these for real as soon as `.env.local` has credentials and the schema is on Neon (`npm run db:push`):

```bash
npm run seed:settings
npm run seed:locations        # MUST run before migrate:images — cars reference the branch
npm run create:admin -- owner@example.com 'a-real-password'
npm run migrate:images
npm run migrate:images        # run it TWICE — the second run must upload 0 and insert 0
npm run db:studio             # eyeball the rows
```

If you have no credentials yet, write the scripts anyway and make P06 execute them — say so clearly in your report. Do a dry-run pass (`--dry-run` flag that logs what it would do without writing) if it helps you validate the path/order logic offline; that flag is a genuinely useful addition.

## Acceptance

1. All 8 cars inserted, `sortOrder` 0–7 matching `carData` order, and **every one carries `locationId = 'proddatur'`** — a null there means the city filter will hide that car.
2. Total `car_images` rows = 43 (2+4+7+7+5+7+5+6 — **verify this count against `carImageMap.ts` yourself** rather than trusting my arithmetic).
3. Per car, `sortOrder` 0..n-1 matches the `images` array order exactly, and `isPrimary` is set on exactly one image (the `main_front_1`).
4. Every `width`/`height` is a real dimension read from the file; no zeros, no placeholders.
5. Every `blurDataUrl` is a valid `data:image/webp;base64,` string under ~1 KB.
6. **A second full run reports 0 uploads, 0 inserts and 0 errors.**
7. A run after manually setting `pricePerDay = 2500` on one car leaves that price untouched.
8. `npx tsc --noEmit` shows no errors originating in `scripts/`.

## Commit

`git add scripts/migrate-images.ts scripts/create-admin.ts scripts/seed-settings.ts scripts/seed-locations.ts db/seed 2>/dev/null; git commit -m "feat(scripts): Cloudinary image migration, admin creation, settings and branch seed"`

Only your paths — never `git add -A`, four other sessions have work in progress in this tree.

## Report back

Cars and images migrated (with the exact image count), how you handled `inside_2.jpg.webp`, any discrepancy between the hardcoded values in Task 3 and what you actually found in the code, whether you executed the scripts or only wrote them, and the second-run output proving idempotency.
