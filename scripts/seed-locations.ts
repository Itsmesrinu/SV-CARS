/**
 * Seeds the one branch that exists today, so the multi-city feature starts from
 * real data rather than an empty table (CONTRACT.md §15, PLAN.md Amendment 1).
 * P02 · run with `npm run seed:locations`.
 *
 * MUST run before `npm run migrate:images` — every migrated car references this
 * row through `cars.locationId`.
 *
 * Idempotent: on conflict it does NOTHING, because the owner may well have
 * corrected the address by the time this is rerun. Pass `--force` for a
 * deliberate reset.
 *
 * Exactly one branch is seeded. Inventing a second "example" city would put a
 * fake business address in front of customers; the owner adds real ones in the
 * admin panel.
 *
 * Flags:
 *   --force     overwrite the existing row with the seeded values
 *   --dry-run   print what would be written, touch nothing
 */

// First import: loads .env.local then .env before anything reads process.env.
import { requireEnv } from '../db/seed/env';

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index';
import { locations, type LocationRow } from '../db/schema';
import { PRODDATUR_BRANCH } from '../db/seed/officeData';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

const ADMIN_REMINDER =
  'Further cities are added by the owner in the admin panel (Branches), not in this script.';

function printBranch(row: Pick<
  LocationRow,
  'id' | 'city' | 'officeName' | 'addressShort' | 'addressFull' | 'directionsUrl' | 'whatsappPhone' | 'isActive' | 'sortOrder'
>): void {
  console.log(`  id             ${row.id}`);
  console.log(`  city           ${row.city}`);
  console.log(`  officeName     ${row.officeName ?? '(null)'}`);
  console.log(`  addressShort   ${row.addressShort}`);
  console.log(`  addressFull    ${row.addressFull ?? '(null)'}`);
  console.log(`  directionsUrl  ${row.directionsUrl ?? '(null — Get Directions falls back to a maps search)'}`);
  console.log(`  whatsappPhone  ${row.whatsappPhone ?? '(null — inherits settings.whatsappPhone)'}`);
  console.log(`  isActive       ${row.isActive}`);
  console.log(`  sortOrder      ${row.sortOrder}`);
}

async function main(): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] would upsert location '${PRODDATUR_BRANCH.id}' with:`);
    printBranch({
      ...PRODDATUR_BRANCH,
      officeName: PRODDATUR_BRANCH.officeName ?? null,
      addressFull: PRODDATUR_BRANCH.addressFull ?? null,
      directionsUrl: PRODDATUR_BRANCH.directionsUrl ?? null,
      whatsappPhone: PRODDATUR_BRANCH.whatsappPhone ?? null,
      isActive: PRODDATUR_BRANCH.isActive ?? true,
      sortOrder: PRODDATUR_BRANCH.sortOrder ?? 0,
    });
    console.log(`[dry-run] existing row would be ${force ? 'OVERWRITTEN (--force)' : 'left untouched'}.`);
    console.log(ADMIN_REMINDER);
    return;
  }

  requireEnv(['DATABASE_URL']);
  const db = getDb();

  const [existing] = await db.select().from(locations).where(eq(locations.id, PRODDATUR_BRANCH.id));

  if (!existing) {
    const [created] = await db.insert(locations).values(PRODDATUR_BRANCH).returning();
    console.log('Branch created:');
    printBranch(created);
  } else if (!force) {
    console.log(`Branch '${existing.id}' already exists — left untouched (use --force to reset it).`);
    printBranch(existing);
  } else {
    const [updated] = await db
      .update(locations)
      .set({
        city: PRODDATUR_BRANCH.city,
        officeName: PRODDATUR_BRANCH.officeName,
        addressShort: PRODDATUR_BRANCH.addressShort,
        addressFull: PRODDATUR_BRANCH.addressFull,
        directionsUrl: PRODDATUR_BRANCH.directionsUrl,
        whatsappPhone: PRODDATUR_BRANCH.whatsappPhone,
        isActive: PRODDATUR_BRANCH.isActive,
        sortOrder: PRODDATUR_BRANCH.sortOrder,
      })
      .where(eq(locations.id, PRODDATUR_BRANCH.id))
      .returning();
    console.log('Branch reset to the seeded values (--force):');
    printBranch(updated);
  }

  console.log(ADMIN_REMINDER);
}

main().catch((error: unknown) => {
  console.error('seed:locations failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});