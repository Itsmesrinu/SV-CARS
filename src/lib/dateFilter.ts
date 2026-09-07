/**
 * The customer's start/end dates (CONTRACT.md §16.4).
 *
 * Deliberately the same shape as `useCityFilter` — URL first, localStorage as a
 * memory, repair rather than reject — so the two behave identically for the
 * customer and read identically for the next person in this file.
 *
 * Nothing here is ever persisted server-side. The dates ride along to the owner
 * on WhatsApp and nowhere else (CONTRACT.md §1 rule 9, §16).
 *
 * **There is no `new Date()` in this file, and there must never be one.** Every
 * date is a 'YYYY-MM-DD' string and every piece of arithmetic goes through
 * `src/lib/availability.ts`, whose "today" is Asia/Kolkata. A customer opening
 * the site from another timezone must see the same today as the owner
 * (§16.1 rule 4).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, diffDays, isValidDate, rentalDays, todayInIndia } from './availability';

const START_PARAM = 'start';
const END_PARAM = 'end';
const STORAGE_KEY = 'sv-dates';

/** Today's default rental length — reproduces the old `useState(3)` exactly. */
export const DEFAULT_RENTAL_DAYS = 3;

/** Beyond three months it isn't a car rental (§16.4 rule 6). */
export const MAX_RENTAL_DAYS = 90;

export interface DateRangeState {
  /** Always a valid 'YYYY-MM-DD', never in the past. */
  startDate: string;
  /** Always a valid 'YYYY-MM-DD', always > startDate. */
  endDate: string;
  /** rentalDays(startDate, endDate) — what the price is computed from. */
  days: number;
  setRange: (start: string, end: string) => void;
  /** Keeps startDate, moves endDate. Powers the day-preset buttons. */
  setDays: (days: number) => void;
  /** True while the customer hasn't chosen — no dates in the URL yet. */
  isDefault: boolean;
}

/**
 * Repair, never reject (§16.4 rule 4). A WhatsApp link shared three weeks ago
 * must still open a usable page rather than an error or an empty form.
 */
function normalize(rawStart: string | null, rawEnd: string | null): { start: string; end: string } {
  const today = todayInIndia();

  let start = isValidDate(rawStart) ? (rawStart as string) : today;
  if (start < today) start = today;

  let end = isValidDate(rawEnd) ? (rawEnd as string) : addDays(start, DEFAULT_RENTAL_DAYS);
  if (end <= start) end = addDays(start, 1);
  if (diffDays(start, end) > MAX_RENTAL_DAYS) end = addDays(start, MAX_RENTAL_DAYS);

  return { start, end };
}

function readStored(): { start: string | null; end: string | null } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { start: null, end: null };
    const parsed = JSON.parse(raw) as { start?: unknown; end?: unknown };
    const start = typeof parsed.start === 'string' ? parsed.start : null;
    const end = typeof parsed.end === 'string' ? parsed.end : null;
    return { start, end };
  } catch {
    return { start: null, end: null };
  }
}

function writeStored(start: string, end: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ start, end }));
  } catch {
    /* private mode — a remembered range is a nicety, not worth throwing over */
  }
}

export function useDateRange(): DateRangeState {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStart = searchParams.get(START_PARAM);
  const rawEnd = searchParams.get(END_PARAM);
  const hasParams = searchParams.has(START_PARAM) || searchParams.has(END_PARAM);

  const { start: startDate, end: endDate } = useMemo(
    () => normalize(rawStart, rawEnd),
    [rawStart, rawEnd],
  );

  const setRange = useCallback(
    (nextStart: string, nextEnd: string) => {
      const { start, end } = normalize(nextStart, nextEnd);
      writeStored(start, end);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(START_PARAM, start);
          next.set(END_PARAM, end);
          return next;
        },
        // `replace`: typing in a date field should not add a history entry per
        // keystroke, and the back button should still leave the page.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Restore a remembered range once, and only when the URL says nothing about
  // dates. A shared link always wins over a previous visit.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (hasParams) return;
    const stored = readStored();
    if (stored.start || stored.end) setRange(stored.start ?? '', stored.end ?? '');
  }, [hasParams, setRange]);

  // Write repaired values back so the URL a customer shares is the range he is
  // actually looking at — a stale `?start=` from last month would otherwise keep
  // saying one thing while the page shows another.
  useEffect(() => {
    if (!hasParams) return;
    if (rawStart === startDate && rawEnd === endDate) return;
    setRange(startDate, endDate);
  }, [hasParams, rawStart, rawEnd, startDate, endDate, setRange]);

  const setDays = useCallback(
    (days: number) => {
      const clamped = Math.min(MAX_RENTAL_DAYS, Math.max(1, Math.round(days)));
      setRange(startDate, addDays(startDate, clamped));
    },
    [startDate, setRange],
  );

  return {
    startDate,
    endDate,
    days: rentalDays(startDate, endDate),
    setRange,
    setDays,
    isDefault: !hasParams,
  };
}