/**
 * Shared API DTOs — the frozen wire format between the Hono API and the SPA.
 *
 * Owned by P00. Read-only for every other session: `server/`, `src/lib/api.ts`,
 * the React Query hooks, the admin panel and the public pages all agree here.
 * See prompts/CONTRACT.md §3 and §8/§9.
 */

export type ImageKind = 'main' | 'front' | 'side' | 'inside' | 'back' | 'other';

/**
 * A branch: one city, one office (CONTRACT.md §15).
 *
 * The owner creates these in admin — city, office address, map link — and the
 * customer picks cities to browse by. Embedded in every `CarDTO`, so it carries
 * no timestamps: it travels in every list response and stays small.
 */
export interface LocationDTO {
  id: string;                    // slug, e.g. 'proddatur'
  city: string;                  // 'Proddatur' — the name the customer selects
  officeName: string | null;     // 'Proddatur Branch'; null => `${city} Branch`
  addressShort: string;          // 'Narasimhapuram, Proddatur' — the WhatsApp `Pickup:` line
  addressFull: string | null;    // long postal address for the office section; null => addressShort
  directionsUrl: string | null;  // client-pasted map link for "Get Directions"; null => derived search URL
  whatsappPhone: string | null;  // digits only; null => settings.whatsappPhone
  isActive: boolean;             // false hides the city from customers without deleting it
  sortOrder: number;
}

/**
 * A span when a car is NOT rentable (CONTRACT.md §16).
 *
 * PUBLIC shape — deliberately minimal. No id, no carId, and above all no note:
 * `/api/cars` is world-readable and CDN-cached, and the owner's note can hold a
 * customer's name.
 *
 * `startDate` is INCLUSIVE (first day out), `endDate` is EXCLUSIVE (the day it is
 * back). Out 05→08 Sep means unavailable on the 5th, 6th and 7th, and available
 * again ON the 8th. Read CONTRACT.md §16.1 before writing any comparison.
 */
export interface BlockedRangeDTO {
  startDate: string;   // 'YYYY-MM-DD' inclusive
  endDate: string;     // 'YYYY-MM-DD' exclusive
}

/** The admin view of the same row: adds the id and the owner's private note. */
export interface AvailabilityBlockDTO extends BlockedRangeDTO {
  id: string;          // uuid
  carId: string;
  note: string | null; // ADMIN ONLY — never leaves an /api/admin/* response
}

/** Write payload for the availability endpoints. */
export interface BlockInput {
  startDate: string;
  endDate: string;
  note?: string | null;
}

export interface CarImageDTO {
  id: string;              // uuid
  publicId: string;        // Cloudinary public_id, e.g. 'sv-cars/toyota-innova/main_front_1'
  width: number;
  height: number;
  blurDataUrl: string | null;  // tiny base64 data URL for LQIP
  kind: ImageKind;
  sortOrder: number;
  isPrimary: boolean;
  alt: string | null;
}

export interface CarDTO {
  id: string;                  // slug, e.g. 'toyota-innova-crysta'
  name: string;
  carType: string | null;      // 'SUV' | 'MPV' | 'Mini Bus' | ... | null
  seating: number | null;
  fuel: string | null;
  transmission: string | null;
  year: number | null;
  description: string | null;
  pricePerDay: number;                 // whole rupees; 0 means "not set yet"
  driverPricePerDay: number | null;    // null => fall back to settings default
  kmLimitPerDay: number | null;        // null => fall back to settings default
  extraKmCharge: number | null;        // null => fall back to settings default
  selfDrive: boolean;
  withDriver: boolean;
  /**
   * MASTER SWITCH: false = off the road indefinitely (workshop, sold, papers).
   * NEVER render this directly on a customer surface — the status a customer
   * sees is derived from this AND the calendar by `carAvailability()` (§16.2).
   */
  availability: boolean;
  /** Dated spans when the car is out, sorted by startDate ascending (§16). */
  blocks: BlockedRangeDTO[];
  deliveryAvailable: boolean;
  location: LocationDTO | null;        // the branch this car rents from; null = not assigned yet
  tags: string[];
  isFeatured: boolean;
  sortOrder: number;
  images: CarImageDTO[];               // already sorted by sortOrder ascending
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
}

/**
 * The single admin-managed homepage hero image. Carries only what `CarImage`
 * needs to render; alt text is supplied by the Hero at the call site. `null` on
 * `SettingsDTO` means no custom hero is set and the home page auto-picks a fleet
 * photo. Also the write body of `PUT /api/admin/settings/hero`.
 */
export interface HeroImageDTO {
  publicId: string;                    // Cloudinary public_id under 'sv-cars/site'
  width: number;
  height: number;
  blurDataUrl: string | null;          // tiny base64 LQIP, same as a car image
}

export interface SettingsDTO {
  whatsappPhone: string;               // digits only with country code, e.g. '919704201247'
  pickupAddress: string;               // FALLBACK ONLY — used when a car has no location (§15.5)
  defaultDriverPricePerDay: number;
  defaultKmLimitPerDay: number;
  defaultExtraKmCharge: number;
  heroImage: HeroImageDTO | null;      // admin homepage hero; null => auto-pick a fleet photo
}

export interface ApiError {
  error: { code: string; message: string };
}

/**
 * Write payload for `POST /api/admin/cars` and (as `Partial<CarInput>`)
 * `PATCH /api/admin/cars/:id` — CONTRACT.md §8.
 *
 * `CarDTO` minus the server-owned fields (`images`, `createdAt`, `updatedAt`).
 * `id` is optional: on create the server slugifies `name` when it is absent and
 * appends `-2`, `-3`, … on collision.
 *
 * `location` is replaced by `locationId`: a write references the branch, it does
 * not embed it. An explicit `null` means "no branch yet" and is legitimate.
 */
export type CarInput = Omit<
  CarDTO,
  'images' | 'blocks' | 'createdAt' | 'updatedAt' | 'id' | 'location'
> & {
  id?: string;
  locationId: string | null;
};

/**
 * Write payload for `POST /api/admin/locations` and (as `Partial<LocationInput>`)
 * `PATCH /api/admin/locations/:id`. `id` optional — the server slugifies `city`.
 */
export type LocationInput = Omit<LocationDTO, 'id'> & {
  id?: string;
};

/** Body of `POST /api/admin/cars/:id/images`. */
export interface AddImageInput {
  publicId: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
  kind: ImageKind;
  alt?: string | null;
}

/** Body of `PATCH /api/admin/images/:imageId`. */
export interface UpdateImageInput {
  isPrimary?: boolean;
  kind?: ImageKind;
  alt?: string | null;
}

/**
 * Response of `POST /api/admin/uploads/sign` — everything the browser needs to
 * upload straight to Cloudinary without the file passing through our API.
 * Note there is no API secret here, and there never may be.
 */
export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
}
