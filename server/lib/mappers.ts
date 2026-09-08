/**
 * DB rows -> wire DTOs (CONTRACT.md §3).
 *
 * Every response body in this server is built here, and the return types are the
 * shared interfaces from `src/types/api.ts` — a type-only import, so nothing
 * from `src/` is pulled into the server bundle, but a drift between the schema
 * and the frozen wire format fails `tsc` instead of failing P03's client at
 * runtime.
 *
 * Owned by P01.
 */

import type {
  AvailabilityBlockDTO,
  BlockedRangeDTO,
  CarDTO,
  CarImageDTO,
  ImageKind,
  LocationDTO,
  SettingsDTO,
} from '../../src/types/api.js';
import type {
  CarAvailabilityBlockRow,
  CarImageRow,
  CarRow,
  LocationRow,
  SettingsRow,
} from '../../db/schema.js';

export function toCarImageDTO(row: CarImageRow): CarImageDTO {
  return {
    id: row.id,
    publicId: row.publicId,
    width: row.width,
    height: row.height,
    blurDataUrl: row.blurDataUrl,
    kind: row.kind as ImageKind,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
    alt: row.alt,
  };
}

/**
 * A branch as the customer's browser sees it. Deliberately carries no
 * timestamps: this object is embedded in every car in every list response, so
 * every byte here is paid for ~30 times per page load.
 */
export function toLocationDTO(row: LocationRow): LocationDTO {
  return {
    id: row.id,
    city: row.city,
    officeName: row.officeName,
    addressShort: row.addressShort,
    addressFull: row.addressFull,
    directionsUrl: row.directionsUrl,
    whatsappPhone: row.whatsappPhone,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

/**
 * PUBLIC block shape — dates and nothing else (CONTRACT.md §16).
 *
 * This is a separate function from `toAvailabilityBlockDTO` on purpose, not one
 * function with a `includeNote` flag. `/api/cars` is world-readable and
 * CDN-cached and the owner's note can hold a customer's name; a mapper that
 * physically cannot reach `row.note` is worth three duplicated lines.
 */
export function toBlockedRangeDTO(row: CarAvailabilityBlockRow): BlockedRangeDTO {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

/** ADMIN block shape — adds the id, the car and the owner's private note. */
export function toAvailabilityBlockDTO(row: CarAvailabilityBlockRow): AvailabilityBlockDTO {
  return {
    id: row.id,
    carId: row.carId,
    startDate: row.startDate,
    endDate: row.endDate,
    note: row.note,
  };
}

/**
 * Assembles one car.
 *
 * The two sorts are contractual: `images` is promised sorted by `sortOrder` asc
 * and `blocks` by `startDate` asc, and both UI sessions rely on that rather than
 * re-sorting. Doing it here means every code path that builds a `CarDTO` — list,
 * detail, create, update — gets it right by construction.
 */
export function toCarDTO(
  carRow: CarRow,
  imageRows: CarImageRow[],
  locationRow: LocationRow | null,
  blockRows: CarAvailabilityBlockRow[],
): CarDTO {
  return {
    id: carRow.id,
    name: carRow.name,
    carType: carRow.carType,
    seating: carRow.seating,
    fuel: carRow.fuel,
    transmission: carRow.transmission,
    year: carRow.year,
    description: carRow.description,
    pricePerDay: carRow.pricePerDay,
    driverPricePerDay: carRow.driverPricePerDay,
    kmLimitPerDay: carRow.kmLimitPerDay,
    extraKmCharge: carRow.extraKmCharge,
    selfDrive: carRow.selfDrive,
    withDriver: carRow.withDriver,
    availability: carRow.availability,
    blocks: [...blockRows]
      .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
      .map(toBlockedRangeDTO),
    deliveryAvailable: carRow.deliveryAvailable,
    location: locationRow ? toLocationDTO(locationRow) : null,
    tags: carRow.tags ?? [],
    isFeatured: carRow.isFeatured,
    sortOrder: carRow.sortOrder,
    images: [...imageRows].sort((a, b) => a.sortOrder - b.sortOrder).map(toCarImageDTO),
    createdAt: carRow.createdAt.toISOString(),
    updatedAt: carRow.updatedAt.toISOString(),
  };
}

/** Note the absent `id` and `updatedAt`: the single-row table is an implementation detail. */
export function toSettingsDTO(row: SettingsRow): SettingsDTO {
  return {
    whatsappPhone: row.whatsappPhone,
    pickupAddress: row.pickupAddress,
    defaultDriverPricePerDay: row.defaultDriverPricePerDay,
    defaultKmLimitPerDay: row.defaultKmLimitPerDay,
    defaultExtraKmCharge: row.defaultExtraKmCharge,
    // A hero exists only when all three sizing/id columns are present; a partial
    // row would render a broken box, so treat anything less than complete as none.
    heroImage:
      row.heroPublicId && row.heroWidth && row.heroHeight
        ? {
            publicId: row.heroPublicId,
            width: row.heroWidth,
            height: row.heroHeight,
            blurDataUrl: row.heroBlurDataUrl ?? null,
          }
        : null,
  };
}