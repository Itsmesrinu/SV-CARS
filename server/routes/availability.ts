/**
 * Availability blocks — the owner's calendar (CONTRACT.md §16, Amendment 2).
 *
 * What is stored here is the OWNER's statement about HIS cars. A customer's
 * booking is never persisted anywhere: it travels to him over WhatsApp and
 * becomes real when he blocks the dates himself. So there is no bookings table,
 * no hold, no reservation and no confirmation — five endpoints over one table.
 *
 * Every comparison in this file is half-open, `[startDate, endDate)`:
 *   - out `05→08` means out on the 5th, 6th and 7th and BACK on the 8th;
 *   - `05→08` and `08→12` are legal neighbours, not an overlap;
 *   - overlap is `aStart < bEnd && bStart < aEnd`, strict on both sides.
 * A `<=` anywhere here rejects every back-to-back rental the owner records.
 *
 * The server deliberately computes **no** availability: no `isAvailable` boolean
 * leaves this file. The client derives status through `carAvailability()` from
 * the shared helper so the admin panel, the fleet page and the detail page
 * cannot disagree. Our job is to store and return spans.
 *
 * Owned by P01.
 */

import { and, asc, eq, gt, lt, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { carAvailabilityBlocks } from '../../db/schema.js';
import type { CarAvailabilityBlockRow } from '../../db/schema.js';
import type { AppEnv } from '../lib/auth.js';
import { diffDays, isValidDate, startOfMonthInIndia, startOfNextMonth } from '../lib/dates.js';
import { conflict, notFound, validationFailed } from '../lib/errors.js';
import { toAvailabilityBlockDTO } from '../lib/mappers.js';
import { carExists } from '../lib/queries.js';
import { dateString, isUuid, parseBody } from '../lib/validate.js';

/** ~1 year. Beyond that the month grid is not what is being asked for. */
const MAX_WINDOW_DAYS = 366;

const noteField = z
  .string()
  .trim()
  .max(200, 'must be 200 characters or fewer')
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

const createBlockSchema = z.object({
  startDate: dateString,
  endDate: dateString,
  note: noteField,
});

const updateBlockSchema = z.object({
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  note: noteField,
});

/**
 * `endDate > startDate`, strictly.
 *
 * Equal dates are rejected because a zero-length block means nothing: a one-day
 * block is `05→06`, since the end is the day the car is back.
 */
function assertOrder(startDate: string, endDate: string): void {
  if (endDate <= startDate) {
    throw validationFailed(
      `endDate: must be after startDate — a one-day block ends the next day (${startDate} → ${endDate}).`,
    );
  }
}

/**
 * The conflicting block, if any.
 *
 * `excludeId` is what makes PATCH work: without it every edit collides with the
 * row being edited and the owner can never adjust a date.
 */
async function findOverlap(
  carId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<CarAvailabilityBlockRow | null> {
  const [row] = await db
    .select()
    .from(carAvailabilityBlocks)
    .where(
      and(
        eq(carAvailabilityBlocks.carId, carId),
        lt(carAvailabilityBlocks.startDate, endDate),
        gt(carAvailabilityBlocks.endDate, startDate),
        excludeId ? ne(carAvailabilityBlocks.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Overlap is a 409 with the offending dates, never a silent merge. */
function assertNoOverlap(existing: CarAvailabilityBlockRow | null): void {
  if (existing) {
    throw conflict(`Already blocked ${existing.startDate} → ${existing.endDate}.`);
  }
}

export const availabilityRoutes = new Hono<AppEnv>();

/**
 * GET /api/admin/availability?from=&to= -> { blocks: AvailabilityBlockDTO[] }
 *
 * Every block of the WHOLE FLEET overlapping `[from, to)`, in one request. P09's
 * month grid renders 8+ cars × 31 days from this and must never fan out to one
 * request per car. Absent params default to the current month in IST.
 */
availabilityRoutes.get('/availability', async (c) => {
  const fromParam = c.req.query('from');
  const toParam = c.req.query('to');

  const from = fromParam ?? startOfMonthInIndia();
  const to = toParam ?? startOfNextMonth(from);

  if (!isValidDate(from)) throw validationFailed("from: must be a real date in 'YYYY-MM-DD' form.");
  if (!isValidDate(to)) throw validationFailed("to: must be a real date in 'YYYY-MM-DD' form.");
  if (to <= from) throw validationFailed('to: must be after from.');
  if (diffDays(from, to) > MAX_WINDOW_DAYS) {
    throw validationFailed(`to: the window may not exceed ${MAX_WINDOW_DAYS} days.`);
  }

  const rows = await db
    .select()
    .from(carAvailabilityBlocks)
    .where(
      and(
        lt(carAvailabilityBlocks.startDate, to),
        gt(carAvailabilityBlocks.endDate, from),
      ),
    )
    .orderBy(asc(carAvailabilityBlocks.carId), asc(carAvailabilityBlocks.startDate));

  return c.json({ blocks: rows.map(toAvailabilityBlockDTO) });
});

/**
 * GET /api/admin/cars/:id/availability -> { blocks } · 404 if the car is unknown.
 *
 * Unlike the public payload this returns past blocks too: the owner's record of
 * where a car has been is his, and the admin car screen shows history.
 */
availabilityRoutes.get('/cars/:id/availability', async (c) => {
  const carId = c.req.param('id');
  if (!(await carExists(carId))) throw notFound(`No car with id "${carId}".`);

  const rows = await db
    .select()
    .from(carAvailabilityBlocks)
    .where(eq(carAvailabilityBlocks.carId, carId))
    .orderBy(asc(carAvailabilityBlocks.startDate));

  return c.json({ blocks: rows.map(toAvailabilityBlockDTO) });
});

/**
 * POST /api/admin/cars/:id/availability — { startDate, endDate, note? } -> { block }
 *
 * A block may start in the past: the owner correcting last week's record is a
 * normal Tuesday, and forcing `startDate >= today` would make that impossible.
 */
availabilityRoutes.post('/cars/:id/availability', async (c) => {
  const carId = c.req.param('id');
  if (!(await carExists(carId))) throw notFound(`No car with id "${carId}".`);

  const input = await parseBody(c, createBlockSchema);
  assertOrder(input.startDate, input.endDate);
  assertNoOverlap(await findOverlap(carId, input.startDate, input.endDate));

  const [row] = await db
    .insert(carAvailabilityBlocks)
    .values({
      carId,
      startDate: input.startDate,
      endDate: input.endDate,
      note: input.note ?? null,
    })
    .returning();

  return c.json({ block: toAvailabilityBlockDTO(row) });
});

/**
 * PATCH /api/admin/availability/:blockId — partial -> { block } · 409 on overlap.
 *
 * The overlap check runs against the *other* blocks of the same car, with this
 * row excluded — see `findOverlap`.
 */
availabilityRoutes.patch('/availability/:blockId', async (c) => {
  const blockId = c.req.param('blockId');
  if (!isUuid(blockId)) throw notFound(`No availability block with id "${blockId}".`);

  const [existing] = await db
    .select()
    .from(carAvailabilityBlocks)
    .where(eq(carAvailabilityBlocks.id, blockId))
    .limit(1);
  if (!existing) throw notFound(`No availability block with id "${blockId}".`);

  const input = await parseBody(c, updateBlockSchema);

  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  assertOrder(startDate, endDate);
  assertNoOverlap(await findOverlap(existing.carId, startDate, endDate, blockId));

  const [row] = await db
    .update(carAvailabilityBlocks)
    .set({
      startDate,
      endDate,
      ...(input.note !== undefined ? { note: input.note } : {}),
      updatedAt: new Date(),
    })
    .where(eq(carAvailabilityBlocks.id, blockId))
    .returning();

  return c.json({ block: toAvailabilityBlockDTO(row) });
});

/**
 * DELETE /api/admin/availability/:blockId -> { ok: true }
 *
 * No guard: deleting a block only ever frees a car up.
 */
availabilityRoutes.delete('/availability/:blockId', async (c) => {
  const blockId = c.req.param('blockId');
  if (!isUuid(blockId)) throw notFound(`No availability block with id "${blockId}".`);

  const [existing] = await db
    .select({ id: carAvailabilityBlocks.id })
    .from(carAvailabilityBlocks)
    .where(eq(carAvailabilityBlocks.id, blockId))
    .limit(1);
  if (!existing) throw notFound(`No availability block with id "${blockId}".`);

  await db.delete(carAvailabilityBlocks).where(eq(carAvailabilityBlocks.id, blockId));
  return c.json({ ok: true as const });
});