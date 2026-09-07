/**
 * /admin/availability — the fleet-wide availability calendar (CONTRACT.md §16.7).
 *
 * The owner's operational picture: eight cars, one month, one screen. He blocks
 * the dates a car is away here, and that is what makes "Available from 08 Sep"
 * appear on the customer's fleet card — the same `blocks` array, read by
 * `carAvailability()` on both sides (§16.2).
 *
 * Owned by P09. The route is registered by P00 in src/App.tsx behind
 * RequireAdmin; the sidebar and the dashboard belong to P04.
 *
 * ONE REQUEST PER MONTH, for the whole fleet — `useFleetAvailability(from, to)`
 * is called here and only here, and the rows receive their slice as a prop. A
 * hook inside a row would be N requests for N cars (§16.7).
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Menu, Plus } from 'lucide-react';
import AdminSidebar from '../components/admin/AdminSidebar';
import { BTN_PRIMARY } from '../components/admin/adminStyles';
import { EmptyState, Skeleton } from '@/src/components/ui';
import BlockEditor from '../components/admin/availability/BlockEditor';
import FleetCalendar, {
  CALENDAR_COLUMNS,
  CALENDAR_GRID_CLASSES,
  defaultBlockEnd,
  firstBlockableDay,
} from '../components/admin/availability/FleetCalendar';
import {
  currentMonth,
  formatSpan,
  groupBlocksByCar,
  mergePending,
  monthDays,
  monthLabel,
  monthRange,
  normalizeMonth,
  savingBlockIds,
  shiftMonth,
  type PendingOp,
} from '../components/admin/availability/monthGrid';
import {
  errorMessageOf,
  useBlockMutations,
} from '../components/admin/availability/useBlockMutations';
import { rangesOverlap, todayInIndia } from '@/src/lib/availability';
import { isConflictError, useCars, useFleetAvailability } from '@/src/hooks';
import type { AvailabilityBlockDTO, BlockInput, CarDTO } from '@/src/types/api';

interface EditorState {
  car: CarDTO;
  /** null = a new block. */
  block: AvailabilityBlockDTO | null;
  startDate: string;
  endDate: string;
  note: string;
}

