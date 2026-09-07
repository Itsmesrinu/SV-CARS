/**
 * Environment loading + validation for the one-time scripts in `scripts/`.
 *
 * Owned by P02. Importing this module has a side effect: it loads the dotenv
 * files. Every script therefore imports it FIRST, before `db/index.ts` or the
 * Cloudinary SDK.
 *
 * `.env.local` first: dotenv never overwrites an already-set var, so a value
 * there wins over `.env`, which in turn loses to a real shell/CI variable.
 * Same order as `drizzle.config.ts`, deliberately — a script and `db:push`
 * must never disagree about which database they are talking to.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/**
 * Repo root, derived from this file rather than from `process.cwd()`, so the
 * scripts read the same `.env` and the same `public/` folder whether they are
 * run via `npm run migrate:images` or `tsx scripts/migrate-images.ts` from a
 * subdirectory.
 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

config({ path: resolve(REPO_ROOT, '.env.local'), quiet: true });
config({ path: resolve(REPO_ROOT, '.env'), quiet: true });

/**
 * Exits with a message naming the missing variable(s). An unconfigured
 * Cloudinary SDK fails much later with an opaque `401 Unknown API key`, and an
 * unset `DATABASE_URL` fails on first query — both are worth pre-empting here
 * (CONTRACT.md §5.2).
 */
export function requireEnv(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) return;

  const plural = missing.length > 1;
  console.error(`Missing required environment variable${plural ? 's' : ''}: ${missing.join(', ')}`);
  console.error(`Add ${plural ? 'them' : 'it'} to .env.local (see .env.example) and run again.`);
  process.exit(1);
}