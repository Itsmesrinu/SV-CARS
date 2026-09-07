import type { CarDTO } from '@/src/types/api';
import { carAvailability } from './availability';
import { driveModes } from './carHelpers';

export interface FleetFilters {
  driveMode: 'all' | 'self-drive' | 'with-driver';
  availableNow: boolean;
  model: string | null;
  fuel: string | null;
  seating: number | null;
  sort: 'price-asc' | 'price-desc' | 'year-desc' | 'default';
}

export const DEFAULT_FILTERS: FleetFilters = {
  driveMode: 'all',
  availableNow: false,
  model: null,
  fuel: null,
  seating: null,
  sort: 'default',
};

/** Narrow the fleet without mutating it. Date-range ordering happens separately. */
export function applyFleetFilters(
  cars: CarDTO[],
  filters: FleetFilters,
  today?: string,
): CarDTO[] {
  const filtered = cars.filter((car) => {
    if (filters.driveMode !== 'all' && !driveModes(car).includes(filters.driveMode)) return false;
    if (filters.availableNow && carAvailability(car, today).kind !== 'available') return false;
    if (filters.model !== null && car.name !== filters.model) return false;
    if (filters.fuel !== null && car.fuel !== filters.fuel) return false;
    if (filters.seating !== null && car.seating !== filters.seating) return false;
    return true;
  });

  if (filters.sort === 'default') return filtered;

  // Preserve the API order when two cars compare equally. Although modern
  // JavaScript sorts stably, the original index makes that contract explicit.
  return filtered
    .map((car, index) => ({ car, index }))
    .sort((a, b) => {
      let comparison = 0;
      if (filters.sort === 'year-desc') {
        const aYear = a.car.year ?? Number.NEGATIVE_INFINITY;
        const bYear = b.car.year ?? Number.NEGATIVE_INFINITY;
        comparison = bYear - aYear;
      } else {
        const aUnset = a.car.pricePerDay === 0;
        const bUnset = b.car.pricePerDay === 0;
        if (aUnset !== bUnset) return aUnset ? 1 : -1;
        comparison = filters.sort === 'price-asc'
          ? a.car.pricePerDay - b.car.pricePerDay
          : b.car.pricePerDay - a.car.pricePerDay;
      }
      return comparison || a.index - b.index;
    })
    .map(({ car }) => car);
}

export function fleetFacets(cars: CarDTO[]): {
  models: string[];
  fuels: string[];
  seatings: number[];
} {
  return {
    models: [...new Set(cars.map((car) => car.name).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    ),
    fuels: [...new Set(cars.map((car) => car.fuel).filter((fuel): fuel is string => Boolean(fuel)))].sort(
      (a, b) => a.localeCompare(b),
    ),
    seatings: [...new Set(cars.map((car) => car.seating).filter((seating): seating is number =>
      typeof seating === 'number' && seating > 0,
    ))].sort((a, b) => a - b),
  };
}

export function activeFilterCount(filters: FleetFilters): number {
  return Number(filters.driveMode !== 'all')
    + Number(filters.availableNow)
    + Number(filters.model !== null)
    + Number(filters.fuel !== null)
    + Number(filters.seating !== null)
    + Number(filters.sort !== 'default');
}