export default function AdminAvailabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pending, setPending] = useState<PendingOp | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  // Today in INDIA, resolved once per mount — never `new Date()` in the
  // browser's zone (§16.1 r4).
  const today = useMemo(() => todayInIndia(), []);

  const month = normalizeMonth(searchParams.get('month'));
  const days = useMemo(() => monthDays(month), [month]);
  const { from, to } = useMemo(() => monthRange(month), [month]);

  const carsQuery = useCars();
  const availabilityQuery = useFleetAvailability(from, to);
  const mutations = useBlockMutations();

  const cars = carsQuery.data ?? [];
  const serverBlocks = availabilityQuery.data ?? [];

  // The optimistic view: what the owner sees the instant he releases a drag.
  const blocksByCar = useMemo(
    () => groupBlocksByCar(mergePending(serverBlocks, pending)),
    [serverBlocks, pending],
  );
  const savingIds = savingBlockIds(pending);

  function goToMonth(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set('month', next);
    // `replace` so a month-hopping owner doesn't have to press back nine times
    // to leave the page; the URL still carries the view for a reload or a share.
    setSearchParams(params, { replace: true });
  }

  /**
   * Turn a failed write into the owner's words.
   *
   * On a 409 the conflicting dates are named from data already on screen rather
   * than parsed out of the server's message, so the wording is stable whatever
   * P01 phrases it as. Adjacency (05→08 then 08→12) never lands here — it is
   * legal and the server accepts it (§16.1 r2).
   */
  function describeFailure(
    error: unknown,
    carId: string,
    startDate: string,
    endDate: string,
    ignoreBlockId: string | null,
  ): string {
    if (!isConflictError(error)) {
      return errorMessageOf(error) ?? 'Could not save. Check your connection and try again.';
    }
    const clash = serverBlocks.find(
      (block) =>
        block.carId === carId &&
        block.id !== ignoreBlockId &&
        rangesOverlap(startDate, endDate, block.startDate, block.endDate),
    );
    return clash
      ? `Already blocked ${formatSpan(clash.startDate, clash.endDate)}`
      : errorMessageOf(error) ?? 'Those dates are already blocked.';
  }

  /**
   * Hold the optimistic overlay until the refetched month actually contains the
   * change. P03's hooks invalidate on success but don't await the refetch, so
   * dropping the overlay the moment the mutation resolves un-shades the cell for
   * a frame — which looks exactly like a save that didn't stick, the one thing
   * this screen must never do. The refetch is already in flight; React Query
   * dedupes this call into it.
   */
  async function settle() {
    await availabilityQuery.refetch().catch(() => undefined);
  }

  async function createBlock(
    carId: string,
    startDate: string,
    endDate: string,
    note: string | null,
    options: { openEditorOnError: boolean },
  ) {
    const car = cars.find((candidate) => candidate.id === carId);
    if (!car) return;

    setEditorError(null);
    setPending({ kind: 'create', carId, startDate, endDate, note });
    try {
      await mutations.create(carId, { startDate, endDate, note });
      setEditor(null);
      await settle();
    } catch (error) {
      setEditorError(describeFailure(error, carId, startDate, endDate, null));
      if (options.openEditorOnError) {
        // A drag that hit a 409 has no dialog open yet. The owner's next action
        // is to adjust the dates, so put him in front of them (§16.7 / Task 3).
        setEditor({ car, block: null, startDate, endDate, note: note ?? '' });
      }
    } finally {
      // Rollback on failure, hand-off to the server data on success.
      setPending(null);
    }
  }

  async function handleSubmit(values: BlockInput) {
    if (!editor) return;
    const note = values.note ?? null;

    if (!editor.block) {
      await createBlock(editor.car.id, values.startDate, values.endDate, note, {
        openEditorOnError: false,
      });
      return;
    }

    const blockId = editor.block.id;
    setEditorError(null);
    setPending({ kind: 'update', id: blockId, startDate: values.startDate, endDate: values.endDate, note });
    try {
      await mutations.update(blockId, editor.car.id, { ...values, note });
      setEditor(null);
      await settle();
    } catch (error) {
      setEditorError(describeFailure(error, editor.car.id, values.startDate, values.endDate, blockId));
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    if (!editor?.block) return;
    const blockId = editor.block.id;

    setEditorError(null);
    setPending({ kind: 'delete', id: blockId });
    try {
      await mutations.remove(blockId, editor.car.id);
      setEditor(null);
      await settle();
    } catch (error) {
      setEditorError(errorMessageOf(error) ?? 'Could not delete those dates. Try again.');
    } finally {
      setPending(null);
    }
  }

  function openForBlock(block: AvailabilityBlockDTO) {
    const car = cars.find((candidate) => candidate.id === block.carId);
    if (!car) return;
    setEditorError(null);
    setEditor({
      car,
      block,
      startDate: block.startDate,
      endDate: block.endDate,
      note: block.note ?? '',
    });
  }

  function openForCar(carId: string) {
    const car = cars.find((candidate) => candidate.id === carId);
    if (!car) return;
    const start = firstBlockableDay(days, today);
    setEditorError(null);
    setEditor({ car, block: null, startDate: start, endDate: defaultBlockEnd(start), note: '' });
  }

  function openForDay(carId: string, start: string) {
    const car = cars.find((candidate) => candidate.id === carId);
    if (!car || start < today) return;
    setEditorError(null);
    setEditor({ car, block: null, startDate: start, endDate: defaultBlockEnd(start), note: '' });
  }

  const isLoading = carsQuery.isLoading || availabilityQuery.isLoading;
  const isError = carsQuery.isError || availabilityQuery.isError;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        // The car form lives on the dashboard (P04 owns it), so "Add New Car"
        // takes him there rather than opening a second copy of it here.
        onAddCar={() => navigate('/admin')}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {/* Mobile top bar — the same chrome as the dashboard (P04 owns that file). */}
        <div className="sticky top-0 z-40 -mx-4 -mt-4 mb-6 flex items-center justify-between border-b border-slate-800 bg-slate-950 p-4 text-white md:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
              <Menu className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-black tracking-tighter">Availability</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex size-11 items-center justify-center rounded-xl transition-colors hover:bg-slate-800 active:scale-95"
            aria-label="Open menu"
          >
            <Menu className="h-7 w-7" />
          </button>
        </div>

        <header className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Link
              to="/admin"
              className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-primary"
            >
              ← Fleet Management
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tighter text-primary md:text-3xl">
              Availability Calendar
            </h1>
            <p className="text-sm font-medium text-slate-500 md:text-base">
              Block the days each car is out. Customers see the date it comes back.
            </p>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-1 rounded-xl border border-slate-100 bg-white px-1.5 py-1.5 shadow-sm">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => goToMonth(shiftMonth(month, -1))}
                className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[8.5rem] text-center text-sm font-extrabold tracking-tighter text-slate-900">
                {monthLabel(month)}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => goToMonth(shiftMonth(month, 1))}
                className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-surface-container-low hover:text-primary active:scale-95"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => goToMonth(currentMonth())}
              disabled={month === currentMonth()}
              className="min-h-11 rounded-xl bg-primary/10 px-4 text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/15 active:scale-95 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-500 disabled:active:scale-100"
            >
              Today
            </button>
          </div>
        </header>

        {isError ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
            <AlertCircle className="h-8 w-8 text-tertiary-container" />
            <div>
              <p className="font-extrabold tracking-tighter text-slate-900">
                Couldn't load the calendar
              </p>
              <p className="text-sm font-medium text-slate-500">
                {errorMessageOf(carsQuery.error ?? availabilityQuery.error) ??
                  'The fleet data did not come back.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void carsQuery.refetch();
                void availabilityQuery.refetch();
              }}
              className={`${BTN_PRIMARY} min-h-11`}
            >
              Try again
            </button>
          </div>
        ) : isLoading ? (
          <CalendarSkeleton dayCount={days.length} rowCount={cars.length || 6} />
        ) : cars.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No cars yet"
            description="Add a car on the dashboard, then come back here to block the days it is out."
            variant="panel"
            className="border border-slate-100 bg-white shadow-sm"
            action={
              <Link
                to="/admin"
                className={`${BTN_PRIMARY} inline-flex min-h-11 items-center gap-2`}
              >
                <Plus className="h-4 w-4" />
                Go to the dashboard
              </Link>
            }
          />
        ) : (
          <FleetCalendar
            cars={cars}
            days={days}
            blocksByCar={blocksByCar}
            today={today}
            savingIds={savingIds}
            monthLabel={monthLabel(month)}
            isCurrentMonth={month === currentMonth()}
            onPreviousMonth={() => goToMonth(shiftMonth(month, -1))}
            onNextMonth={() => goToMonth(shiftMonth(month, 1))}
            onToday={() => goToMonth(currentMonth())}
            onCreate={(carId, startDate, endDate) =>
              void createBlock(carId, startDate, endDate, null, { openEditorOnError: true })
            }
            onEditBlock={openForBlock}
            onAddForCar={openForCar}
            onOpenDay={openForDay}
          />
        )}
      </main>

      {editor && (
        <BlockEditor
          key={editor.block?.id ?? `new-${editor.car.id}-${editor.startDate}`}
          car={editor.car}
          block={editor.block}
          initialStart={editor.startDate}
          initialEnd={editor.endDate}
          initialNote={editor.note}
          today={today}
          errorMessage={editorError}
          isSaving={pending !== null}
          onSubmit={(values) => void handleSubmit(values)}
          onDelete={() => void handleDelete()}
          onClose={() => {
            setEditor(null);
            setEditorError(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The same dimensions as the real grid, so nothing jumps when the data lands.
 * Six rows is a guess at the fleet size and is presented as a skeleton, not as
 * six cars — no invented rows reach the DOM as content.
 */
function CalendarSkeleton({ dayCount, rowCount }: { dayCount: number; rowCount: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
      <div
        className={`grid w-max ${CALENDAR_GRID_CLASSES}`}
        style={{
          gridTemplateColumns: `${CALENDAR_COLUMNS.NAME_COLUMN} repeat(${dayCount}, ${CALENDAR_COLUMNS.DAY_COLUMN})`,
        }}
        aria-hidden="true"
      >
        {Array.from({ length: rowCount + 1 }).map((_, row) =>
          Array.from({ length: dayCount + 1 }).map((__, column) => (
            <div
              key={`${row}-${column}`}
              className={`border-b border-r border-slate-100 ${row === 0 ? 'h-10' : 'h-24 md:h-20'}`}
            >
              {column === 0 && row > 0 && <Skeleton className="mx-3 mt-6 h-3 rounded-full" />}
            </div>
          )),
        )}
      </div>
      <p className="p-4 text-xs font-bold uppercase tracking-widest text-slate-500">
        Loading the fleet…
      </p>
    </div>
  );
}
