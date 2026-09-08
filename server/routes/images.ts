/**
 * Car images and Cloudinary upload signing (CONTRACT.md §8).
 *
 * The browser uploads the file straight to Cloudinary and then tells us where it
 * landed; this API never sees the bytes. Vercel caps a function request body at
 * ~4.5 MB and a photo off a current phone clears that on its own, so proxying
 * uploads through the function would fail outright on the owner's real camera
 * roll.
 *
 * Owned by P01.
 */

import { and, asc, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { carImages } from '../../db/schema.js';
import type { AppEnv } from '../lib/auth.js';
import { CLOUDINARY_FOLDER_ROOT, destroyAsset, signUpload } from '../lib/cloudinary.js';
import { notFound, validationFailed } from '../lib/errors.js';
import { carExists, nextImageSortOrder } from '../lib/queries.js';
import { slugify } from '../lib/slug.js';
import { toCarImageDTO } from '../lib/mappers.js';
import { isUuid, nonEmptyString, parseBody } from '../lib/validate.js';

const imageKind = z.enum(['main', 'front', 'side', 'inside', 'back', 'other']);

const signSchema = z.object({
  // Optional: a car photo signs into 'sv-cars/<carId>'; omitting carId signs a
  // site-level asset (the homepage hero) into 'sv-cars/site'.
  carId: nonEmptyString.optional(),
  filename: nonEmptyString,
});

const addImageSchema = z.object({
  publicId: nonEmptyString,
  width: z.number().int('must be a whole number').min(1, 'must be at least 1 pixel'),
  height: z.number().int('must be a whole number').min(1, 'must be at least 1 pixel'),
  /**
   * The LQIP is rendered as an image source, so it is checked as a data:image
   * URL rather than accepted as free text — the one place a browser-supplied
   * string reaches an `src` attribute.
   */
  blurDataUrl: z
    .string()
    .refine((value) => value.startsWith('data:image/'), {
      message: 'must be a data:image/... URL',
    })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  kind: imageKind.optional(),
  alt: z.string().trim().nullable().optional(),
});

const reorderSchema = z.object({
  order: z.array(nonEmptyString),
});

const updateImageSchema = z.object({
  isPrimary: z.boolean().optional(),
  kind: imageKind.optional(),
  alt: z.string().trim().nullable().optional(),
});

/** 8 hex characters — enough that two uploads of `IMG_1234.jpg` never collide. */
function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

export const imageRoutes = new Hono<AppEnv>();

/**
 * POST /api/admin/uploads/sign — { carId, filename }
 *   -> { cloudName, apiKey, timestamp, signature, folder, publicId }
 *
 * The browser must then send **exactly** `folder`, `public_id: publicId`,
 * `timestamp`, `api_key` and `signature` with the file. The signature covers
 * `timestamp`, `folder` and `public_id` and nothing else: signing fewer
 * parameters than the upload carries would leave the rest free to alter, and
 * signing more simply fails to verify.
 *
 * Cloudinary stores the asset as `<folder>/<publicId>`, and that combined string
 * is what comes back in the upload response and what must be POSTed to
 * `/admin/cars/:id/images` — see server/README.md.
 */
imageRoutes.post('/uploads/sign', async (c) => {
  const { carId, filename } = await parseBody(c, signSchema);

  // No scattering assets into folders for cars that don't exist. A hero upload
  // (no carId) lands in the shared 'site' folder instead.
  if (carId && !(await carExists(carId))) throw notFound(`No car with id "${carId}".`);

  const base = slugify(filename.replace(/\.[^./\\]+$/, '')) || 'image';
  const signed = signUpload({
    timestamp: Math.round(Date.now() / 1000),
    folder: `${CLOUDINARY_FOLDER_ROOT}/${carId ?? 'site'}`,
    // The random suffix is what makes re-uploading `main_front_1.webp` create a
    // second asset instead of overwriting the first — and what lets the CDN treat
    // every delivery URL as immutable.
    public_id: `${base}-${randomSuffix()}`,
  });

  return c.json({
    cloudName: signed.cloudName,
    apiKey: signed.apiKey,
    timestamp: signed.timestamp,
    signature: signed.signature,
    folder: signed.folder,
    publicId: signed.public_id,
  });
});

/**
 * POST /api/admin/cars/:id/images — persists an upload that already succeeded.
 *
 * The first image of a car becomes primary automatically: without that, a
 * freshly-created car renders with a blank card until the owner notices there is
 * a star to click.
 */
imageRoutes.post('/cars/:id/images', async (c) => {
  const carId = c.req.param('id');
  if (!(await carExists(carId))) throw notFound(`No car with id "${carId}".`);

  const input = await parseBody(c, addImageSchema);

  const existing = await db
    .select({ id: carImages.id })
    .from(carImages)
    .where(eq(carImages.carId, carId));

  const [row] = await db
    .insert(carImages)
    .values({
      carId,
      publicId: input.publicId,
      width: input.width,
      height: input.height,
      blurDataUrl: input.blurDataUrl,
      kind: input.kind ?? 'other',
      alt: input.alt ?? null,
      sortOrder: await nextImageSortOrder(carId),
      isPrimary: existing.length === 0,
    })
    .returning();

  return c.json({ image: toCarImageDTO(row) });
});

/**
 * PATCH /api/admin/cars/:id/images/reorder — { order: string[] } -> { images }
 *
 * `(carId, sortOrder)` is UNIQUE, so the obvious loop — write each image's new
 * position in turn — trips the index the moment two images swap places: the
 * first write lands on a position the second image still holds.
 *
 * So this runs in two phases inside ONE transaction: every image first moves to
 * a negative position (unique among themselves, and no real row is ever
 * negative), then to its final 0..n-1. No intermediate state has a duplicate.
 *
 * The transaction is `db.batch()` and not `db.transaction()` on purpose — the
 * neon-http driver has no interactive transactions, but `batch()` ships the
 * whole list to Neon as a single atomic request, which is exactly what is needed
 * here since none of these statements depends on another's result.
 */
imageRoutes.patch('/cars/:id/images/reorder', async (c) => {
  const carId = c.req.param('id');
  if (!(await carExists(carId))) throw notFound(`No car with id "${carId}".`);

  const { order } = await parseBody(c, reorderSchema);

  const rows = await db
    .select({ id: carImages.id })
    .from(carImages)
    .where(eq(carImages.carId, carId));

  const owned = new Set(rows.map((row) => row.id));
  const requested = new Set(order);

  if (requested.size !== order.length) {
    throw validationFailed('order: contains the same image id twice.');
  }
  if (order.length !== owned.size || order.some((id) => !owned.has(id))) {
    throw validationFailed(
      `order: must list every image of this car exactly once (expected ${owned.size} ids).`,
    );
  }

  if (order.length > 0) {
    const toNegative = order.map((id, index) =>
      db
        .update(carImages)
        .set({ sortOrder: -(index + 1) })
        .where(eq(carImages.id, id)),
    );
    const toFinal = order.map((id, index) =>
      db.update(carImages).set({ sortOrder: index }).where(eq(carImages.id, id)),
    );

    await db.batch(
      [...toNegative, ...toFinal] as unknown as Parameters<typeof db.batch>[0],
    );
  }

  const updated = await db
    .select()
    .from(carImages)
    .where(eq(carImages.carId, carId))
    .orderBy(asc(carImages.sortOrder));

  return c.json({ images: updated.map(toCarImageDTO) });
});

/**
 * PATCH /api/admin/images/:imageId — { isPrimary?, kind?, alt? }
 *
 * "Primary" is a property of the car, not of the image: promoting one must demote
 * the others, and both writes go in one transaction so the car can never end up
 * with two primaries or none.
 */
imageRoutes.patch('/images/:imageId', async (c) => {
  const imageId = c.req.param('imageId');
  if (!isUuid(imageId)) throw notFound(`No image with id "${imageId}".`);

  const [existing] = await db.select().from(carImages).where(eq(carImages.id, imageId)).limit(1);
  if (!existing) throw notFound(`No image with id "${imageId}".`);

  const input = await parseBody(c, updateImageSchema);

  const patch: Partial<typeof carImages.$inferInsert> = {};
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.alt !== undefined) patch.alt = input.alt;
  if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;

  if (Object.keys(patch).length > 0) {
    if (input.isPrimary === true) {
      await db.batch([
        db
          .update(carImages)
          .set({ isPrimary: false })
          .where(and(eq(carImages.carId, existing.carId), ne(carImages.id, imageId))),
        db.update(carImages).set(patch).where(eq(carImages.id, imageId)),
      ]);
    } else {
      await db.update(carImages).set(patch).where(eq(carImages.id, imageId));
    }
  }

  const [row] = await db.select().from(carImages).where(eq(carImages.id, imageId)).limit(1);
  if (!row) throw notFound(`No image with id "${imageId}".`);
  return c.json({ image: toCarImageDTO(row) });
});

/**
 * DELETE /api/admin/images/:imageId -> { ok: true }
 *
 * Deleting the primary image promotes the next one by `sortOrder`, so the fleet
 * card never goes blank behind the owner's back. The Cloudinary asset goes too,
 * best-effort: a failed destroy is logged as an orphan and does not fail the
 * delete the owner asked for.
 */
imageRoutes.delete('/images/:imageId', async (c) => {
  const imageId = c.req.param('imageId');
  if (!isUuid(imageId)) throw notFound(`No image with id "${imageId}".`);

  const [existing] = await db.select().from(carImages).where(eq(carImages.id, imageId)).limit(1);
  if (!existing) throw notFound(`No image with id "${imageId}".`);

  await db.delete(carImages).where(eq(carImages.id, imageId));
  await destroyAsset(existing.publicId);

  if (existing.isPrimary) {
    const [next] = await db
      .select({ id: carImages.id })
      .from(carImages)
      .where(eq(carImages.carId, existing.carId))
      .orderBy(asc(carImages.sortOrder))
      .limit(1);
    if (next) {
      await db.update(carImages).set({ isPrimary: true }).where(eq(carImages.id, next.id));
    }
  }

  return c.json({ ok: true as const });
});