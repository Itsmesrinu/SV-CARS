import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// `.env.local` first: dotenv never overwrites an already-set var, so a value
// there wins over `.env`, which in turn loses to a real shell/CI variable.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Keep generated SQL readable in review; migrations are committed to git.
  verbose: true,
  strict: true,
});
