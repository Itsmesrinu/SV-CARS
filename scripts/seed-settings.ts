/**
 * Seeds the single `settings` row (id = 1) with the values that are hardcoded
 * in the app today. P02 · run with `npm run seed:settings`.
 *
 * Idempotent: on conflict it does NOTHING. Once the owner has corrected his
 * phone number or his rates in admin, a rerun must not stomp them. Pass
 * `--force` for a deliberate reset back to the seeded values.
 *
 * Flags:
 *   --force     overwrite an existing row with the seeded values
 *   --dry-run   print what would be written, touch nothing
 */

// First import: loads .env.local then .env before anything reads process.env.
import { requireEnv } from '../db/seed/env.js';

import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';
import { SETTINGS_SEED } from '../db/seed/officeData.js';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

function printSeed(): void {
  console.log(`  whatsappPhone            ${SETTINGS_SEED.whatsappPhone}`);
  console.log(`  pickupAddress            ${SETTINGS_SEED.pickupAddress}`);
  console.log(`  defaultDriverPricePerDay ${SETTINGS_SEED.defaultDriverPricePerDay}`);
  console.log(`  defaultKmLimitPerDay     ${SETTINGS_SEED.defaultKmLimitPerDay}`);
  console.log(`  defaultExtraKmCharge     ${SETTINGS_SEED.defaultExtraKmCharge}`);
}

async function main(): Promise<void> {
  if (dryRun) {
    console.log('[dry-run] would upsert settings row id=1 with:');
    printSeed();
    console.log(`[dry-run] existing row would be ${force ? 'OVERWRITTEN (--force)' : 'left untouched'}.`);
    return;
  }

  requireEnv(['DATABASE_URL']);
  const db = getDb();

  const [existing] = await db.select().from(settings).where(eq(settings.id, 1));

  if (!existing) {
    await db.insert(settings).values(SETTINGS_SEED);
    console.log('Settings row created:');
    printSeed();
    return;
  }

  if (!force) {
    console.log('Settings row already exists — left untouched (use --force to reset it).');
    console.log(`  whatsappPhone            ${existing.whatsappPhone}`);
    console.log(`  pickupAddress            ${existing.pickupAddress}`);
    console.log(`  defaultDriverPricePerDay ${existing.defaultDriverPricePerDay}`);
    console.log(`  defaultKmLimitPerDay     ${existing.defaultKmLimitPerDay}`);
    console.log(`  defaultExtraKmCharge     ${existing.defaultExtraKmCharge}`);
    return;
  }

  await db
    .update(settings)
    .set({
      whatsappPhone: SETTINGS_SEED.whatsappPhone,
      pickupAddress: SETTINGS_SEED.pickupAddress,
      defaultDriverPricePerDay: SETTINGS_SEED.defaultDriverPricePerDay,
      defaultKmLimitPerDay: SETTINGS_SEED.defaultKmLimitPerDay,
      defaultExtraKmCharge: SETTINGS_SEED.defaultExtraKmCharge,
    })
    .where(eq(settings.id, 1));

  console.log('Settings row reset to the seeded values (--force):');
  printSeed();
}

main().catch((error: unknown) => {
  console.error('seed:settings failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});