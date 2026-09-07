/**
 * Drizzle schema — Neon Postgres.
 *
 * Owned by P00. P01 (API) and P02 (migration scripts) consume the inferred
 * row types at the bottom of this file; they must not edit the schema.
 *
 * Shapes here are chosen to produce the DTOs in prompts/CONTRACT.md §3 with a
 * plain field mapping and no computation.
 *
 * Two rules worth restating, because they are why several columns are nullable:
 *  - `.github/copilot-instructions.md` forbids inventing data. Transmission,
 *    year, description and location are genuinely unknown for the current fleet,
 *    so they are nullable and the owner fills them in the admin panel.
 *  - The per-car pricing overrides (`driverPricePerDay`, `kmLimitPerDay`,
 *    `extraKmCharge`) are nullable on purpose: NULL means "inherit the settings
 *    default" (CONTRACT.md §4), which is what removed the hardcoded
 *    `driverRate = 1000` / `100 km/day` / `₹50/km` from four separate files.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Matches `ImageKind` in src/types/api.ts (CONTRACT.md §3). */
export const imageKindEnum = pgEnum('image_kind', [
  'main',
  'front',
  'side',
  'inside',
  'back',
  'other',
]);

/**
 * Branches — one city, one office (CONTRACT.md §15, PLAN.md Amendment 1).
 *
 * The owner types these in: a city name, the office address, and the map link
 * that the "Get Directions" button opens. Everything the customer sees about a
 * location comes from here, so nothing about a place stays hardcoded in `src/`.
 */
