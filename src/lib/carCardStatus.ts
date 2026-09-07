/**
 * Car-card status helpers shared by the Home rail (`AvailableCars`) and the All
 * Cars grid (`AllCarsPage`). Pure and framework-free so both surfaces render the
 * SAME wording — see ui-prompts/P11-card-status-parity.md for why the card status
 * lives in one place now.
 *
 * This file only READS from the frozen `availability.ts` (P00-owned); it never
 * changes it. Ranges follow the same half-open `[start, end)` rule: `endDate` is
 * the day the car is BACK.
 */

import type { BlockedRangeDTO } from '@/src/types/api';

import { addDays, formatDate, nextFreeDate, rangesOverlap } from './availability';

/** A continuous span the car is booked, `[from, to)` — `to` is the return day. */
export interface ConflictWindow {
  from: string;
  to: string;
}

/**
 * The booked window that collides with a selected `[start, end)` range, or null
 * when nothing overlaps.
 *
 * Case B on the card: a car that is FREE today but whose chosen dates land inside
 * a *future* booking. We show the customer exactly which dates are taken. Blocks
 * that touch or overlap are absorbed into one span, so two back-to-back bookings
 * (08→12 then 12→15) read as a single "8–15 Sep", not two fragments.
 */
export function conflictWindow(
  blocks: BlockedRangeDTO[],
  start: string,
  end: string,
): ConflictWindow | null {
  const overlapping = blocks.filter((block) =>
    rangesOverlap(start, end, block.startDate, block.endDate),
  );
  if (overlapping.length === 0) return null;

  let from = overlapping[0].startDate;
  let to = overlapping[0].endDate;
  for (const block of overlapping) {
    if (block.startDate < from) from = block.startDate;
    if (block.endDate > to) to = block.endDate;
  }

  // Grow the span across any block that touches or overlaps it, so a chain of
  // back-to-back bookings collapses into the one window the customer can't have.
  let changed = true;
  while (changed) {
    changed = false;
    for (const block of blocks) {
      if (block.startDate <= to && block.endDate >= from) {
        if (block.startDate < from) {
          from = block.startDate;
          changed = true;
        }
        if (block.endDate > to) {
          to = block.endDate;
          changed = true;
        }
      }
    }
  }

  return { from, to };
}

/**
 * Compact label for a taken window, e.g. `8–15 Sep 2026`, `28 Sep – 3 Oct 2026`,
 * `30 Dec 2026 – 2 Jan 2027`. Reuses the frozen `formatDate` for the month table
 * so wording never drifts and stays locale-independent.
 */
export function bookedWindowLabel(from: string, to: string): string {
  const [d1, mon1, y1] = formatDate(from).split(' ');
  const [d2, mon2, y2] = formatDate(to).split(' ');
  if (!d1 || !d2) return '';
  const day1 = String(Number(d1));
  const day2 = String(Number(d2));
  if (y1 === y2 && mon1 === mon2) return `${day1}–${day2} ${mon2} ${y2}`;
  if (y1 === y2) return `${day1} ${mon1} – ${day2} ${mon2} ${y2}`;
  return `${day1} ${mon1} ${y1} – ${day2} ${mon2} ${y2}`;
}

/**
 * The earliest start date on or after `from` where a WHOLE `days`-long rental
 * fits with no block overlap.
 *
 * `nextFreeDate` only guarantees the *start* day is free, so shifting a range to
 * it can still leave the tail inside a later booking (the car-details "Use free
 * dates" bug). This checks the entire `[start, start + days)` window and jumps
 * past any block it hits until one fits, so the returned start always clears the
 * conflict.
 */
export function firstFreeStart(blocks: BlockedRangeDTO[], from: string, days: number): string {
  let candidate = from;
  // Each miss jumps `candidate` past at least one block, so this terminates in
  // at most one pass over the blocks.
  for (let guard = 0; guard <= blocks.length; guard += 1) {
    const end = addDays(candidate, days);
    const hit = blocks
      .filter((block) => rangesOverlap(candidate, end, block.startDate, block.endDate))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (!hit) return candidate;
    candidate = nextFreeDate(blocks, hit.endDate);
  }
  return candidate;
}
