/**
 * Creates or updates the single owner login. P02 · run with:
 *
 *   npm run create:admin -- owner@example.com 'a-real-password'
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create:admin
 *
 * Rerunning it with the same email is how the owner resets his password: the
 * insert upserts on `email`.
 *
 * This hash is the only credential guarding the fleet data, so the password is
 * length-checked and refused if it is one of the obvious ones. Neither the
 * password nor the hash is ever printed — not on success, not in an error.
 *
 * Flags:
 *   --dry-run   validate the inputs, write nothing
 */

// First import: loads .env.local then .env before anything reads process.env.
import { requireEnv } from '../db/seed/env.js';

import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { adminUsers } from '../db/schema.js';

/** bcrypt cost. 12 is the project standard; P01 verifies against whatever this writes. */
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;

/** Not a dictionary — just the handful that show up in a rushed first setup. */
const WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'admin123',
  'admin1234',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'letmein123',
]);

const dryRun = process.argv.includes('--dry-run');
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

const USAGE = "Usage: npm run create:admin -- owner@example.com 'a-real-password'\n" +
  '       (or set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local)';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function resolveCredentials(): { email: string; password: string } {
  // CLI args win over the environment: the operator typed them just now.
  const rawEmail = positional[0] ?? process.env.ADMIN_EMAIL ?? '';
  const password = positional[1] ?? process.env.ADMIN_PASSWORD ?? '';

  if (!rawEmail || !password) fail(`Both an email and a password are required.\n${USAGE}`);

  // Lowercased and trimmed because POST /api/admin/login looks the email up
  // lowercased — a capital letter here would lock the owner out.
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`'${email}' is not a valid email address.\n${USAGE}`);

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Password too short: it must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    fail('That password is one of the obvious ones. Pick something else — this is the only credential guarding the fleet data.');
  }

  return { email, password };
}

async function main(): Promise<void> {
  const { email, password } = resolveCredentials();

  if (dryRun) {
    console.log(`[dry-run] credentials accepted; would upsert admin user: ${email}`);
    return;
  }

  requireEnv(['DATABASE_URL']);
  const db = getDb();

  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email));

  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  await db
    .insert(adminUsers)
    .values({ email, passwordHash })
    .onConflictDoUpdate({ target: adminUsers.email, set: { passwordHash } });

  console.log(existing ? `Password updated for: ${email}` : `Admin created: ${email}`);
  console.log(`Admin ready: ${email}`);
}

main().catch((error: unknown) => {
  // Deliberately only the message — an error object from the driver can carry
  // the bound parameters, and one of those is the hash.
  console.error('create:admin failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});