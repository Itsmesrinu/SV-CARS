/**
 * Drizzle client over the Neon HTTP driver.
 *
 * Owned by P00. Read-only for everyone else.
 *
 * The client is created **lazily**. Importing this module must never throw:
 * P02's scripts load `.env.local` with dotenv *after* module graph evaluation,
 * and `tsc`/drizzle-kit import it with no environment at all. The `DATABASE_URL`
 * check therefore happens on first query, not on import.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export { schema };

type Db = NeonHttpDatabase<typeof schema>;

let instance: Db | null = null;

/** Creates the client on first call, then reuses it. */
export function getDb(): Db {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add the Neon pooled connection string to .env.local ' +
        '(or .env) for local work, and to the Vercel project environment for deploys. ' +
        'See .env.example.',
    );
  }

  instance = drizzle(neon(url), { schema });
  return instance;
}

/**
 * Ergonomic lazy handle: `db.select()...` works, but nothing connects until the
 * first property access. Use this in request handlers; use `getDb()` when you
 * want the connection error to surface at an explicit point (e.g. a script's
 * startup check).
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
