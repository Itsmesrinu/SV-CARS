# Sri Venkateshwara Cars

The website for a self-drive and with-driver car rental business in Andhra Pradesh. Customers
browse the fleet, pick their dates and send a booking enquiry **on WhatsApp**; the owner manages
cars, photos, prices, branches and availability in an admin panel.

**There are no payments anywhere in this project, and there never will be.** Booking is a
WhatsApp deep link. No cart, no checkout, no gateway. See [`docs/booking-rules.md`](docs/booking-rules.md).

## Stack

| Piece | Choice |
| --- | --- |
| Frontend | Vite + React 19 + React Router + Tailwind v4 (SPA) |
| Data layer | `@tanstack/react-query` over a typed `fetch` client |
| API | [Hono](https://hono.dev), one Vercel serverless function (`api/[[...route]].ts`) |
| Database | [Neon](https://neon.tech) Postgres + [Drizzle ORM](https://orm.drizzle.team) |
| Images | [Cloudinary](https://cloudinary.com) — signed direct browser upload, responsive delivery |
| Auth | Single owner, JWT in an httpOnly cookie |
| Hosting | Vercel |

Architecture, endpoint reference and the reasoning behind the tradeoffs: [`docs/backend.md`](docs/backend.md).
The API's own reference, written as it was built: [`server/README.md`](server/README.md).

## Prerequisites

- **Node.js 20+** and npm
- A **Neon** account (free tier is enough) — one Postgres database
- A **Cloudinary** account (free tier is enough) — cloud name, API key, API secret

## Environment variables

Copy [`.env.example`](.env.example) to `.env` (or `.env.local` — both are loaded, `.env.local`
wins, and both are gitignored) and fill in:

| Variable | Where it is used | Notes |
| --- | --- | --- |
| `DATABASE_URL` | server, scripts, `drizzle-kit` | Neon connection string, `?sslmode=require` |
| `JWT_SECRET` | server | 64 hex chars. `openssl rand -hex 32` |
| `CLOUDINARY_CLOUD_NAME` | server, scripts | |
| `CLOUDINARY_API_KEY` | server, scripts | |
| `CLOUDINARY_API_SECRET` | server, scripts | **Server only.** Never prefix it with `VITE_` |
| `VITE_CLOUDINARY_CLOUD_NAME` | browser | Same value as `CLOUDINARY_CLOUD_NAME`. A cloud name is public; this is expected |

Only `VITE_`-prefixed variables reach the browser. Everything else stays server-side —
`npm run build` is checked for leaked secrets as part of the release routine (see
[Deploying](#deploying)).

## Local setup from a fresh clone

```bash
npm install
cp .env.example .env          # then fill in the six values above

npm run db:push               # create the tables in Neon
npm run seed:settings         # the single settings row (phone, pickup address, default rates)
npm run seed:locations        # the one branch that exists today
npm run create:admin -- owner@example.com 'a-real-password'
npm run migrate:images        # uploads public/*.webp to Cloudinary and creates the 8 cars

npm run dev:all               # web on http://localhost:3000, API on http://localhost:3001
```

`seed:locations` **must run before** `migrate:images` — every migrated car takes a
`locationId` foreign key pointing at that branch, and a car with no branch is hidden from
city-filtered views.

`migrate:images` is idempotent: run it twice and the second run reports `0 uploaded, 0 inserted`.
It never overwrites a price, a branch or a spec the owner has since edited.

Two things worth knowing about local dev:

- Vercel functions cannot run under plain `vite dev`, so the same Hono app is served by
  `scripts/dev-server.ts` on port **3001** and Vite proxies `/api` to it. That keeps the API
  same-origin, which is what makes the session cookie behave locally exactly as in production.
- `npm run db:push` asks for confirmation before it runs any statement (`strict` is on in
  `drizzle.config.ts`). It therefore needs a real terminal; in a script or CI use
  `npx drizzle-kit push --force`, and read the statement list first.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 (no API) |
| `npm run dev:api` | The Hono API on port 3001, with reload |
| `npm run dev:all` | Both of the above, concurrently. **This is the one you want.** |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the built `dist/` on port 4173 (proxies `/api` to 3001, so run `dev:api` too) |
| `npm run lint` | `tsc --noEmit` over `src/`, `api/`, `server/`, `db/` and `scripts/` |
| `npm run clean` | Removes `dist/` |
| `npm run db:push` | Pushes `db/schema.ts` straight to Neon (what we use day to day) |
| `npm run db:generate` | Writes a SQL migration into `drizzle/` from the schema |
| `npm run db:studio` | Drizzle Studio — a browser UI over the live database |
| `npm run seed:settings` | Creates the single settings row. `--force` resets it, `--dry-run` prints it |
| `npm run seed:locations` | Creates the Proddatur branch. Same two flags |
| `npm run create:admin -- <email> '<password>'` | Creates the owner login, or resets its password |
| `npm run migrate:images` | One-time image migration to Cloudinary. Idempotent, so safe to rerun |

## Deploying

1. Push to a Git repository and import it in Vercel. Framework preset **Vite**; no build
   overrides are needed — [`vercel.json`](vercel.json) handles SPA routing and
   `api/[[...route]].ts` is picked up automatically as a serverless function.
2. Set all six environment variables in **Project → Settings → Environment Variables**, for
   Production *and* Preview. `VITE_CLOUDINARY_CLOUD_NAME` must be present at **build** time or
   images will not render.
3. Deploy, then check:
   - `https://<domain>/api/health` returns `{"ok":true,"db":true}`
   - a deep link like `https://<domain>/car/toyota-innova-crysta` serves the app (not a 404)
   - `https://<domain>/admin/login` accepts the owner's password
4. Before each release, from a clean build:
   ```bash
   npm run lint
   npm run build
   grep -rniE "api_secret|JWT_SECRET|DATABASE_URL|postgresql://|neon\.tech" dist/   # must find nothing
   ```

The SPA rewrite in `vercel.json` (`/((?!api/).*)` → `/index.html`) deliberately excludes
`/api/`. If you edit it, re-check that `/api/cars` still returns JSON — a wrong rewrite makes
every API call return HTML.

### Public pages are CDN-cached for 60 seconds

`GET /api/cars`, `/api/cars/:id`, `/api/locations`, `/api/settings` and `/api/health` are sent
with `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`. An admin change can
therefore take up to a minute to appear for visitors. The admin panel itself reads with
`no-store`, so the owner always sees his own edits immediately. This is a deliberate tradeoff —
the reasoning is in [`docs/backend.md`](docs/backend.md#the-60-second-public-cache).

---

# For the owner

Everything below is written for whoever runs the business, not for a developer. Sign in at
`/admin/login` with the email and password created by `npm run create:admin`.

## How the owner adds a car

1. Go to **`/admin`** and sign in.
2. Press **+ Add New Car**. The only thing you must type is the **Name** (e.g. *Maruti Suzuki
   Swift*). Everything else can be filled in later — the website hides anything you have not
   entered rather than showing a wrong value.
3. Save. The car appears at the end of the fleet with no price and no photo yet, and is counted
   under **Needs Attention** on the dashboard until it has both.
4. On the car's card press **Add Photos** (it reads **Swap Image** once the car has some) and
   upload pictures from your phone or computer. The first photo becomes the main one; use
   **Move earlier** / **Move later** to change the order customers scroll through, **Make main**
   to choose the picture on the fleet card, and the bin icon to delete one.
5. Type the **Daily Rate** straight on the card — it saves when you click away.
6. Press **Edit Specs** for everything else: seating, fuel, body type, year, description, and —
   if this car costs a different amount with a driver — **Driver charge per day**, **Km limit per
   day** and **Extra km charge**. Leave those three blank to use the standard rates.
7. In the same form, set **Rents from** — the city this car works out of. It decides which
   city's customers see the car and which WhatsApp number their enquiry reaches.
8. That is it. The car is live for customers within a minute.

While a car has **no price**, customers see no price on it and their WhatsApp message asks you
for a rate instead of quoting ₹0. That is intentional — nothing on the site is ever made up.

## Adding a city

The business can run from more than one office.

1. **`/admin`** → **Manage Cities**. The **Add a Branch** form is under your existing branches.
2. Fill in:
   - **City** — e.g. *Kadapa*. This is the name customers pick from.
   - **Office name (optional)** — e.g. *Kadapa Branch*. Blank shows "Kadapa Branch" anyway.
   - **Short address (shown on booking)** — e.g. *Nagarajupeta, Kadapa*. **This exact text
     becomes the `Pickup:` line of every WhatsApp booking for a car at this branch**, so type it
     the way you would tell a customer.
   - **Full address (optional)** — the longer postal address shown on the home page.
   - **Google Maps link** — open Google Maps, find the office, press **Share → Copy link**, and
     paste it here. This is what the **Get Directions** button opens. Leave it blank and the
     button searches Maps for the address instead, which also works.
   - **WhatsApp number (optional)** — fill it in if bookings for this branch should reach a
     different phone; leave it blank to use the main business number.
3. Save, then assign cars to the new city: **Edit Specs** on each car → **Rents from**.

**Nothing visible changes for customers after you add your first city.** The city picker only
appears once there are **two or more** cities — with one office there is nothing to choose, and
the site looks exactly as it always did. That is deliberate, not a bug.

To stop renting from a city without losing its cars, untick **Branch is active**. The city
disappears from the customer's picker and its cars keep their branch, so you can switch it back
on later. Deleting a city that still has cars is refused, and the message tells you how many
cars are still assigned to it.

## Marking a car as booked

Use **Availability** (`/admin/availability`) for a car that is out and coming back on a known
date. Cars are the rows, days of the month are the columns.

- **Drag across the days the car is away.** A panel opens showing **Out from** and **Back on**,
  where you can fine-tune the dates and add a note if it helps you (e.g. *"Ravi — Hyderabad
  trip"*). The note is for you only; customers never see it. Click an existing block to edit or
  delete it.
- Customers then see **"Available from …"** on that car instead of "Available", with the date it
  comes back.
- **The dates mean "Out from" the first day and "Back on" the return day.** A car out from the
  5th and back on the 8th is away on the 5th, 6th and 7th, and can be rented again **on the
  8th**. So two rentals that run 5th→8th and 8th→12th sit side by side without clashing.
- **A block expires by itself.** When the return date passes, the car is simply available again —
  there is nothing to undo, and no daily chore. If the customer keeps the car longer, drag the
  block's edge to extend it.
- Blocks that overlap are refused, so you cannot accidentally promise the same car twice.

The **Available / Booked switch** on the dashboard is a different thing. Use it only when a car
is off the road with **no** return date — in the workshop, sold, papers expired. It shows
customers "Booked" and promises no date, because there isn't one. Do not use it for a normal
rental: the calendar is what tells the customer when the car comes back.

### Bookings are not stored — and that is on purpose

The website never saves a customer's booking. When a customer picks dates and taps the WhatsApp
button, those dates arrive as a **message to you**, and nothing else happens. A booking becomes
real when **you** block those dates in Availability.

That means **two customers can ask for the same car on the same dates**, and you decide who gets
it. There is no queue, no hold and no automatic conflict check. This follows directly from the
client's instruction that dates go to WhatsApp and never into the database. It is a design
decision, not a defect — a future developer should not "fix" it by building a bookings table
without asking the owner first.
