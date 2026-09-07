/**
 * Request-body validation.
 *
 * Every write endpoint parses its body through a zod schema here, and every
 * failure comes back as `422 validation_failed` with the offending field path in
 * the message. Bodies are parsed explicitly in the handler rather than through
 * validator middleware so the failure path is one obvious line of code.
 *
 * Owned by P01.
 */

import type { Context } from 'hono';
import { z } from 'zod';
import { validationError, validationFailed } from './errors';
import { isValidDate } from './dates';

/** Parses and validates a JSON body, throwing `HttpError` on any failure. */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw validationFailed('Request body must be valid JSON.');
  }

  const result = schema.safeParse(raw);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Image ids and block ids are uuids, and a path parameter that isn't one must
 * answer `404` rather than reaching Postgres — `where id = 'abc'` on a uuid
 * column raises `invalid input syntax for type uuid`, which would surface as a
 * 500 for what is plainly a bad URL.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// --- shared field primitives ---------------------------------------------

/**
 * Whole rupees, never negative.
 *
 * `0` is valid and must stay valid: it is the legitimate "the owner hasn't set
 * the price yet" state that the whole seeding strategy depends on.
 */
export const money = z.number().int('must be a whole number of rupees').min(0, 'cannot be negative');

export const nonNegativeInt = z.number().int('must be a whole number').min(0, 'cannot be negative');

/** Trimmed, and not empty once trimmed — `'   '` is not a name. */
export const nonEmptyString = z.string().trim().min(1, 'is required');

/** Optional free text: trimmed, and `''` collapses to null so the DB holds one "empty". */
export const nullableText = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value));

/**
 * A `wa.me`-safe phone: digits only, including the country code.
 *
 * `src/lib/booking.ts` interpolates this straight into a `wa.me/<phone>` URL, so
 * a stored `+91 97042 01247` produces a link that opens WhatsApp on nothing. We
 * normalise rather than reject — the owner pastes what his phone shows him —
 * but what lands in the column is always digits.
 *
 * Normalisation is a plain function called by the handler rather than a zod
 * `.transform()`: a transform turns the schema into a pipe, and a piped field
 * infers as an *optional* key in the parsed object under this project's
 * `tsconfig`, which then silently loses `required` on the way into Drizzle.
 */
export function normalisePhone(value: string): string {
  return value.replace(/[\s\-()+.]/g, '');
}

export const whatsappPhone = z.string().refine((value) => /^\d{8,15}$/.test(normalisePhone(value)), {
  message: 'must be digits only including the country code, e.g. 919704201247',
});

/**
 * A link the owner pasted that ends up in an `href` (CONTRACT.md §15.3).
 *
 * Scheme validation only: `javascript:`, `data:` and `vbscript:` are stored XSS
 * against the owner's own browser, while an Apple Maps or OSM or shortened link
 * is perfectly legitimate — so we check the scheme and never the domain.
 * `directionsHref()` re-checks at render time, because the DB predates this.
 */
export const httpUrl = z.string().trim().refine(
  (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      // Relative values land here too, and a relative "map link" is never right.
      return false;
    }
  },
  { message: 'must be an absolute http:// or https:// URL' },
);

/**
 * An admin form that clears a field posts `''`, and `''` is not an invalid
 * value — it is the owner saying "there isn't one". These two collapse it to
 * `null` before the format check, so clearing a branch's phone or map link is a
 * `200` rather than a `422` telling him to type a URL he doesn't have.
 */
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export const nullableHttpUrl = z.preprocess(emptyToNull, httpUrl.nullable());

export const nullableWhatsappPhone = z.preprocess(emptyToNull, whatsappPhone.nullable());

/**
 * 'YYYY-MM-DD', and a date that actually exists.
 *
 * The round-trip check is why this is not a bare regex: '2026-02-30' matches the
 * pattern and is not a day.
 */
export const dateString = z
  .string()
  .refine((value) => isValidDate(value), { message: "must be a real date in 'YYYY-MM-DD' form" });