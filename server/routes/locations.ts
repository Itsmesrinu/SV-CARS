/**
 * Branches — the multi-city amendment (CONTRACT.md §15, PLAN.md Amendment 1).
 *
 * The owner enters a city, an office address in plain text and a map link; each
 * car points at one branch. Nothing about a place stays hardcoded in `src/`
 * after this, which is the entire point of the table.
 *
 * Owned by P01.
 */

import { asc, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { cars, locations } from '../../db/schema.js';
import type { AppEnv } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { toLocationDTO } from '../lib/mappers.js';
import { definedOnly, nextLocationSortOrder } from '../lib/queries.js';
import { slugify, uniqueSlug } from '../lib/slug.js';
import {
  nonEmptyString,
  nonNegativeInt,
  normalisePhone,
  nullableHttpUrl,
  nullableText,
  nullableWhatsappPhone,
  parseBody,
} from '../lib/validate.js';

/**
 * The branch phone reaches `wa.me/<phone>` untouched, so whatever the owner
 * pasted becomes digits here. Kept as an explicit step rather than a zod
 * transform — see the note on `whatsappPhone` in server/lib/validate.ts.
 */
function normalisedPhone<T extends { whatsappPhone?: string | null }>(input: T): T {
  return typeof input.whatsappPhone === 'string'
    ? { ...input, whatsappPhone: normalisePhone(input.whatsappPhone) }
    : input;
}

const locationFields = {
  city: nonEmptyString.optional(),
  officeName: nullableText.optional(),
  /**
   * The highest-consequence field in the table: it becomes the `Pickup:` line of
   * every WhatsApp booking for a car at this branch, so an empty one silently
   * breaks bookings rather than showing an obvious gap.
   */
  addressShort: nonEmptyString.optional(),
  addressFull: nullableText.optional(),
  /** Pasted by the owner and rendered into an `href` — scheme-checked (§15.3). */
  directionsUrl: nullableHttpUrl.optional(),
  whatsappPhone: nullableWhatsappPhone.optional(),
  isActive: z.boolean().optional(),
  sortOrder: nonNegativeInt.optional(),
};

const createLocationSchema = z.object({
  ...locationFields,
  id: z.string().trim().min(1, 'is required').optional(),
  city: nonEmptyString,
  addressShort: nonEmptyString,
});

/** `id` is stripped from patches: the slug is a filter value the customer's URL carries. */
const updateLocationSchema = z.object(locationFields);

async function locationExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  return Boolean(row);
}

async function carsAtLocation(id: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(cars).where(eq(cars.locationId, id));
  return row?.value ?? 0;
}

export const locationRoutes = new Hono<AppEnv>();

/**
 * GET /api/admin/locations -> { locations: LocationDTO[] } — **including inactive**.
 *
 * The public `GET /api/locations` filters to active; this one must not, or the
 * owner could switch a city off and then have no way to switch it back on.
 */
locationRoutes.get('/locations', async (c) => {
  const rows = await db
    .select()
    .from(locations)
    .orderBy(asc(locations.sortOrder), asc(locations.city));
  return c.json({ locations: rows.map(toLocationDTO) });
});

/** POST /api/admin/locations — `LocationInput` (id optional) -> { location }. */
locationRoutes.post('/locations', async (c) => {
  const input = normalisedPhone(await parseBody(c, createLocationSchema));

  let id: string;
  if (input.id) {
    if (await locationExists(input.id)) {
      throw conflict(`A branch with id "${input.id}" already exists.`);
    }
    id = input.id;
  } else {
    // A second office in Kadapa becomes `kadapa-2` — the same rule cars use.
    id = await uniqueSlug(slugify(input.city), locationExists);
  }

  const { id: _ignored, sortOrder, ...rest } = input;
  const [row] = await db
    .insert(locations)
    .values({
      ...definedOnly(rest),
      id,
      city: input.city,
      addressShort: input.addressShort,
      sortOrder: sortOrder ?? (await nextLocationSortOrder()),
    })
    .returning();

  return c.json({ location: toLocationDTO(row) });
});

/** PATCH /api/admin/locations/:id — partial -> { location } · 404 if unknown. */
locationRoutes.patch('/locations/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await locationExists(id))) throw notFound(`No branch with id "${id}".`);

  const input = normalisedPhone(await parseBody(c, updateLocationSchema));
  const patch = definedOnly(input);

  if (Object.keys(patch).length > 0) {
    await db
      .update(locations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(locations.id, id));
  }

  const [row] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  if (!row) throw notFound(`No branch with id "${id}".`);
  return c.json({ location: toLocationDTO(row) });
});

/**
 * DELETE /api/admin/locations/:id -> { ok: true } · 409 while cars still point here.
 *
 * The guard is deliberate (CONTRACT.md §8). `cars.locationId` is `on delete set
 * null`, so an unguarded delete would quietly strip the branch off every car
 * that used it and those cars would then vanish from every city-filtered view
 * with nothing on screen to explain why. The count in the message is what lets
 * P04 say "3 cars are still assigned to this branch".
 *
 * `?force=true` is the owner saying it anyway: the cars are reassigned to no
 * branch and fall back to `settings.pickupAddress` (§15.5).
 */
locationRoutes.delete('/locations/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await locationExists(id))) throw notFound(`No branch with id "${id}".`);

  const force = c.req.query('force') === 'true';
  const assigned = await carsAtLocation(id);

  if (assigned > 0 && !force) {
    throw conflict(
      `${assigned} ${assigned === 1 ? 'car is' : 'cars are'} still assigned to this branch. ` +
        'Reassign them, deactivate the branch instead, or repeat with ?force=true.',
    );
  }

  if (assigned > 0) {
    // Explicit rather than leaning on `on delete set null`, so the intent is
    // readable at the call site and the two writes are adjacent.
    await db.update(cars).set({ locationId: null, updatedAt: new Date() }).where(eq(cars.locationId, id));
  }

  await db.delete(locations).where(eq(locations.id, id));
  return c.json({ ok: true as const });
});