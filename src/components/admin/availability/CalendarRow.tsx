/**
 * One car's row in the fleet month grid: the pinned name cell plus one cell per
 * day of the visible month.
 *
 * Renders only — every date question is answered by `src/lib/availability.ts`
 * (P00) or by `monthGrid.ts`, and the pointer handling lives one level up in
 * `FleetCalendar` so that a drag can cross cells without every cell owning a
 * listener.
 */

import { Fragment, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { addDays, availabilityLabel, carAvailability } from '@/src/lib/availability';
import { cn } from '@/src/lib/utils';
import type { AvailabilityBlockDTO, CarDTO } from '@/src/types/api';
import { blockForDay, dayMonth, isWeekend } from './monthGrid';

export interface RowSelection {
  carId: string;
  /** Both INCLUSIVE — these are grid days, not a stored block (see monthGrid). */
  from: string;
  to: string;
}

interface CalendarRowProps {
  car: CarDTO;
  days: string[];
  blocks: AvailabilityBlockDTO[];
  today: string;
  selection: RowSelection | null;
  savingIds: ReadonlySet<string>;
  /** False when the whole visible month is already in the past. */
  canAdd: boolean;
  onEditBlock: (block: AvailabilityBlockDTO) => void;
  onAddForCar: (carId: string) => void;
  onOpenDay: (carId: string, day: string) => void;
}

export default function CalendarRow({
  car,
  days,
  blocks,
  today,
  selection,
  savingIds,
  canAdd,
  onEditBlock,
  onAddForCar,
  onOpenDay,
}: CalendarRowProps) {
  // The status the CUSTOMER sees, derived from the master switch and the
  // calendar together (§16.2/§16.3) — never from `car.availability` alone.
  const status = carAvailability(car, today);
  const label = availabilityLabel(status);
  const masterOff = !car.availability;

  const cells = useMemo(
    () => days.map((day) => ({ day, block: blockForDay(blocks, day) })),
    [days, blocks],
  );

  return (
    <Fragment>
      {/* Pinned name column */}
      <div
        className={cn(
          'sticky left-0 z-10 flex min-h-24 flex-col justify-center gap-1.5 border-b border-r border-slate-100 px-2 py-2 md:px-3',
          masterOff ? 'bg-slate-100' : 'bg-white',
        )}
      >
        <p
          className="line-clamp-2 text-sm font-extrabold leading-tight tracking-tighter text-slate-900"
          title={car.name}
        >
          {car.name}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAddForCar(car.id)}
            disabled={!canAdd}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors hover:bg-primary/15 active:scale-95 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-slate-300 disabled:active:scale-100"
            aria-label={`Block dates for ${car.name}`}
          >
            <Plus className="h-5 w-5" />
          </button>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider',
              status.kind === 'available' ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white',
            )}
            title={label}
          >
            {label}
          </span>
          {masterOff && (
            <span
              className="truncate rounded-full bg-white px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200"
              title="Off the road indefinitely — set by the Available toggle on the dashboard, not by a dated block."
            >
              Off the road
            </span>
          )}
        </div>
      </div>

      {/* One cell per day */}
      {cells.map(({ day, block }) => {
        const past = day < today;
        const selected =
          selection !== null &&
          selection.carId === car.id &&
          day >= selection.from &&
          day <= selection.to;
        const saving = block !== null && savingIds.has(block.id);

        const shell = cn(
          'relative min-h-24 border-b border-r border-slate-100 transition-colors',
          isWeekend(day) && !block && 'bg-surface-container-low',
          masterOff && !block && 'bg-slate-100',
          day === today && 'border-x-2 border-primary bg-primary/5',
          past && 'opacity-40',
        );

        // The visual bar. A block's own cells shade slate — the same colour the
        // fleet cards already use for "Booked" (§16.3: no new colour).
        //
        // The bar is rounded on the block's first out day and on its LAST OUT
        // day, which is the day before `endDate` — the car is back on `endDate`
        // itself, so that cell is never part of the bar (§16.1 r2).
        const bar = block ? (
          <span
            className={cn(
              'pointer-events-none absolute inset-x-0 inset-y-6 bg-slate-400',
              day === block.startDate && 'rounded-l-md',
              addDays(day, 1) === block.endDate && 'rounded-r-md',
              saving && 'animate-pulse bg-slate-300',
            )}
          />
        ) : selected ? (
          <span className="pointer-events-none absolute inset-x-0 inset-y-6 rounded-md bg-primary/40" />
        ) : null;

        if (block && !past) {
          return (
            <button
              key={day}
              type="button"
              data-car={car.id}
              data-day={day}
              onClick={() => onEditBlock(block)}
              title={block.note ?? `Out ${dayMonth(block.startDate)}, back ${dayMonth(block.endDate)}`}
              aria-label={`${car.name}: blocked on ${dayMonth(day)}. Edit this block.`}
              className={cn(shell, 'cursor-pointer hover:bg-slate-50')}
            >
              {bar}
            </button>
          );
        }

        if (!past) {
          return (
            <button
              key={day}
              type="button"
              data-car={car.id}
              data-day={day}
              data-selectable="true"
              onClick={() => onOpenDay(car.id, day)}
              aria-label={`${car.name}: free on ${dayMonth(day)}. Block this day.`}
              className={cn(shell, 'cursor-pointer hover:bg-primary/5')}
            >
              {bar}
            </button>
          );
        }

        return (
          <div key={day} data-car={car.id} data-day={day} className={cn(shell, 'cursor-not-allowed')}>
            {bar}
          </div>
        );
      })}
    </Fragment>
  );
}
