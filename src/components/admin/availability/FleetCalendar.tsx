/**
 * The fleet month grid (CONTRACT.md §16.7): cars down the left, every day of one
 * month across the top, one cell per car-day.
 *
 * All the pointer handling lives here rather than on the cells, because a drag
 * has to cross cells — and on touch the browser implicitly captures the pointer
 * to the element that received `pointerdown`, so `onPointerEnter` on siblings
 * never fires. Hit-testing with `elementFromPoint` is the one code path that
 * behaves identically for mouse, pen and finger.
 *
 * Owned by P09.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, rentalDays } from '@/src/lib/availability';
import { cn } from '@/src/lib/utils';
import type { AvailabilityBlockDTO, CarDTO } from '@/src/types/api';
import CalendarRow, { type RowSelection } from './CalendarRow';
import {
  blockFromSelection,
  dayMonth,
  isWeekend,
  selectableBounds,
  weekdayInitial,
} from './monthGrid';

/** Touch only: hold this long, without moving, to start selecting instead of panning. */
const LONG_PRESS_MS = 220;
/** Movement (px, taxicab) that turns an un-armed touch into a scroll, not a drag. */
const MOVE_TOLERANCE = 12;

const NAME_COLUMN = 'var(--calendar-name-column)';
const DAY_COLUMN = 'var(--calendar-day-column)';

interface DragState {
  pointerId: number;
  carId: string;
  /** The day the gesture started on — the selection pivots around it. */
  anchor: string;
  /** Clamps: the drag may not reach into the past or across a neighbouring block. */
  min: string;
  max: string;
  startX: number;
  startY: number;
  active: boolean;
  longPress: number | null;
}

interface FleetCalendarProps {
  cars: CarDTO[];
  /** Every day of the visible month, ascending. */
  days: string[];
  blocksByCar: Map<string, AvailabilityBlockDTO[]>;
  today: string;
  savingIds: ReadonlySet<string>;
  monthLabel: string;
  isCurrentMonth: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onCreate: (carId: string, startDate: string, endDate: string) => void;
  onEditBlock: (block: AvailabilityBlockDTO) => void;
  onAddForCar: (carId: string) => void;
  onOpenDay: (carId: string, day: string) => void;
}

