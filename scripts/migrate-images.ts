/**
 * One-time migration of the existing fleet into Neon + Cloudinary.
 * P02 · run with `npm run migrate:images`.
 *
 * Run `npm run seed:locations` FIRST — every car row references that branch.
 *
 * `src/data/carImageMap.ts` is the source of truth and is read-only here. Its
 * image order is a hand-curated human decision
 * (main_front_1 → front_* → inside_* → side_* → back_1) and the migration's job
 * is to preserve it exactly. The `public/` folders are opened only to read
 * bytes — they are never globbed, because alphabetical order would put `back_1`
 * first and `side_2` before `inside_1`, silently destroying the curation.
 *
 * Idempotency is a hard requirement: this script gets rerun after wrong
 * credentials, a partial failure, or a new photo. A rerun must upload nothing,
 * insert nothing, and above all must not touch anything the owner has since
 * edited in admin — prices, description, or which branch a car belongs to.
 *
 * Flags:
 *   --dry-run   validate paths, dimensions, LQIP sizes and ordering offline.
 *               Uploads nothing, writes nothing, and needs no credentials or
 *               database at all.
 */

// First import: loads .env.local then .env before anything reads process.env.
import { REPO_ROOT, requireEnv } from '../db/seed/env.js';

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb } from '../db/index.js';
import { carImages, cars, locations, type CarImageRow } from '../db/schema.js';
import { DEFAULT_LOCATION_ID } from '../db/seed/officeData.js';
import { carData, type CarData } from '../src/data/carImageMap.js';

type ImageKind = CarImageRow['kind'];

/** LQIPs ship inside the JSON of every page load, so an oversized one is worth shouting about. */
const LQIP_WARN_BYTES = 1024;

const dryRun = process.argv.includes('--dry-run');

const tally = {
  carsInserted: 0,
  carsUpdated: 0,
  carsUnchanged: 0,
  imagesUploaded: 0,
  imagesSkipped: 0,
  errors: [] as string[],
};

/**
 * Derived from the filename prefix — the same convention the folders already
 * use. Order matters: `main_front_1` must be tested before `front_`.
 */
function imageKind(fileName: string): ImageKind {
  if (fileName.startsWith('main_front_')) return 'main';
  if (fileName.startsWith('front_')) return 'front';
  if (fileName.startsWith('inside_')) return 'inside';
  if (fileName.startsWith('side_')) return 'side';
  if (fileName.startsWith('back_')) return 'back';
  return 'other';
}

/**
 * The filename minus its FINAL extension only — the `public_id` we upload under.
 *
 * `inside_2.jpg.webp` (a genuine double extension on disk in the Ertiga folder)
 * therefore uploads as `inside_2.jpg`. Stripping both extensions would make the
 * public id disagree with the file it came from.
 */
