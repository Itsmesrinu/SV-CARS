/**
 * Slugs — the primary keys of `cars` and `locations`.
 *
 * These are public URLs (`/car/toyota-innova-crysta`), not opaque ids, so the
 * output must reproduce the ids the existing fleet already ships with:
 *   'Toyota Innova Crysta'   -> 'toyota-innova-crysta'
 *   'Maruti Suzuki Dzire'    -> 'maruti-suzuki-dzire'
 *
 * Owned by P01.
 */

/** Lowercase, non-alphanumerics collapsed to single hyphens, trimmed of hyphens. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    // Strip combining marks so 'Ré' becomes 're' rather than 'r-'.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * `base`, or `base-2`, `base-3`, … until `exists` says no.
 *
 * `exists` is a predicate rather than a table lookup so cars and locations share
 * one implementation: a second office in Kadapa becomes `kadapa-2` by the same
 * rule that gives a second Innova `toyota-innova-2`.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'item';
  if (!(await exists(root))) return root;

  // Bounded so a broken `exists` cannot spin forever inside a serverless function.
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Practically unreachable; a timestamp suffix beats throwing on the owner.
  return `${root}-${Date.now()}`;
}