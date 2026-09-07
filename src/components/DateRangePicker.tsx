/**
 * Start/end date fields (CONTRACT.md §16.5).
 *
 * Native `<input type="date">` on purpose: no date library is installed, Wave 1
 * may not add dependencies, and the native control gives a real mobile picker
 * for free — which matters, because this client's traffic is mostly phones.
 *
 * The conflict warning never blocks the WhatsApp CTA. An enquiry about a car
 * that is out until the 12th is still a lead, and the owner would rather receive
 * it than lose it (§16.4 rule 5).
 *
 * Styling comes from the existing filter-bar selects and day-preset buttons.
 */

import { AlertTriangle } from 'lucide-react';

import type { CarDTO } from '@/src/types/api';
import {
  addDays,
  formatDate,
  isBlocked,
  todayInIndia,
} from '@/src/lib/availability';
import { bookedWindowLabel, conflictWindow, firstFreeStart } from '@/src/lib/carCardStatus';
import { MAX_RENTAL_DAYS, useDateRange } from '@/src/lib/dateFilter';

const FIELD =
  'min-h-11 min-w-0 w-full bg-surface-container-low border border-slate-200 rounded-xl text-xs md:text-sm font-semibold px-3 py-2 md:px-4 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer';
const LABEL = 'mb-1 block text-xs font-bold uppercase tracking-widest text-slate-600';

interface DateRangePickerProps {
  car?: CarDTO;
  className?: string;
}

export default function DateRangePicker({ car, className = '' }: DateRangePickerProps) {
  const { startDate, endDate, days, setRange } = useDateRange();
  const today = todayInIndia();

  const blocks = car?.blocks ?? [];
  const conflicts = Boolean(car) && isBlocked(blocks, startDate, endDate);
  // Name the booking the customer collided with, so the warning is specific.
  const conflict = conflicts ? conflictWindow(blocks, startDate, endDate) : null;
  // The earliest start where the WHOLE rental fits — not just a free first day,
  // or the shift can leave the tail inside a later booking (the old bug).
  const freeStart = conflicts ? firstFreeStart(blocks, startDate, days) : null;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 md:gap-3">
        <div className="min-w-0">
          <label className={LABEL} htmlFor="rental-start-date">
            Start date
          </label>
          <input
            id="rental-start-date"
            type="date"
            className={FIELD}
            value={startDate}
            min={today}
            onChange={(e) => setRange(e.target.value, endDate)}
          />
        </div>
        <div className="min-w-0">
          <label className={LABEL} htmlFor="rental-end-date">
            End date
          </label>
          <input
            id="rental-end-date"
            type="date"
            className={FIELD}
            value={endDate}
            min={addDays(startDate, 1)}
            onChange={(e) => setRange(startDate, e.target.value)}
          />
        </div>
        <div className="flex min-h-11 shrink-0 items-center">
          <p className="whitespace-nowrap text-xs font-bold text-slate-900 md:text-base">
            {days} {days > 1 ? 'Days' : 'Day'}
          </p>
        </div>
      </div>

      {days >= MAX_RENTAL_DAYS && (
        <p className="text-xs text-slate-500">
          Rentals are capped at {MAX_RENTAL_DAYS} days. Message us on WhatsApp for anything longer.
        </p>
      )}

      {conflicts && conflict && freeStart && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border-l-4 border-tertiary-container bg-tertiary-container/5 p-3 md:p-4"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-tertiary-container"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-bold text-tertiary-container">
              These dates are already booked
            </p>
            <p className="text-xs leading-relaxed text-slate-700 md:text-sm">
              This car is booked{' '}
              <span className="font-bold text-slate-900">
                {bookedWindowLabel(conflict.from, conflict.to)}
              </span>
              , which overlaps your dates. The earliest free {days} {days > 1 ? 'days' : 'day'}{' '}
              window starts{' '}
              <span className="font-bold text-slate-900">{formatDate(freeStart)}</span>. Pick free
              dates below, or send an enquiry on WhatsApp anyway.
            </p>
            <button
              type="button"
              onClick={() => setRange(freeStart, addDays(freeStart, days))}
              className="min-h-11 rounded-full bg-tertiary-container px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 active:scale-95"
            >
              Use free dates from {formatDate(freeStart)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
