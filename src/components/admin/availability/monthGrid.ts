/**
 * Pure helpers for the fleet availability month grid (CONTRACT.md §16.7).
 *
 * Owned by P09. Nothing here computes availability — `src/lib/availability.ts`
 * (P00) does that, and P05 renders the customer side from the same functions.
 * This file only shapes those answers into rows, columns and cells.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INCLUSIVE/EXCLUSIVE CONVERSION, WRITTEN DOWN ONCE (CONTRACT.md §16.1 r2)
 *
 * A block is the half-open span [startDate, endDate): `startDate` is the first
 * day the car is out, `endDate` is the day it is BACK.
 *
 *   RENDER   the cell for day D is blocked  <=>  D >= startDate && D < endDate
 *   CREATE   the owner dragged across first..last INCLUSIVE
 *            =>  startDate = first,  endDate = addDays(last, 1)
 *
 * Out 05→08 Sep shades the 5th, 6th and 7th — three cells, not four — and the
 * 8th is free. `blockForDay` and `blockFromSelection` below are the only two
 * places in this folder where that conversion happens; everything else calls
 * them. Get this wrong and every block in the app is off by a day.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { addDays, formatDate, todayInIndia } from '@/src/lib/availability';
import type { AvailabilityBlockDTO } from '@/src/types/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** 'YYYY-MM'. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Weekday index (0 = Sunday) for a 'YYYY-MM-DD' string.
 *
 * Parsed at UTC noon for exactly the reason src/lib/availability.ts gives: no
 * timezone offset can then roll the date backwards across midnight. The `Date`
 * never leaves this function.
 */
function weekdayIndex(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const day = weekdayIndex(date);
  return day === 0 || day === 6;
}

/** 'S' | 'M' | … — the one-letter column header. */
export function weekdayInitial(date: string): string {
  return WEEKDAY_INITIAL[weekdayIndex(date)];
}

/** 'Tue' — used in the editor's "back on Tue 08 Sep" line. */
export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[weekdayIndex(date)];
}

/**
 * '05 Sep' — the compact form, derived from the frozen `formatDate` so the
 * month abbreviation can never disagree with the rest of the app.
 */
export function dayMonth(date: string): string {
  const [day, month] = formatDate(date).split(' ');
  return day && month ? `${day} ${month}` : '';
}

/** '05–08 Sep', or '28 Sep – 03 Oct' when the span crosses a month. */
export function formatSpan(start: string, end: string): string {
  const [d1, m1, y1] = formatDate(start).split(' ');
  const [d2, m2, y2] = formatDate(end).split(' ');
  if (!d1 || !d2) return '';
  if (m1 === m2 && y1 === y2) return `${d1}–${d2} ${m1}`;
  return `${d1} ${m1} – ${d2} ${m2}`;
}

/** The month containing today in India — never the browser's month (§16.1 r4). */
export function currentMonth(): string {
  return todayInIndia().slice(0, 7);
}

/**
 * Repair rather than reject, the same way the customer's date range does
 * (§16.4 r4): a stale or hand-edited `?month=` lands on the current month
 * instead of an error screen.
 */
export function normalizeMonth(value: string | null | undefined): string {
  return value && MONTH_PATTERN.test(value) ? value : currentMonth();
}

/** 'September 2026'. A month NAME — see the reasoning on `formatDate`. */
export function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  return `${MONTH_NAMES[Number(index) - 1]} ${year}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  const total = year * 12 + (index - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Every day of the month, ascending — one grid column each. */
export function monthDays(month: string): string[] {
  const days: string[] = [];
  let day = `${month}-01`;
  while (day.slice(0, 7) === month) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/**
 * The window for the single `GET /api/admin/availability?from=&to=` call.
 *
 * `to` is the first day of the NEXT month, i.e. exclusive, matching the rule
 * every other date range in this app follows.
 */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}

/** THE RENDER RULE. The cell for `day` is blocked when D >= start && D < end. */
export function blockForDay(
  blocks: AvailabilityBlockDTO[],
  day: string,
): AvailabilityBlockDTO | null {
  return blocks.find((block) => day >= block.startDate && day < block.endDate) ?? null;
}

/**
 * THE CREATE RULE. The owner dragged across `first`..`last` inclusive; the day
 * after `last` is the day the car is back.
 */
export function blockFromSelection(first: string, last: string): { startDate: string; endDate: string } {
  return { startDate: first, endDate: addDays(last, 1) };
}

export function groupBlocksByCar(
  blocks: AvailabilityBlockDTO[],
): Map<string, AvailabilityBlockDTO[]> {
  const byCar = new Map<string, AvailabilityBlockDTO[]>();
  for (const block of blocks) {
    const existing = byCar.get(block.carId);
    if (existing) existing.push(block);
    else byCar.set(block.carId, [block]);
  }
  return byCar;
}

/**
 * How far a drag starting on `anchor` may extend, in either direction.
 *
 * Stops at today (the past is not editable) and at the neighbouring blocks, so
 * a drag cannot produce a range the server is certain to reject with a 409.
 * Adjacency stays legal: the selection may touch a block's edge, never cover it.
 */
export function selectableBounds(
  days: string[],
  blocks: AvailabilityBlockDTO[],
  today: string,
  anchor: string,
): { min: string; max: string } {
  const anchorIndex = days.indexOf(anchor);
  let min = anchor;
  let max = anchor;

  for (let i = anchorIndex - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day < today || blockForDay(blocks, day)) break;
    min = day;
  }
  for (let i = anchorIndex + 1; i < days.length; i += 1) {
    const day = days[i];
    if (blockForDay(blocks, day)) break;
    max = day;
  }

  return { min, max };
}

/** The id carried by the not-yet-saved block while a create is in flight. */
export const PENDING_BLOCK_ID = 'pending-block';

/**
 * The optimistic overlay (§ "an availability change that silently doesn't save
 * is the worst bug this screen can have").
 *
 * One op at a time — the editor is modal and a drag commits before the next one
 * can start — so a single value is enough. Rollback is `setPending(null)`.
 */
export type PendingOp =
  | { kind: 'create'; carId: string; startDate: string; endDate: string; note: string | null }
  | { kind: 'update'; id: string; startDate: string; endDate: string; note: string | null }
  | { kind: 'delete'; id: string };

export function mergePending(
  blocks: AvailabilityBlockDTO[],
  pending: PendingOp | null,
): AvailabilityBlockDTO[] {
  if (!pending) return blocks;

  switch (pending.kind) {
    case 'create':
      return [
        ...blocks,
        {
          id: PENDING_BLOCK_ID,
          carId: pending.carId,
          startDate: pending.startDate,
          endDate: pending.endDate,
          note: pending.note,
        },
      ];
    case 'update':
      return blocks.map((block) =>
        block.id === pending.id
          ? { ...block, startDate: pending.startDate, endDate: pending.endDate, note: pending.note }
          : block,
      );
    case 'delete':
      return blocks.filter((block) => block.id !== pending.id);
  }
}

/** The block ids currently mid-flight, so the grid can render them as saving. */
export function savingBlockIds(pending: PendingOp | null): ReadonlySet<string> {
  if (!pending) return new Set();
  if (pending.kind === 'create') return new Set([PENDING_BLOCK_ID]);
  if (pending.kind === 'update') return new Set([pending.id]);
  return new Set();
}