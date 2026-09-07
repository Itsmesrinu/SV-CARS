/**
 * Dates and availability — shared by the admin panel (P04, P09) and the public
 * pages (P05).
 *
 * Owned by P00, read-only for every other session (CONTRACT.md §4.2, §16).
 *
 * Two rules govern this whole file, and both exist because the alternative ships
 * an off-by-one to a customer:
 *
 *  1. **Every date is a 'YYYY-MM-DD' string.** No `Date` object crosses a
 *     boundary — not in a DTO, not in a URL, not in props, not out of these
 *     functions. Internally we parse to UTC *noon* so no timezone offset can
 *     roll a date backwards across midnight.
 *
 *  2. **Ranges are half-open: [start, end).** `startDate` is the first day out,
 *     `endDate` is the day the car is BACK. Out 05→08 means unavailable on the
 *     5th, 6th and 7th and available again on the 8th. This is what makes
 *     `days = end - start`, makes back-to-back rentals (05→08 then 08→12)
 *     non-overlapping neighbours, and makes "available from" literally the
 *     stored `endDate`.
 */

import type { BlockedRangeDTO, CarDTO } from '@/src/types/api';

export const IST_TIME_ZONE = 'Asia/Kolkata';

const MS_PER_DAY = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Today as 'YYYY-MM-DD' in Asia/Kolkata — the ONLY source of "today" in the app.
 *
 * `en-CA` is doing real work: it is the locale whose short date format is ISO,
 * so this yields '2026-09-05' directly. Assembling it from `getFullYear()` and
 * friends would read the *browser's* zone, and a customer opening the site from
 * Dubai must see the same "today" as the owner in Proddatur.
 */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** True for a real calendar date in 'YYYY-MM-DD' form. '2026-02-30' is false. */
export function isValidDate(value: string | null | undefined): boolean {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip check: rejects 2026-02-30, which Date happily rolls to March.
  return parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** `end - start` in whole days. Negative when end precedes start. */
export function diffDays(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Billable days for a rental, floored at 1.
 *
 * 05→08 Sep is 3 days; same-day (05→05) is 1 day. Matches the existing day
 * buttons: picking "3 Days" is 05→08 (CONTRACT.md §16.1 rule 3).
 */
export function rentalDays(start: string, end: string): number {
  return Math.max(1, diffDays(start, end));
}

/**
 * '05 Sep 2026'. A month NAME, never a numeric month: the owner reads these on a
 * phone and '05/09' versus '09/05' is a car handed over on the wrong day. Built
 * from a fixed table so the output is identical on every device, regardless of
 * the machine's locale.
 */
export function formatDate(date: string): string {
  if (!isValidDate(date)) return '';
  const [year, month, day] = date.split('-');
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Half-open overlap: [aStart, aEnd) intersects [bStart, bEnd). */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  // Strict `<` on both sides is what makes adjacency legal: 05→08 and 08→12 are
  // two back-to-back rentals, not a conflict. `<=` here would reject the owner's
  // normal week.
  return aStart < bEnd && bStart < aEnd;
}

/** True when any block overlaps [start, end). */
export function isBlocked(blocks: BlockedRangeDTO[], start: string, end: string): boolean {
  return blocks.some((block) => rangesOverlap(start, end, block.startDate, block.endDate));
}

/**
 * Earliest date on or after `from` that is not inside a block.
 *
 * Handles chained blocks: out 05→08 and again 08→12 means the next free date is
 * the 12th, not the 8th. Walks forward until nothing covers the candidate.
 */
export function nextFreeDate(blocks: BlockedRangeDTO[], from: string): string {
  const sorted = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  let candidate = from;
  let moved = true;
  while (moved) {
    moved = false;
    for (const block of sorted) {
      if (candidate >= block.startDate && candidate < block.endDate) {
        candidate = block.endDate;
        moved = true;
      }
    }
  }
  return candidate;
}

export type CarAvailability =
  | { kind: 'available' }
  /** Master switch off — no return date exists, so never promise one. */
  | { kind: 'unavailable' }
  /** Out today; `until` is the day it comes back, `daysAway` counts from today. */
  | { kind: 'booked'; until: string; daysAway: number };

/**
 * The customer-facing status, derived from the master switch AND the calendar.
 *
 * Order matters: the switch wins. A car that is both switched off and blocked
 * reads 'unavailable', because no return date may be implied for it (§16.2).
 *
 * Past blocks simply don't contain today, so a car returns to the fleet on its
 * own with no action from the owner — the auto-expiry decided in Amendment 2.
 */
export function carAvailability(car: CarDTO, today: string = todayInIndia()): CarAvailability {
  if (!car.availability) return { kind: 'unavailable' };

  const blocks = car.blocks ?? [];
  const coversToday = blocks.some(
    (block) => today >= block.startDate && today < block.endDate,
  );
  if (!coversToday) return { kind: 'available' };

  const until = nextFreeDate(blocks, today);
  return { kind: 'booked', until, daysAway: diffDays(today, until) };
}

/** Can this car serve the whole range? Master switch on AND no overlapping block. */
export function availableForRange(car: CarDTO, start: string, end: string): boolean {
  if (!car.availability) return false;
  return !isBlocked(car.blocks ?? [], start, end);
}

/**
 * The frozen status wording (§16.3). Relative for near dates because "available
 * in 2 days" is what a customer actually wants to know; absolute beyond a week
 * because "available in 96 days" is noise.
 */
export function availabilityLabel(status: CarAvailability): string {
  switch (status.kind) {
    case 'available':
      return 'Available';
    case 'unavailable':
      return 'Booked';
    case 'booked': {
      if (status.daysAway <= 0) return 'Available today';
      if (status.daysAway === 1) return 'Available tomorrow';
      if (status.daysAway <= 7) return `Available in ${status.daysAway} days`;
      return `Available from ${formatDate(status.until)}`;
    }
  }
}
