/**
 * The five world-readable endpoints (CONTRACT.md §8).
 *
 * Everything here is anonymous, CDN-cached for 60s, and shaped so the browser
 * needs exactly one request to render the whole fleet: each car embeds its
 * branch and its availability blocks, and the client filters by city and by date
 * locally. Adding `?city=` or `?from=` would fragment that one cached payload
 * into a cache entry per filter combination for a fleet of eight cars
 * (PLAN.md Amendments 1 and 2).
 *
 * Owned by P01.
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { db, getDb } from '../../db';
import { carAvailabilityBlocks, carImages, cars, locations, settings } from '../../db/schema';
import type {
  CarAvailabilityBlockRow,
  CarImageRow,
  LocationRow,
} from '../../db/schema';
import type { AppEnv } from '../lib/auth';
import { todayInIndia } from '../lib/dates';
import { notFound } from '../lib/errors';
import { toCarDTO, toLocationDTO, toSettingsDTO } from '../lib/mappers';

/**
 * The deliberate compromise from PLAN.md Phase 3: a visitor may see an owner's
 * edit up to 60s late, but `stale-while-revalidate` means nobody ever waits on a
 * cold database. Set per response rather than by middleware so it can never leak
 * onto an `/admin/*` route.
 */
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=86400';

function cached<T>(c: Context, body: T) {
  c.header('Cache-Control', PUBLIC_CACHE);
  return c.json(body);
}

function groupByCarId<T extends { carId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.carId);
    if (list) list.push(row);
    else map.set(row.carId, [row]);
  }
  return map;
}

export const publicRoutes = new Hono<AppEnv>();

/**
 * GET /api/cars -> { cars: CarDTO[] }
 *
 * Four queries and an in-memory join, not a query per car: the fleet is small
 * enough that four round trips beat both an N+1 and the row multiplication of a
 * three-way join.
 */
publicRoutes.get('/cars', async (c) => {
  const today = todayInIndia();

  const [carRows, imageRows, locationRows, blockRows] = await Promise.all([
    db.select().from(cars).orderBy(asc(cars.sortOrder), asc(cars.name)),
    db.select().from(carImages).orderBy(asc(carImages.sortOrder)),
    db.select().from(locations),
    // Expired blocks are dropped rather than shipped: no customer-facing
    // calculation can use a span that ended yesterday, and years of history in a
    // CDN-cached payload is dead weight on every visitor (CONTRACT.md §16.1.5).
    db
      .select()
      .from(carAvailabilityBlocks)
      .where(gt(carAvailabilityBlocks.endDate, today))
      .orderBy(asc(carAvailabilityBlocks.startDate)),
  ]);

  const imagesByCar = groupByCarId(imageRows as CarImageRow[]);
  const blocksByCar = groupByCarId(blockRows as CarAvailabilityBlockRow[]);
  const locationById = new Map((locationRows as LocationRow[]).map((row) => [row.id, row]));

  const payload = carRows.map((car) =>
    toCarDTO(
      car,
      imagesByCar.get(car.id) ?? [],
      car.locationId ? (locationById.get(car.locationId) ?? null) : null,
      blocksByCar.get(car.id) ?? [],
    ),
  );

  return cached(c, { cars: payload });
});

/** GET /api/cars/:id -> { car: CarDTO } · 404 if unknown. */
publicRoutes.get('/cars/:id', async (c) => {
  const id = c.req.param('id');
  const today = todayInIndia();

  const [carRow] = await db.select().from(cars).where(eq(cars.id, id)).limit(1);
  if (!carRow) throw notFound(`No car with id "${id}".`);

  const [imageRows, blockRows, locationRows] = await Promise.all([
    db.select().from(carImages).where(eq(carImages.carId, id)).orderBy(asc(carImages.sortOrder)),
    db
      .select()
      .from(carAvailabilityBlocks)
      .where(
        and(eq(carAvailabilityBlocks.carId, id), gt(carAvailabilityBlocks.endDate, today)),
      )
      .orderBy(asc(carAvailabilityBlocks.startDate)),
    carRow.locationId
      ? db.select().from(locations).where(eq(locations.id, carRow.locationId)).limit(1)
      : Promise.resolve([] as LocationRow[]),
  ]);

  return cached(c, { car: toCarDTO(carRow, imageRows, locationRows[0] ?? null, blockRows) });
});

/**
 * GET /api/locations -> { locations: LocationDTO[] } — active branches only.
 *
 * An empty array is the correct answer before the owner has created a branch.
 * Not a 404, and above all not an invented default city: `cityOptions()` renders
 * nothing for fewer than two cities, so the site looks exactly as it does today.
 */
publicRoutes.get('/locations', async (c) => {
  const rows = await db
    .select()
    .from(locations)
    .where(eq(locations.isActive, true))
    .orderBy(asc(locations.sortOrder), asc(locations.city));

  return cached(c, { locations: rows.map(toLocationDTO) });
});

/**
 * GET /api/settings -> { settings: SettingsDTO }
 *
 * A missing row is a 404 that names the fix, never fabricated defaults: an
 * invented WhatsApp number would send every customer's booking into the void and
 * nobody would notice until the owner asked why the phone stopped ringing.
 */
publicRoutes.get('/settings', async (c) => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row) {
    throw notFound('Settings have not been seeded yet. Run `npm run seed:settings`.');
  }
  return cached(c, { settings: toSettingsDTO(row) });
});

/**
 * GET /api/health -> { ok: true, db: boolean }
 *
 * P00's behaviour, preserved: `db` is a real round-trip, and a missing or wrong
 * DATABASE_URL must report `db: false` rather than 500. This is how every later
 * wave answers "is my environment wired up?".
 */
publicRoutes.get('/health', async (c) => {
  let dbOk = false;
  try {
    await getDb().execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return cached(c, { ok: true, db: dbOk });
});