export const locations = pgTable(
  'locations',
  {
    /** Slug of the city, e.g. 'proddatur'. Second office in one city => 'kadapa-2'. */
    id: text('id').primaryKey(),
    /** 'Proddatur' — the name the customer picks in the city filter. */
    city: text('city').notNull(),
    /** 'Proddatur Branch'. Null renders as `${city} Branch`. */
    officeName: text('office_name'),
    /**
     * 'Narasimhapuram, Proddatur' — the exact string that becomes the `Pickup:`
     * line of every WhatsApp booking for a car at this branch. Highest-consequence
     * field in the table.
     */
    addressShort: text('address_short').notNull(),
    /** Long postal address for the office section. Null falls back to addressShort. */
    addressFull: text('address_full'),
    /**
     * Client-pasted map link for the "Get Directions" button. Null is fine — the UI
     * derives a maps search from the address instead.
     *
     * This value ends up in an `href`, so it is validated as http(s) on write (P01)
     * AND re-checked at render (`directionsHref`). Never trust it (§15.3).
     */
    directionsUrl: text('directions_url'),
    /** Per-branch booking number, digits only. Null inherits settings.whatsappPhone. */
    whatsappPhone: text('whatsapp_phone'),
    /** false hides the city from customers without deleting it or its cars. */
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Deliberately NOT unique on `city`: two offices in one city is a real case, and
  // `cityOptions()` collapses them into a single customer-facing choice.
  (t) => [index('locations_sort_order_idx').on(t.sortOrder)],
);

export const cars = pgTable(
  'cars',
  {
    /**
     * Slug, e.g. 'toyota-innova-crysta' — NOT a serial. Public URLs are
     * `/car/:id` with these slugs today and must not change.
     */
    id: text('id').primaryKey(),
    name: text('name').notNull(),

    // Specs. Nullable = not known yet; the UI already hides missing specs.
    carType: text('car_type'),
    seating: integer('seating'),
    fuel: text('fuel'),
    transmission: text('transmission'),
    year: integer('year'),
    description: text('description'),

    // Money, in whole rupees. 0 means "not set yet" and the fleet cards hide it.
    pricePerDay: integer('price_per_day').notNull().default(0),
    // NULL => inherit from `settings`.
    driverPricePerDay: integer('driver_price_per_day'),
    kmLimitPerDay: integer('km_limit_per_day'),
    extraKmCharge: integer('extra_km_charge'),

    // The current fleet offers both modes, which is what the pre-backend
    // `src/data/cars.ts` hardcoded for every car before P05 deleted it.
    selfDrive: boolean('self_drive').notNull().default(true),
    withDriver: boolean('with_driver').notNull().default(true),

    /** true = available, false = booked. */
    availability: boolean('availability').notNull().default(true),
    deliveryAvailable: boolean('delivery_available').notNull().default(false),

    /**
     * The branch this car rents from (CONTRACT.md §15). Replaces the free-text
     * `location` field from docs/data-model.md — a branch is a real row now.
     *
     * Nullable: a car may exist before the owner has set up any city. `set null`
     * rather than `cascade` because deleting a branch must never delete his cars;
     * P01 additionally refuses the delete with 409 while cars still point here.
     */
    locationId: text('location_id').references(() => locations.id, { onDelete: 'set null' }),

    tags: text('tags').array().notNull().default([]),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      // Safety net so a PATCH that forgets to set it still bumps the timestamp.
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('cars_sort_order_idx').on(t.sortOrder),
    index('cars_location_id_idx').on(t.locationId),
  ],
);

export const carImages = pgTable(
  'car_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    carId: text('car_id')
      .notNull()
      .references(() => cars.id, { onDelete: 'cascade' }),
    /** Cloudinary public_id, e.g. 'sv-cars/toyota-innova-crysta/main_front_1'. */
    publicId: text('public_id').notNull(),
    /** Real pixel dimensions — these are what let <CarImage> reserve the box and hit CLS 0. */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Tiny base64 data URL used as the LQIP blur background. */
    blurDataUrl: text('blur_data_url'),
    kind: imageKindEnum('kind').notNull().default('other'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    alt: text('alt'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('car_images_car_id_idx').on(t.carId),
    // Gallery order is part of the product (the curated order in
    // src/data/carImageMap.ts), so a car may not have two images at the same
    // position. NOTE for P01: reordering must therefore not produce a transient
    // duplicate — see the friction note in P00's report.
    uniqueIndex('car_images_car_id_sort_order_uq').on(t.carId, t.sortOrder),
  ],
);

/**
 * Single-row table holding the values that used to be hardcoded in the pages.
 * The `id = 1` check is what keeps it single-row.
 */
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey(),

    /** Digits only, with country code, e.g. '919704201247'. */
    whatsappPhone: text('whatsapp_phone').notNull(),
    /** e.g. 'Narasimhapuram, Proddatur'. */
    pickupAddress: text('pickup_address').notNull(),

    // Defaults mirror the values the app ships with today, so behaviour is
    // unchanged if a row is inserted without them. P02 seeds them explicitly.
    defaultDriverPricePerDay: integer('default_driver_price_per_day').notNull().default(1000),
    defaultKmLimitPerDay: integer('default_km_limit_per_day').notNull().default(100),
    defaultExtraKmCharge: integer('default_extra_km_charge').notNull().default(50),

    // Homepage hero image — a single admin-managed photo. All null (the default)
    // means "no custom hero"; the home page then auto-picks a fleet photo. Same
    // shape a car image stores, minus the car-image-only columns.
    heroPublicId: text('hero_public_id'),
    heroWidth: integer('hero_width'),
    heroHeight: integer('hero_height'),
    heroBlurDataUrl: text('hero_blur_data_url'),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
);

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  /** bcryptjs hash — never a plaintext password, not even in a script. */
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Relations, so P01 can use the relational API:
 * `db.query.cars.findMany({ with: { images: true } })`.
 * Requires `db/index.ts` to pass this module as the drizzle `schema` — it does.
 */
/**
 * Spans when a car is NOT rentable (CONTRACT.md §16, PLAN.md Amendment 2).
 *
 * This is the owner's calendar — what HE says about HIS cars. Customer bookings
 * are never stored anywhere; they travel to him over WhatsApp and a booking
 * becomes real when he blocks the dates here himself.
 *
 * `startDate` is INCLUSIVE, `endDate` is EXCLUSIVE. A car out '2026-09-05' →
 * '2026-09-08' is unavailable on the 5th, 6th and 7th and available again ON
 * the 8th. That choice makes `days = end - start`, makes back-to-back rentals
 * (05→08 then 08→12) non-overlapping neighbours, and makes "available from"
 * literally the stored `endDate`. Admin labels the fields "Out from" / "Back on"
 * so the owner never meets the concept. Read CONTRACT.md §16.1 before writing
 * any comparison against these columns.
 */
export const carAvailabilityBlocks = pgTable(
  'car_availability_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    carId: text('car_id')
      .notNull()
      .references(() => cars.id, { onDelete: 'cascade' }),

    /**
     * `mode: 'string'` is deliberate: Drizzle hands back 'YYYY-MM-DD' instead of
     * a Date built in the server's timezone. Vercel runs in UTC and the business
     * runs in IST — a Date here is an off-by-one waiting for 05:30.
     */
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),

    /** The owner's private annotation, e.g. 'Ravi — Hyderabad trip'.
     *  ADMIN ONLY. It must never be spread into a public response: /api/cars is
     *  world-readable and CDN-cached, and this field can hold a customer's name. */
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('car_availability_blocks_car_id_start_idx').on(t.carId, t.startDate),
    // Overlaps are rejected by the API with a 409 that names the conflicting
    // dates. A database exclusion constraint would need the btree_gist
    // extension and could only ever produce an opaque error.
    check('car_availability_blocks_end_after_start', sql`${t.endDate} > ${t.startDate}`),
  ],
);

export const carsRelations = relations(cars, ({ many, one }) => ({
  images: many(carImages),
  location: one(locations, { fields: [cars.locationId], references: [locations.id] }),
  availabilityBlocks: many(carAvailabilityBlocks),
}));

export const carAvailabilityBlocksRelations = relations(carAvailabilityBlocks, ({ one }) => ({
  car: one(cars, { fields: [carAvailabilityBlocks.carId], references: [cars.id] }),
}));

export const carImagesRelations = relations(carImages, ({ one }) => ({
  car: one(cars, { fields: [carImages.carId], references: [cars.id] }),
}));

export const locationsRelations = relations(locations, ({ many }) => ({
  cars: many(cars),
}));

// --- Inferred row types. Consumed by P01 and P02. ---

export type CarRow = typeof cars.$inferSelect;
export type NewCarRow = typeof cars.$inferInsert;

export type CarImageRow = typeof carImages.$inferSelect;
export type NewCarImageRow = typeof carImages.$inferInsert;

export type LocationRow = typeof locations.$inferSelect;
export type NewLocationRow = typeof locations.$inferInsert;

export type CarAvailabilityBlockRow = typeof carAvailabilityBlocks.$inferSelect;
export type NewCarAvailabilityBlockRow = typeof carAvailabilityBlocks.$inferInsert;

export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;

export type AdminUserRow = typeof adminUsers.$inferSelect;
export type NewAdminUserRow = typeof adminUsers.$inferInsert;