export default function FleetCalendar({
  cars,
  days,
  blocksByCar,
  today,
  savingIds,
  monthLabel,
  isCurrentMonth,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onCreate,
  onEditBlock,
  onAddForCar,
  onOpenDay,
}: FleetCalendarProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectionRef = useRef<RowSelection | null>(null);
  const suppressClickRef = useRef<{ carId: string; day: string; until: number } | null>(null);
  const programmaticScrollRef = useRef(false);
  const [selection, setSelectionState] = useState<RowSelection | null>(null);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  // Window listeners are mounted once, so they read live props through this ref
  // instead of closing over the render they were created in.
  const latest = useRef({ days, blocksByCar, today, onCreate });
  latest.current = { days, blocksByCar, today, onCreate };

  const setSelection = (next: RowSelection | null) => {
    selectionRef.current = next;
    setSelectionState(next);
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (drag?.longPress !== null && drag?.longPress !== undefined) {
      window.clearTimeout(drag.longPress);
    }
    dragRef.current = null;
    setSelection(null);
  };

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      if (!drag.active) {
        // Still deciding. A finger that travels before the long press expires is
        // panning the grid sideways, which must keep working.
        const moved =
          Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
        if (moved > MOVE_TOLERANCE) endDrag();
        return;
      }

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cell = target?.closest<HTMLElement>('[data-day]');
      // Stay inside the row the gesture started in: a block belongs to one car.
      if (!cell || cell.dataset.car !== drag.carId || !cell.dataset.day) return;

      const day = cell.dataset.day;
      const clamped = day < drag.min ? drag.min : day > drag.max ? drag.max : day;
      const from = clamped < drag.anchor ? clamped : drag.anchor;
      const to = clamped < drag.anchor ? drag.anchor : clamped;

      const current = selectionRef.current;
      if (current && current.carId === drag.carId && current.from === from && current.to === to) {
        return;
      }
      setSelection({ carId: drag.carId, from, to });
    }

    function handleUp(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      const committed = drag.active ? selectionRef.current : null;
      endDrag();

      if (committed && committed.carId === drag.carId) {
        // THE CONVERSION (§16.1 r2): the owner selected `from`..`to` inclusive,
        // so the car is back the day after `to`. See monthGrid.ts.
        const { startDate, endDate } = blockFromSelection(committed.from, committed.to);
        suppressClickRef.current = {
          carId: drag.carId,
          day: drag.anchor,
          until: Date.now() + 500,
        };
        latest.current.onCreate(drag.carId, startDate, endDate);
      }
    }

    function handleCancel(event: PointerEvent) {
      if (dragRef.current && event.pointerId === dragRef.current.pointerId) endDrag();
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, []);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    setHasUserScrolled(false);
    programmaticScrollRef.current = true;

    const todayHeader = element.querySelector<HTMLElement>(`[data-day-header="${today}"]`);
    const nameHeader = element.querySelector<HTMLElement>('[data-name-column]');
    if (todayHeader && nameHeader) {
      const visibleDaysWidth = Math.max(0, element.clientWidth - nameHeader.offsetWidth);
      element.scrollLeft = Math.max(
        0,
        todayHeader.offsetLeft - nameHeader.offsetWidth - (visibleDaysWidth - todayHeader.offsetWidth) / 2,
      );
    } else {
      element.scrollLeft = 0;
    }

    const frame = window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [days, today]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    // React attaches touch listeners passively at the root, so `preventDefault`
    // from a JSX handler cannot stop the scroll. This one is non-passive and is
    // what actually keeps the page still while the owner drags a range.
    const stopScrolling = (event: TouchEvent) => {
      if (dragRef.current?.active) event.preventDefault();
    };
    element.addEventListener('touchmove', stopScrolling, { passive: false });
    return () => element.removeEventListener('touchmove', stopScrolling);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const cell = (event.target as HTMLElement).closest?.<HTMLElement>('[data-day]');
    // Only free, non-past cells start a drag. Blocked cells are buttons that
    // open the editor, and past cells are inert (§ "you cannot rewrite last
    // week by mis-dragging").
    if (!cell || cell.dataset.selectable !== 'true' || !cell.dataset.car || !cell.dataset.day) {
      return;
    }

    const carId = cell.dataset.car;
    const anchor = cell.dataset.day;
    const { min, max } = selectableBounds(
      latest.current.days,
      latest.current.blocksByCar.get(carId) ?? [],
      latest.current.today,
      anchor,
    );

    const drag: DragState = {
      pointerId: event.pointerId,
      carId,
      anchor,
      min,
      max,
      startX: event.clientX,
      startY: event.clientY,
      active: event.pointerType === 'mouse',
      longPress: null,
    };
    dragRef.current = drag;

    if (drag.active) {
      setSelection({ carId, from: anchor, to: anchor });
      return;
    }

    // Touch/pen: the same gesture also pans a 31-column grid, so a selection has
    // to announce itself. Hold still for a moment and the drag takes over.
    drag.longPress = window.setTimeout(() => {
      if (dragRef.current !== drag) return;
      drag.active = true;
      setSelection({ carId, from: anchor, to: anchor });
    }, LONG_PRESS_MS);
  }

  const preview = selection ? blockFromSelection(selection.from, selection.to) : null;
  const canAdd = days[days.length - 1] >= today;

  return (
    <>
      <div className="relative">
        <div
          ref={gridRef}
          onPointerDown={handlePointerDown}
          onClickCapture={(event) => {
            const suppressed = suppressClickRef.current;
            const cell = (event.target as HTMLElement).closest?.<HTMLElement>('[data-day]');
            if (
              suppressed &&
              Date.now() <= suppressed.until &&
              cell?.dataset.car === suppressed.carId &&
              cell.dataset.day === suppressed.day
            ) {
              event.preventDefault();
              event.stopPropagation();
              suppressClickRef.current = null;
            }
          }}
          onScroll={() => {
            if (!programmaticScrollRef.current) setHasUserScrolled(true);
          }}
          onContextMenu={(event) => {
            // A long press on Android otherwise raises the selection menu.
            if (dragRef.current?.active) event.preventDefault();
          }}
          style={{
            touchAction: selection ? 'none' : undefined,
            WebkitTouchCallout: 'none',
          } as React.CSSProperties}
          className="max-h-[70vh] select-none overflow-auto rounded-2xl border border-slate-100 bg-white shadow-card [--calendar-toolbar:5.25rem] md:[--calendar-toolbar:0px]"
        >
          <div className="sticky left-0 top-0 z-40 flex h-[5.25rem] w-[calc(100vw-2rem)] items-start justify-between gap-2 border-b border-slate-100 bg-white p-2 md:hidden">
            <div className="min-w-0 flex-1">
              <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={onPreviousMonth}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-sm font-extrabold tracking-tighter text-slate-900">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={onNextMonth}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 whitespace-nowrap text-xs font-medium text-slate-500">
                Tap a day · hold + drag for a range
              </p>
            </div>
            <button
              type="button"
              onClick={onToday}
              disabled={isCurrentMonth}
              className="min-h-11 shrink-0 rounded-xl bg-primary/10 px-3 text-xs font-bold uppercase tracking-widest text-primary transition-colors active:scale-95 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-500 disabled:active:scale-100"
            >
              Today
            </button>
          </div>

          <div
            className={`grid w-max ${CALENDAR_GRID_CLASSES}`}
            style={{ gridTemplateColumns: `${NAME_COLUMN} repeat(${days.length}, ${DAY_COLUMN})` }}
          >
            {/* Header: pinned corner + one column per day */}
            <div
              data-name-column
              className="sticky left-0 top-[var(--calendar-toolbar)] z-30 border-b border-r border-slate-100 bg-white px-3 py-2"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Car</p>
            </div>
            {days.map((day) => (
              <div
                key={day}
                data-day-header={day}
                className={cn(
                  'sticky top-[var(--calendar-toolbar)] z-20 border-b border-r border-slate-100 bg-white py-2 text-center',
                  isWeekend(day) && 'bg-surface-container-low',
                  day === today && 'border-x-2 border-primary bg-primary/5',
                )}
              >
                <p
                  className={cn(
                    'text-xs font-bold uppercase tracking-wider',
                    day === today ? 'text-primary' : 'text-slate-500',
                  )}
                >
                  {weekdayInitial(day)}
                </p>
                <p
                  className={cn(
                    'text-xs font-extrabold tracking-tighter',
                    day === today ? 'text-primary' : 'text-slate-700',
                  )}
                >
                  {day.slice(-2)}
                </p>
              </div>
            ))}

            {cars.map((car) => (
              <CalendarRow
                key={car.id}
                car={car}
                days={days}
                blocks={blocksByCar.get(car.id) ?? []}
                today={today}
                selection={selection}
                savingIds={savingIds}
                canAdd={canAdd}
                onEditBlock={onEditBlock}
                onAddForCar={onAddForCar}
                onOpenDay={onOpenDay}
              />
            ))}
          </div>
        </div>

        {!hasUserScrolled && (
          <div className="pointer-events-none absolute bottom-0 right-0 top-[5.25rem] w-16 rounded-r-2xl bg-gradient-to-l from-white via-white/70 to-transparent md:hidden">
            <span className="absolute right-1 top-14 whitespace-nowrap rounded-full bg-slate-900 px-2 py-1 text-xs font-bold text-white shadow-sm">
              Swipe →
            </span>
          </div>
        )}
      </div>

      {/* What the release will commit, where the owner is already looking. */}
      {preview && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg">
            {dayMonth(preview.startDate)} → {dayMonth(preview.endDate)}
            <span className="ml-2 font-medium text-slate-300">
              {rentalDays(preview.startDate, preview.endDate)} days out
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded border border-slate-200 bg-white" /> Free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-slate-400" /> Out
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded border border-primary bg-primary/5" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-slate-100" /> Off the road
        </span>
        <span className="hidden md:inline">Drag across a row to block · click a block to edit</span>
      </div>
    </>
  );
}

/** Re-exported so the page can size its loading skeleton like the real grid. */
export const CALENDAR_COLUMNS = { NAME_COLUMN, DAY_COLUMN };
export const CALENDAR_GRID_CLASSES =
  '[--calendar-name-column:9rem] [--calendar-day-column:2.75rem] md:[--calendar-name-column:11rem] md:[--calendar-day-column:2.25rem]';

/** Exposed for the page's "+ Block dates" default: the first day it may use. */
export function firstBlockableDay(days: string[], today: string): string {
  return days[0] > today ? days[0] : today;
}

/** The default end for a fresh block: one day out (§16.1 r2 — back tomorrow). */
export function defaultBlockEnd(start: string): string {
  return addDays(start, 1);
}
