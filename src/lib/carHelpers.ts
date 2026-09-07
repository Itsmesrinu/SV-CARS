/**
 * Car helpers shared by the admin panel (P04) and the public pages (P05).
 *
 * Owned by P00, read-only for every other session (CONTRACT.md §4).
 *
 * These exist so the old→new field mapping (CONTRACT.md §3.1) and the
 * per-car-overrides-settings fallback happen in exactly one place. The magic
 * numbers they replace — `driverRate = 1000`, `'100 km/day'`, `'₹50/km'` —
 * were duplicated across four files before this.
 */

import type { CarDTO, CarImageDTO, LocationDTO, SettingsDTO } from '@/src/types/api';
import { citySlug } from './locationHelpers';

/** First image flagged isPrimary, else the lowest sortOrder, else null. */
export function primaryImage(car: CarDTO): CarImageDTO | null {
  const images = car.images ?? [];
  if (images.length === 0) return null;

  const flagged = images.find((img) => img.isPrimary);
  if (flagged) return flagged;

  return images.reduce((lowest, img) => (img.sortOrder < lowest.sortOrder ? img : lowest));
}

/** ['self-drive'] | ['with-driver'] | both, in that order. Empty array if neither flag is set. */
export function driveModes(car: CarDTO): ('self-drive' | 'with-driver')[] {
  const modes: ('self-drive' | 'with-driver')[] = [];
  if (car.selfDrive) modes.push('self-drive');
  if (car.withDriver) modes.push('with-driver');
  return modes;
}

/** Per-car value if set, otherwise the settings default. */
export function effectiveDriverRate(car: CarDTO, settings: SettingsDTO): number {
  return car.driverPricePerDay ?? settings.defaultDriverPricePerDay;
}

/** Per-car value if set, otherwise the settings default. */
export function effectiveKmLimit(car: CarDTO, settings: SettingsDTO): number {
  return car.kmLimitPerDay ?? settings.defaultKmLimitPerDay;
}

/** Per-car value if set, otherwise the settings default. */
export function effectiveExtraKm(car: CarDTO, settings: SettingsDTO): number {
  return car.extraKmCharge ?? settings.defaultExtraKmCharge;
}

/**
 * Total in whole rupees. driverRate is only added when mode === 'driver'.
 *
 * Reproduces today's arithmetic from src/pages/CarDetailsPage.tsx exactly:
 * basePrice = pricePerDay × days, driverTotal = rate × days (driver mode only),
 * total = basePrice + driverTotal. No taxes, no fees, no payment step — ever.
 */
export function calcTotal(
  car: CarDTO,
  settings: SettingsDTO,
  days: number,
  mode: 'self' | 'driver',
): { basePrice: number; driverTotal: number; total: number } {
  const basePrice = car.pricePerDay * days;
  const driverTotal = mode === 'driver' ? effectiveDriverRate(car, settings) * days : 0;
  return { basePrice, driverTotal, total: basePrice + driverTotal };
}

// --- branch/location helpers (CONTRACT.md §15) ---
//
// Same fallback shape as the pricing helpers above: the car's own value, else the
// global default. That is what lets a second city be added without touching a
// single hardcoded string.

/** The car's branch, or null when the owner hasn't assigned one yet. */
export function carLocation(car: CarDTO): LocationDTO | null {
  return car.location ?? null;
}

/**
 * The `Pickup:` value in the WhatsApp message: the car's branch address, else the
 * global fallback. For the current single-office fleet both resolve to the same
 * string, which is why the message stays byte-identical (§11).
 */
export function pickupAddress(car: CarDTO, settings: SettingsDTO): string {
  return car.location?.addressShort ?? settings.pickupAddress;
}

/**
 * The number a booking for this car must reach: the branch's own line when the
 * owner set one, otherwise the single business number.
 */
export function bookingPhone(car: CarDTO, settings: SettingsDTO): string {
  return car.location?.whatsappPhone ?? settings.whatsappPhone;
}

/**
 * Cars whose branch city is in `citySlugs`.
 *
 * An empty selection means "no filter" and returns the list unchanged — selecting
 * every city and selecting none are the same thing, and neither may ever produce
 * an empty fleet page (§15.2). Cars with no branch are excluded once a filter is
 * active: they belong to no city, and inventing one for them would be a lie.
 */
export function filterCarsByCities(cars: CarDTO[], citySlugs: string[]): CarDTO[] {
  if (citySlugs.length === 0) return cars;
  const wanted = new Set(citySlugs);
  return cars.filter((car) => (car.location ? wanted.has(citySlug(car.location.city)) : false));
}
