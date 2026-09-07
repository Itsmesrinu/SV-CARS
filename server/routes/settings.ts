/**
 * `PUT /admin/settings` — the single settings row (CONTRACT.md §8).
 *
 * Since the multi-city amendment these values are the **fallbacks**: a car with
 * no branch, or a branch with no phone of its own, books through
 * `settings.whatsappPhone` and `settings.pickupAddress` (§15.5). Still required,
 * still validated — just no longer the only source.
 *
 * Owned by P01.
 */

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { settings } from '../../db/schema';
import type { AppEnv } from '../lib/auth';
import { destroyAsset } from '../lib/cloudinary';
import { notFound } from '../lib/errors';
import { toSettingsDTO } from '../lib/mappers';
import {
  money,
  nonEmptyString,
  nonNegativeInt,
  normalisePhone,
  parseBody,
  whatsappPhone,
} from '../lib/validate';

const settingsSchema = z.object({
  /**
   * Digits only including the country code. `src/lib/booking.ts` interpolates
   * this straight into `wa.me/<phone>`, so a stored '+91 97042 01247' produces a
   * link that opens WhatsApp on nothing at all — and nobody finds out until the
   * owner asks why the phone stopped ringing.
   */
  whatsappPhone,
  pickupAddress: nonEmptyString,
  defaultDriverPricePerDay: money,
  defaultKmLimitPerDay: nonNegativeInt,
  defaultExtraKmCharge: money,
});

export const settingsRoutes = new Hono<AppEnv>();

/**
 * PUT /api/admin/settings — full replace -> { settings: SettingsDTO }
 *
 * An upsert rather than an update: the row may not exist yet on a fresh
 * database, and the owner saving the settings form is a perfectly good way to
 * create it. `id: 1` is fixed by the table's single-row check constraint.
 */
settingsRoutes.put('/settings', async (c) => {
  const parsed = await parseBody(c, settingsSchema);
  // What lands in the column is always `wa.me`-safe digits, whatever the owner pasted.
  const input = { ...parsed, whatsappPhone: normalisePhone(parsed.whatsappPhone) };

  await db
    .insert(settings)
    .values({ id: 1, ...input })
    .onConflictDoUpdate({
      target: settings.id,
      set: { ...input, updatedAt: new Date() },
    });

  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return c.json({ settings: toSettingsDTO(row) });
});

/**
 * The homepage hero image — a single admin-managed photo. Upload signs into the
 * shared 'sv-cars/site' folder (see uploads/sign), the browser pushes the bytes
 * to Cloudinary, then PUTs the resulting metadata here. There is only ever one:
 * replacing it destroys the previous asset, and there is no "add second".
 */
const heroSchema = z.object({
  publicId: nonEmptyString,
  width: z.number().int('must be a whole number').min(1, 'must be at least 1 pixel'),
  height: z.number().int('must be a whole number').min(1, 'must be at least 1 pixel'),
  // Same data:image guard the car-image route uses — this string reaches an `src`.
  blurDataUrl: z
    .string()
    .refine((value) => value.startsWith('data:image/'), { message: 'must be a data:image/... URL' })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

/** PUT /api/admin/settings/hero — set/replace the hero -> { settings: SettingsDTO } */
settingsRoutes.put('/settings/hero', async (c) => {
  const input = await parseBody(c, heroSchema);

  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  // The row carries required columns (phone, address) that a hero-only insert
  // can't supply, so settings must be seeded before a hero can be attached.
  if (!row) throw notFound('Settings have not been initialised yet.');

  const previous = row.heroPublicId;
  await db
    .update(settings)
    .set({
      heroPublicId: input.publicId,
      heroWidth: input.width,
      heroHeight: input.height,
      heroBlurDataUrl: input.blurDataUrl,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));

  // Best-effort cleanup of the photo we just replaced; never blocks the response.
  if (previous && previous !== input.publicId) await destroyAsset(previous);

  const [updated] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return c.json({ settings: toSettingsDTO(updated) });
});

/** DELETE /api/admin/settings/hero — clear the hero -> { settings: SettingsDTO } */
settingsRoutes.delete('/settings/hero', async (c) => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row) throw notFound('Settings have not been initialised yet.');

  const previous = row.heroPublicId;
  await db
    .update(settings)
    .set({
      heroPublicId: null,
      heroWidth: null,
      heroHeight: null,
      heroBlurDataUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1));

  if (previous) await destroyAsset(previous);

  const [updated] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return c.json({ settings: toSettingsDTO(updated) });
});