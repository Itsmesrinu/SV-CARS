/**
 * Branch helpers shared by the admin panel (P04) and the public pages (P05).
 *
 * Owned by P00, read-only for every other session (CONTRACT.md §4.1, §15).
 *
 * The rule for what lives here versus `carHelpers.ts`: anything whose first
 * argument is a `LocationDTO` belongs here. The point is the same as the car
 * helpers — the office address, the city label and the directions link are
 * rendered in several places and must be identical in all of them.
 */

import type { CarDTO, LocationDTO } from '@/src/types/api';

/**
 * URL- and filter-safe form of a city name. Deliberately the same shape the
 * server uses to slugify a city into a location id, so `?cities=proddatur`
 * reads naturally — but the filter matches on the *city name*, not the id, so
 * two offices in one city both match one selection.
 */
export function citySlug(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 'Proddatur Branch' — `officeName` when the owner set one, else `${city} Branch`. */
export function officeLabel(location: LocationDTO): string {
  const name = location.officeName?.trim();
  return name ? name : `${location.city} Branch`;
}

/** The address to display: the long form when present, else the short one. */
export function displayAddress(location: LocationDTO): string {
  const full = location.addressFull?.trim();
  return full ? full : location.addressShort;
}

/**
 * href for a "Get Directions" button.
 *
 * Uses the owner's pasted `directionsUrl` when it is a valid http(s) URL, and
 * otherwise derives a Google Maps search from the address — so the button always
 * has somewhere to go. It was a dead `<button>` in the original codebase
 * (`OfficeLocation.tsx:38`); it must never be dead again.
 *
 * The scheme check is a security control, not a nicety: this value is typed by
 * the owner and lands in an `href`, so a stored `javascript:` URL would execute
 * on click. P01 rejects those on write; this is the second layer, because a row
 * may predate that validation (CONTRACT.md §15.3).
 */
export function directionsHref(location: LocationDTO): string {
  const raw = location.directionsUrl?.trim();
  if (raw && isSafeHttpUrl(raw)) return raw;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress(location))}`;
}

/**
 * `src` for the office-section map iframe.
 *
 * Derived from the address rather than from a stored URL, for two reasons: this
 * form needs no Maps API key, and a pasted share link (`maps.app.goo.gl/…`)
 * cannot be embedded at all. Building it here also means stored data can never
 * point the iframe at some other origin.
 */
export function mapEmbedSrc(location: LocationDTO): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(displayAddress(location))}&output=embed`;
}

/**
 * The customer-facing city list: deduplicated by city name, counted, and ordered
 * by the owner's `sortOrder` then alphabetically.
 *
 * Deduplication is the interesting part — two offices in one city are one choice
 * to a customer, and its count covers both.
 */
export function cityOptions(
  locations: LocationDTO[],
  cars: CarDTO[],
): { slug: string; city: string; carCount: number }[] {
  const byCity = new Map<string, { slug: string; city: string; carCount: number; order: number }>();

  locations.forEach((location, index) => {
    const slug = citySlug(location.city);
    if (!slug) return;
    const existing = byCity.get(slug);
    if (existing) {
      // Keep the earliest ordering position among offices sharing a city.
      existing.order = Math.min(existing.order, location.sortOrder * 1000 + index);
      return;
    }
    byCity.set(slug, {
      slug,
      city: location.city,
      carCount: 0,
      order: location.sortOrder * 1000 + index,
    });
  });

  for (const car of cars) {
    if (!car.location) continue;
    const entry = byCity.get(citySlug(car.location.city));
    if (entry) entry.carCount += 1;
  }

  return [...byCity.values()]
    .sort((a, b) => a.order - b.order || a.city.localeCompare(b.city))
    .map(({ slug, city, carCount }) => ({ slug, city, carCount }));
}

/** Only `http:` and `https:` may reach an href. Anything else is treated as absent. */
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
