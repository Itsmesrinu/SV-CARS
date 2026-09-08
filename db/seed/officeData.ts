/**
 * The business data that is hardcoded in the app today, extracted verbatim.
 *
 * Owned by P02. Every value below was copied character-for-character out of the
 * file cited beside it — none of it is invented, and none of it may be
 * "improved" here. `.github/copilot-instructions.md` forbids inventing data,
 * and `addressShort` in particular lands in every WhatsApp booking message,
 * which P07 diffs byte-for-byte against the pre-migration output.
 *
 * It lives in one module so `seed-settings`, `seed-locations` and
 * `migrate-images` cannot drift about what the single office is called.
 */

import type { NewLocationRow, NewSettingsRow } from '../schema.js';

/**
 * The single `settings` row (CONTRACT.md §3 `SettingsDTO`).
 *
 * Since the multi-city amendment `whatsappPhone` and `pickupAddress` are
 * FALLBACKS (CONTRACT.md §15.5), used when a car has no branch or a branch has
 * no phone of its own. They are seeded anyway: they are the safety net, and the
 * current fleet's message output has to stay byte-identical either way.
 */
export const SETTINGS_SEED: NewSettingsRow = {
  id: 1,
  /** src/pages/CarDetailsPage.tsx:99, src/components/booking/ConciergeSidebarContent.tsx:58, src/components/ShareLocation.tsx:22 */
  whatsappPhone: '919704201247',
  /** src/pages/CarDetailsPage.tsx:126 — the `Pickup:` line of the booking message. */
  pickupAddress: 'Narasimhapuram, Proddatur',
  /** src/pages/CarDetailsPage.tsx:84 (`driverRate`), src/pages/BookingPage.tsx:14 */
  defaultDriverPricePerDay: 1000,
  /** src/pages/CarDetailsPage.tsx:112 (`'100 km/day'`) */
  defaultKmLimitPerDay: 100,
  /** src/pages/CarDetailsPage.tsx:113 (`'₹50/km'`) */
  defaultExtraKmCharge: 50,
};

/**
 * The one branch that exists today (CONTRACT.md §15, PLAN.md Amendment 1).
 *
 * There is exactly one office. No second, example or placeholder city is seeded
 * — a fabricated "Kadapa Branch" would put a fake business address in front of
 * customers. The owner adds further cities in the admin panel.
 */
export const PRODDATUR_BRANCH: NewLocationRow = {
  /** Slug of the city. */
  id: 'proddatur',
  /** src/pages/CarDetailsPage.tsx:191 — "…booking in Proddatur". */
  city: 'Proddatur',
  /** src/pages/CarDetailsPage.tsx:344 */
  officeName: 'Proddatur Branch',
  /** src/pages/CarDetailsPage.tsx:126 and :345 — the exact WhatsApp `Pickup:` string. */
  addressShort: 'Narasimhapuram, Proddatur',
  /** src/components/OfficeLocation.tsx:19 */
  addressFull: 'Narasimhapuram village, Proddatur mandal, Kadapa district, Andhra Pradesh, India',
  /**
   * The client has not supplied a map link yet, so this stays null and
   * `directionsHref()` derives a Google Maps search from the address instead.
   *
   * Explicitly NOT the iframe `src` at OfficeLocation.tsx:61: its coordinates
   * (`!2d78.55!3d14.73`) and place id (`0x0:0x0`) are placeholders someone made
   * up, and seeding them would ship an invented location.
   */
  directionsUrl: null,
  /** Inherits `settings.whatsappPhone`; there is only one number today. */
  whatsappPhone: null,
  isActive: true,
  sortOrder: 0,
};

/**
 * The branch every migrated car rents from. Set only on INSERT by
 * `migrate-images` — once the owner has moved a car to another branch, a rerun
 * must not drag it back here.
 */
export const DEFAULT_LOCATION_ID: string = PRODDATUR_BRANCH.id;