function publicIdBase(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/**
 * The value we PERSIST, which is not always the same as the asset's public id.
 *
 * A Cloudinary delivery URL parses its last dot-segment as a format, so
 * `.../f_auto,q_auto/sv-cars/maruti-suzuki-ertiga/inside_2.jpg` asks for public
 * id `inside_2` in format jpg and 404s — the asset is `inside_2.jpg`. Appending
 * the asset's real format (`inside_2.jpg.webp`) resolves, and was verified 200
 * against `c_limit`, `c_auto,g_auto` and every width in CLD_WIDTHS.
 *
 * `cldUrl()` (CONTRACT.md §5) concatenates this value raw, so it has to be
 * directly addressable. Only ids that contain a dot are affected — the other 42
 * images are stored exactly as Cloudinary returned them.
 */
function deliverablePublicId(publicId: string, format: string | undefined): string {
  return publicId.includes('.') && format ? `${publicId}.${format}` : publicId;
}

interface PreparedImage {
  relPath: string;
  absPath: string;
  baseName: string;
  kind: ImageKind;
  width: number;
  height: number;
  blurDataUrl: string;
}

/** Reads the real pixels: dimensions and the LQIP. Never guesses either. */
async function prepareImage(relPath: string): Promise<PreparedImage> {
  // Paths in carImageMap start with '/' and are relative to public/.
  const absPath = join(REPO_ROOT, 'public', relPath);
  if (!existsSync(absPath)) {
    throw new Error(`Image file not found on disk: ${absPath} (from ${relPath})`);
  }

  const metadata = await sharp(absPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read dimensions from ${relPath}`);
  }

  // <CarImage> reserves its box from width/height, so a wrong number here is
  // visible layout shift on a real page.
  const lqip = await sharp(absPath).resize(16).webp({ quality: 20 }).toBuffer();
  const blurDataUrl = `data:image/webp;base64,${lqip.toString('base64')}`;
  if (blurDataUrl.length > LQIP_WARN_BYTES) {
    console.warn(`  [warn] LQIP for ${relPath} is ${blurDataUrl.length} bytes (> ${LQIP_WARN_BYTES})`);
  }

  const fileName = basename(relPath);
  return {
    relPath,
    absPath,
    baseName: publicIdBase(fileName),
    kind: imageKind(fileName),
    width: metadata.width,
    height: metadata.height,
    blurDataUrl,
  };
}

type Db = ReturnType<typeof getDb>;

/**
 * Insert on first run; on a rerun update ONLY the fields derived from the
 * folder name. `pricePerDay`, `description`, `transmission`, `year`,
 * `locationId`, `tags`, `isFeatured` and the pricing overrides are the owner's
 * — resetting his real rates to 0, or dragging a car back from his Kadapa
 * branch to Proddatur, would be a genuinely destructive rerun.
 */
async function upsertCar(db: Db, entry: CarData, sortOrder: number): Promise<void> {
  const derived = {
    name: entry.displayName,
    carType: entry.carType ?? null,
    seating: entry.seating ?? null,
    fuel: entry.fuel ?? null,
    availability: entry.availability,
    sortOrder,
  };

  const [existing] = await db.select().from(cars).where(eq(cars.id, entry.id));

  if (!existing) {
    await db.insert(cars).values({
      id: entry.id,
      ...derived,
      // Not derivable from a folder name; the owner fills these in admin.
      transmission: null,
      year: null,
      description: null,
      // 0 means "not set yet" and the fleet cards already hide a zero price,
      // so nothing false reaches a customer.
      pricePerDay: 0,
      // null => inherit the settings defaults.
      driverPricePerDay: null,
      kmLimitPerDay: null,
      extraKmCharge: null,
      selfDrive: true,
      withDriver: true,
      deliveryAvailable: false,
      // Set on INSERT only — see the doc comment above.
      locationId: DEFAULT_LOCATION_ID,
      tags: [],
      isFeatured: false,
    });
    tally.carsInserted += 1;
    return;
  }

  const changed =
    existing.name !== derived.name ||
    existing.carType !== derived.carType ||
    existing.seating !== derived.seating ||
    existing.fuel !== derived.fuel ||
    existing.availability !== derived.availability ||
    existing.sortOrder !== derived.sortOrder;

  if (!changed) {
    tally.carsUnchanged += 1;
    return;
  }

  await db.update(cars).set(derived).where(eq(cars.id, entry.id));
  tally.carsUpdated += 1;
}

async function migrateCar(db: Db, entry: CarData, index: number): Promise<void> {
  await upsertCar(db, entry, index);

  const existingImages = await db
    .select({ publicId: carImages.publicId, sortOrder: carImages.sortOrder })
    .from(carImages)
    .where(eq(carImages.carId, entry.id));

  const seenPublicIds = new Set(existingImages.map((row) => row.publicId));
  const takenPositions = new Map(existingImages.map((row) => [row.sortOrder, row.publicId]));

  /** Matches both stored forms — see `deliverablePublicId`. */
  const alreadyMigrated = (expected: string): boolean =>
    seenPublicIds.has(expected) || [...seenPublicIds].some((id) => id.startsWith(`${expected}.`));

  for (const [sortOrder, relPath] of entry.images.entries()) {
    const prepared = await prepareImage(relPath);
    const expectedPublicId = `sv-cars/${entry.id}/${prepared.baseName}`;

    if (alreadyMigrated(expectedPublicId)) {
      tally.imagesSkipped += 1;
      continue;
    }

    // The (carId, sortOrder) unique index is what protects the curated gallery
    // order. If the owner has since reordered or added images in admin, this
    // position belongs to him — leave it alone rather than fight over it.
    const occupant = takenPositions.get(sortOrder);
    if (occupant !== undefined) {
      tally.imagesSkipped += 1;
      console.warn(
        `  [warn] position ${sortOrder} of ${entry.id} already holds '${occupant}'; ` +
          `left untouched, ${relPath} not migrated`,
      );
      continue;
    }

    const uploaded = await cloudinary.uploader.upload(prepared.absPath, {
      folder: `sv-cars/${entry.id}`,
      public_id: prepared.baseName,
      overwrite: false,
      resource_type: 'image',
    });

    // Cloudinary's returned id, never the constructed guess — it may adjust it.
    const storedPublicId = deliverablePublicId(uploaded.public_id, uploaded.format);

    await db.insert(carImages).values({
      carId: entry.id,
      publicId: storedPublicId,
      width: prepared.width,
      height: prepared.height,
      blurDataUrl: prepared.blurDataUrl,
      kind: prepared.kind,
      sortOrder,
      isPrimary: sortOrder === 0,
    });

    seenPublicIds.add(storedPublicId);
    takenPositions.set(sortOrder, storedPublicId);
    tally.imagesUploaded += 1;
  }
}

/** Validates paths, dimensions, LQIPs and ordering without touching the network. */
async function dryRunCar(entry: CarData, index: number): Promise<void> {
  console.log(`\n[dry-run] ${index}. ${entry.displayName} (${entry.id})`);
  console.log(
    `  car: carType=${entry.carType ?? 'null'} seating=${entry.seating ?? 'null'} ` +
      `fuel=${entry.fuel ?? 'null'} availability=${entry.availability} ` +
      `sortOrder=${index} locationId=${DEFAULT_LOCATION_ID} pricePerDay=0`,
  );

  for (const [sortOrder, relPath] of entry.images.entries()) {
    const prepared = await prepareImage(relPath);
    console.log(
      `  ${sortOrder}. sv-cars/${entry.id}/${prepared.baseName}  ` +
        `${prepared.width}x${prepared.height}  kind=${prepared.kind}  ` +
        `isPrimary=${sortOrder === 0}  lqip=${prepared.blurDataUrl.length}B`,
    );
  }
}

async function main(): Promise<void> {
  const totalImages = carData.reduce((sum, entry) => sum + entry.images.length, 0);
  console.log(`Migrating ${carData.length} cars / ${totalImages} images${dryRun ? ' (dry run)' : ''}`);

  if (dryRun) {
    for (const [index, entry] of carData.entries()) {
      try {
        await dryRunCar(entry, index);
      } catch (error: unknown) {
        tally.errors.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`  [fail] ${entry.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } else {
    requireEnv([
      'DATABASE_URL',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]);

    // CONTRACT.md §5.2 — from the environment, never literals. `secure: true`
    // is not optional: without it the SDK emits http:// URLs, which are
    // mixed-content blocked on the deployed HTTPS site.
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    const db = getDb();

    // Explicit dependency rather than a confusing foreign key violation. This
    // script does not create the branch — one job per script.
    const [branch] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, DEFAULT_LOCATION_ID));
    if (!branch) {
      console.error(`Branch '${DEFAULT_LOCATION_ID}' does not exist, so cars cannot reference it.`);
      console.error('Run `npm run seed:locations` first, then rerun this script.');
      process.exit(1);
    }

    for (const [index, entry] of carData.entries()) {
      // Per-car try/catch so one unreadable file doesn't cost the other seven.
      try {
        const before = { uploaded: tally.imagesUploaded, skipped: tally.imagesSkipped };
        await migrateCar(db, entry, index);
        const uploaded = tally.imagesUploaded - before.uploaded;
        const skipped = tally.imagesSkipped - before.skipped;
        console.log(
          `  [ok]   ${entry.id}: ${entry.images.length} images — ${uploaded} uploaded, ${skipped} already present`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        tally.errors.push(`${entry.id}: ${message}`);
        console.error(`  [fail] ${entry.id}: ${message}`);
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Cars inserted:   ${tally.carsInserted}`);
  console.log(`Cars updated:    ${tally.carsUpdated}`);
  console.log(`Cars unchanged:  ${tally.carsUnchanged}`);
  console.log(`Images uploaded: ${tally.imagesUploaded}`);
  console.log(`Images skipped:  ${tally.imagesSkipped}`);
  console.log(`Errors:          ${tally.errors.length}`);
  for (const failure of tally.errors) console.error(`  - ${failure}`);

  // Non-zero so a failed run is obvious in a terminal and in CI.
  if (tally.errors.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error('migrate:images failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});