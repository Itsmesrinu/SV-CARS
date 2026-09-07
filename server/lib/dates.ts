/**
 * Server-side date primitives — the same rules as `src/lib/availability.ts`
 * (CONTRACT.md §16.1), reimplemented here because the server may not import
 * from `src/` at runtime.
 *
 * Three rules govern this file:
 *
 *  1. **Every date is a 'YYYY-MM-DD' string.** The `date` columns use Drizzle's
 *     `mode: 'string'`, so no `Date` object is ever built in the server's
 *     timezone and no offset can roll a day backwards.
 *  2. **"Today" is today in Asia/Kolkata**, never `new Date()` read in the
 *     server's zone. Vercel runs in UTC; between 18:30 UTC and midnight the two
 *     disagree about the date, and that disagreement is a car that looks booked
 *     for one extra evening.
 *  3. **Ranges are half-open: [start, end).** Out 05→08 means out on the 5th,
 *     6th and 7th and back on the 8th. Adjacency is therefore NOT overlap.
 *
 * ISO dates sort lexicographically, so plain string comparison is correct
 * ordering here — and it is what Postgres does with the `date` columns too.
 */

export const IST_TIME_ZONE = 'Asia/Kolkata';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/**
 * Today as 'YYYY-MM-DD' in Asia/Kolkata.
 *
 * `en-CA` is doing real work: its short date format is ISO, so this yields
 * '2026-09-05' directly. Mirrors `todayInIndia()` in `src/lib/availability.ts`
 * exactly, so the API and the browser always agree about what day it is.
 */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * True for a real calendar date in 'YYYY-MM-DD' form.
 *
 * The round-trip is the point: '2026-02-30' passes the regex, and `Date` will
 * happily roll it forward to 2 March rather than reject it.
 */
export function isValidDate(value: string | null | undefined): boolean {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

/** Plain-string date maths. Parsed at UTC noon so no offset crosses midnight. */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`).getTime();
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** `end - start` in whole days. May be negative. */
export function diffDays(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Half-open overlap: [aStart, aEnd) intersects [bStart, bEnd).
 *
 * Strict `<` on both sides is the whole contract: `05→08` and `08→12` are legal
 * neighbours, and a `<=` here would reject every back-to-back rental the owner
 * records.
 */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** First day of the current month in IST, as 'YYYY-MM-DD'. */
export function startOfMonthInIndia(): string {
  return `${todayInIndia().slice(0, 7)}-01`;
}

/** First day of the month after `date`'s month — the exclusive end of a month window. */
export function startOfNextMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
}