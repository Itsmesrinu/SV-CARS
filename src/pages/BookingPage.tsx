import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import BookingSummaryContent from '../components/booking/BookingSummaryContent';
import ConciergeSidebarContent from '../components/booking/ConciergeSidebarContent';
import { EmptyState, Skeleton } from '@/src/components/ui';
import { useCar } from '@/src/hooks/useCars';
import { useSettings } from '@/src/hooks/useSettings';
import { isNotFoundError } from '@/src/lib/api';
import { addDays, todayInIndia } from '@/src/lib/availability';
import { useDateRange } from '@/src/lib/dateFilter';

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const carId = searchParams.get('carId') ?? undefined;
  const mode = (searchParams.get('mode') === 'driver' ? 'driver' : 'self') as 'self' | 'driver';

  const carQuery = useCar(carId);
  const settingsQuery = useSettings();
  const { startDate, endDate, days, setRange } = useDateRange();

  // Legacy links carried `?days=3`. Convert rather than 404 — those URLs are
  // sitting in WhatsApp threads and must still open a usable page.
  const legacyDays = Number(searchParams.get('days'));
  const hasRange = searchParams.has('start') || searchParams.has('end');
  useEffect(() => {
    if (hasRange || !Number.isFinite(legacyDays) || legacyDays < 1) return;
    const start = todayInIndia();
    setRange(start, addDays(start, legacyDays));
  }, [hasRange, legacyDays, setRange]);

  // The `carId` check comes first: `useCar(undefined)` is disabled, so it stays
  // `isPending` forever and a bare `/booking` would render the skeleton for good.
  if (carId && (carQuery.isPending || settingsQuery.isPending)) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-12">
        <Skeleton className="mb-6 h-11 w-40 rounded-xl" />
        <div className="grid items-start gap-6 md:gap-12 lg:grid-cols-12">
          <div className="min-w-0 space-y-6 lg:col-span-7">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-[34rem] w-full rounded-2xl md:h-80" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <Skeleton className="h-[42rem] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const car = carQuery.data;
  const settings = settingsQuery.data;

  // No silent fallback to cars[0]: showing the wrong car with the wrong price is
  // worse than saying we couldn't find it.
  if (!carId || !car || !settings) {
    // No `carId` in the URL is a genuine not-found. Otherwise match on `code`,
    // not `status === 404` — see `isNotFoundError`, which explains why a bare
    // 404 may be an infrastructure fault rather than a missing car.
    const notFound = !carId || isNotFoundError(carQuery.error);
    return (
      <EmptyState
        title={notFound ? 'Car Not Found' : 'Something Went Wrong'}
        description={
          notFound
            ? "The car you're looking for doesn't exist."
            : 'We could not load this booking right now. Please try again.'
        }
        action={
          notFound ? (
            <Link to="/all-cars" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-white">
              Browse All Cars
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                carQuery.refetch();
                settingsQuery.refetch();
              }}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-white"
            >
              Retry
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-12">
      {/* Breadcrumb / Back Navigation */}
      <div className="mb-6 md:mb-8">
        <Link
          to="/all-cars"
          className="group inline-flex min-h-11 items-center gap-2 rounded-xl pr-3 font-medium text-slate-500 transition-colors hover:text-primary active:text-primary"
        >
          <ArrowLeft aria-hidden="true" className="size-5 transition-transform group-hover:-translate-x-1" />
          <span>Back to all cars</span>
        </Link>
      </div>

      <div className="grid items-start gap-6 md:gap-12 lg:grid-cols-12">
        {/* Left Column: Booking Summary & Details */}
        <div className="min-w-0 lg:col-span-7">
          <BookingSummaryContent
            car={car}
            settings={settings}
            days={days}
            startDate={startDate}
            endDate={endDate}
            mode={mode}
          />
        </div>

        {/* Right Column: WhatsApp Interaction */}
        <div className="min-w-0 lg:col-span-5">
          <ConciergeSidebarContent
            car={car}
            settings={settings}
            days={days}
            startDate={startDate}
            endDate={endDate}
            mode={mode}
          />
        </div>
      </div>
    </div>
  );
}
