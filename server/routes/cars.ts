/**
 * Admin car CRUD — `POST /admin/cars`, `PATCH /admin/cars/:id`,
 * `DELETE /admin/cars/:id` (CONTRACT.md §8).
 *
 * Two rules shape every schema here:
 *  - **Never invent data.** Nullable columns stay null. `carType` does not
 *    default to 'SUV' and `year` does not default to this year to make a
 *    response look complete — the owner fills those in when he knows them.
 *  - **`pricePerDay: 0` is valid**, not a validation failure. It is the
 *    legitimate "price not set yet" state the whole seeding strategy leans on.
 *
 * Owned by P01.
 */

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { carImages, cars } from '../../db/schema';
import type { AppEnv } from '../lib/auth';
import { destroyAssets } from '../lib/cloudinary';
import { conflict, notFound, validationFailed } from '../lib/errors';
import {
  carExists,
  definedOnly,
  loadCarDTO,
  locationExists,
  nextCarSortOrder,
} from '../lib/queries';
import { slugify, uniqueSlug } from '../lib/slug';
import { money, nonEmptyString, nonNegativeInt, nullableText, parseBody } from '../lib/validate';

/**
 * Every writable column, all optional so the same object can back both create
 * and patch. `name` is re-required on create below.
 *
 * Absent means "leave it alone" (patch) or "take the column default" (create);
 * an explicit `null` means "clear it". `definedOnly()` is what keeps those two
 * apart once zod has run.
 */
const carFields = {
  name: nonEmptyString.optional(),
  carType: nullableText.optional(),
  seating: z.number().int('must be a whole number').min(1, 'must be at least 1').max(60, 'must be 60 or fewer').nullable().optional(),
  fuel: nullableText.optional(),
  transmission: nullableText.optional(),
  year: z.number().int('must be a whole number').min(1980, 'must be 1980 or later').max(2100, 'must be 2100 or earlier').nullable().optional(),
  description: nullableText.optional(),
  pricePerDay: money.optional(),
  driverPricePerDay: money.nullable().optional(),
  kmLimitPerDay: nonNegativeInt.nullable().optional(),
  extraKmCharge: money.nullable().optional(),
  selfDrive: z.boolean().optional(),
  withDriver: z.boolean().optional(),
  availability: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
  /** Nullable on purpose: "no branch assigned yet" is a legitimate state (§15.5). */
  locationId: z.string().trim().min(1, 'must be a branch id or null').nullable().optional(),
  tags: z.array(nonEmptyString).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: nonNegativeInt.optional(),
};

const createCarSchema = z.object({
  ...carFields,
  id: z.string().trim().min(1, 'is required').optional(),
  name: nonEmptyString,
});

/**
 * `id` is deliberately absent from the patch schema and silently stripped.
 *
 * `/car/:id` slugs are public URLs that customers already have in WhatsApp
 * threads; renaming one through a partial update would 404 those links with no
 * redirect behind it.
 */
const updateCarSchema = z.object(carFields);

/**
 * A non-null `locationId` that doesn't exist is a `422`, not a raw Postgres
 * foreign-key error. The owner gets "unknown branch", not
 * `insert or update on table "cars" violates foreign key constraint`.
 */
async function assertLocation(locationId: string | null | undefined): Promise<void> {
  if (!locationId) return;
  if (!(await locationExists(locationId))) {
    throw validationFailed(`locationId: no branch with id "${locationId}".`);
  }
}

export const carRoutes = new Hono<AppEnv>();

/** POST /api/admin/cars — `CarInput` (id optional) -> { car: CarDTO }. */
carRoutes.post('/cars', async (c) => {
  const input = await parseBody(c, createCarSchema);
  await assertLocation(input.locationId);

  let id: string;
  if (input.id) {
    // An explicitly-supplied id that is taken is a conflict, not a silent rename:
    // the caller asked for that exact URL.
    if (await carExists(input.id)) throw conflict(`A car with id "${input.id}" already exists.`);
    id = input.id;
  } else {
    id = await uniqueSlug(slugify(input.name), carExists);
  }

  const { id: _ignored, sortOrder, ...rest } = input;
  const [row] = await db
    .insert(cars)
    .values({
      ...definedOnly(rest),
      id,
      name: input.name,
      sortOrder: sortOrder ?? (await nextCarSortOrder()),
    })
    .returning();

  const car = await loadCarDTO(row.id);
  if (!car) throw notFound(`No car with id "${row.id}".`);
  return c.json({ car });
});

/** PATCH /api/admin/cars/:id — `Partial<CarInput>` -> { car: CarDTO } · 404 if unknown. */
carRoutes.patch('/cars/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await carExists(id))) throw notFound(`No car with id "${id}".`);

  const input = await parseBody(c, updateCarSchema);
  await assertLocation(input.locationId);

  const patch = definedOnly(input);
  if (Object.keys(patch).length > 0) {
    // `updatedAt` is set explicitly as well as by the schema's $onUpdate hook —
    // belt and braces, because "when did this last change?" is what the owner
    // sorts by when something looks wrong.
    await db
      .update(cars)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(cars.id, id));
  }

  const car = await loadCarDTO(id);
  if (!car) throw notFound(`No car with id "${id}".`);
  return c.json({ car });
});

/**
 * DELETE /api/admin/cars/:id -> { ok: true }
 *
 * `car_images` rows cascade in the database; the Cloudinary assets do not, so we
 * destroy them here or they bill the free tier forever. Cleanup runs after the
 * row is gone and can never fail the request — an owner who cannot delete a car
 * because Cloudinary is having an afternoon is a worse outcome than an orphaned
 * asset, which is logged.
 */
carRoutes.delete('/cars/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await carExists(id))) throw notFound(`No car with id "${id}".`);

  const imageRows = await db
    .select({ publicId: carImages.publicId })
    .from(carImages)
    .where(eq(carImages.carId, id));

  await db.delete(cars).where(eq(cars.id, id));
  await destroyAssets(imageRows.map((row) => row.publicId));

  return c.json({ ok: true as const });
});