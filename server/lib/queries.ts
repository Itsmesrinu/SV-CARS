/**
 * Small shared reads used by more than one route file.
 *
 * `loadCarDTO` in particular is the single way a car leaves this server, so
 * `POST /admin/cars`, `PATCH /admin/cars/:id`, and every image and availability
 * write that returns a car all produce byte-identical shapes.
 *
 * Owned by P01.
 */

import { and, asc, eq, gt, max } from 'drizzle-orm';
import { db } from '../../db';
import { carAvailabilityBlocks, carImages, cars, locations } from '../../db/schema';
import type { CarDTO } from '../../src/types/api';
import { todayInIndia } from './dates';
import { toCarDTO } from './mappers';

/**
 * Assembles one car exactly as `GET /api/cars/:id` does — including dropping
 * blocks that ended before today, so an admin response and a public response
 * never disagree about a car's calendar.
 */
export async function loadCarDTO(id: string): Promise<CarDTO | null> {
  const [carRow] = await db.select().from(cars).where(eq(cars.id, id)).limit(1);
  if (!carRow) return null;

  const today = todayInIndia();

  const [imageRows, blockRows, locationRows] = await Promise.all([
    db.select().from(carImages).where(eq(carImages.carId, id)).orderBy(asc(carImages.sortOrder)),
    db
      .select()
      .from(carAvailabilityBlocks)
      .where(and(eq(carAvailabilityBlocks.carId, id), gt(carAvailabilityBlocks.endDate, today)))
      .orderBy(asc(carAvailabilityBlocks.startDate)),
    carRow.locationId
      ? db.select().from(locations).where(eq(locations.id, carRow.locationId)).limit(1)
      : Promise.resolve([]),
  ]);

  return toCarDTO(carRow, imageRows, locationRows[0] ?? null, blockRows);
}

export async function carExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: cars.id }).from(cars).where(eq(cars.id, id)).limit(1);
  return Boolean(row);
}

export async function locationExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  return Boolean(row);
}

/**
 * `max(sortOrder) + 1` — new rows land at the end of the list.
 *
 * A new car appearing at the top of the fleet page would silently demote the one
 * the owner deliberately put first.
 */
export async function nextCarSortOrder(): Promise<number> {
  const [row] = await db.select({ value: max(cars.sortOrder) }).from(cars);
  return (row?.value ?? -1) + 1;
}

export async function nextLocationSortOrder(): Promise<number> {
  const [row] = await db.select({ value: max(locations.sortOrder) }).from(locations);
  return (row?.value ?? -1) + 1;
}

export async function nextImageSortOrder(carId: string): Promise<number> {
  const [row] = await db
    .select({ value: max(carImages.sortOrder) })
    .from(carImages)
    .where(eq(carImages.carId, carId));
  return (row?.value ?? -1) + 1;
}

/**
 * Drops keys whose value is `undefined`, keeping explicit `null`s.
 *
 * This is what makes "absent" and "explicitly null" different in a PATCH: an
 * absent `driverPricePerDay` leaves the column alone, a `null` one clears the
 * override so the car inherits the settings default again (CONTRACT.md §4).
 */
export function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}