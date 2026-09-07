import { ChevronLeft, ChevronRight, ExternalLink, Fuel, Settings, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import CarImage from '@/src/components/CarImage';
import { Chip, EmptyState, SectionHeading, Skeleton } from '@/src/components/ui';
import { useCars } from '@/src/hooks/useCars';
import { useLocations } from '@/src/hooks/useLocations';
import {
  availabilityLabel,
  availableForRange,
  carAvailability,
  formatDate,
  nextFreeDate,
} from '@/src/lib/availability';
import { bookedWindowLabel, conflictWindow, type ConflictWindow } from '@/src/lib/carCardStatus';
import { filterCarsByCities, primaryImage } from '@/src/lib/carHelpers';
import { effectiveCitySelection, useCityFilter } from '@/src/lib/cityFilter';
import { useDateRange } from '@/src/lib/dateFilter';
import { cityOptions } from '@/src/lib/locationHelpers';
import { cn } from '@/src/lib/utils';
import type { CarDTO } from '@/src/types/api';

/** The whole car card is a link, so it can carry motion — see CarCard below. */
const MotionLink = motion.create(Link);

interface CarCardProps {
  car: CarDTO;
  dateQuery: string;
  servesRange: boolean;
  freeFrom: string | null;
  conflict: ConflictWindow | null;
  priority: boolean;
}

function CarCard({ car, dateQuery, servesRange, freeFrom, conflict, priority }: CarCardProps) {
  // Derived from the master switch AND the calendar — never the raw boolean.
  const status = carAvailability(car);
  // Effective availability for the SELECTED dates — a car free today but booked
  // across the chosen range is NOT available, so it must not get the green chip.
  const servesNow = status.kind === 'available' && servesRange;
  // Case B: the car is free today, but the chosen dates fall inside a FUTURE
  // booking. We show the taken window instead of a misleading countdown.
  const isConflict = conflict !== null;
  // A booked car has a real return date, so invite the visitor to reserve it for
  // later instead of just showing a dead-end "View Details".
  const availableFrom = freeFrom ?? (status.kind === 'booked' ? status.until : null);
  // Every unavailable state speaks the SAME "Booked …" language so the fleet
  // reads as one system: Case B shows the clashing window, an in-use car shows
  // when it comes back, an off-road car falls back to the frozen "Booked" word.
  const statusLabel = servesNow
    ? 'Available'
    : isConflict
      ? `Booked ${bookedWindowLabel(conflict.from, conflict.to)}`
      : availableFrom
        ? `Booked till ${formatDate(availableFrom)}`
        : availabilityLabel(status);
  // Green reassurance pill: "book later" when the car itself returns later,
  // "available other dates" when only the chosen dates clash.
  const laterLabel = servesNow
    ? null
    : isConflict
      ? 'Available other dates'
      : availableFrom
        ? 'Book for later dates'
        : null;
  const price = car.pricePerDay > 0 ? `₹${car.pricePerDay.toLocaleString()}` : '';

  const specs = [
    car.transmission ? { key: 'transmission', icon: Settings, value: car.transmission } : null,
    car.fuel ? { key: 'fuel', icon: Fuel, value: car.fuel } : null,
    car.seating ? { key: 'seats', icon: Users, value: `${car.seating} Seats` } : null,
  ].filter((spec): spec is NonNullable<typeof spec> => spec !== null);

  return (
    <MotionLink
      to={`/car/${car.id}${dateQuery}`}
      whileHover={{ y: -5 }}
      className="group/card block min-w-[80%] snap-center overflow-hidden rounded-2xl border border-slate-100 bg-surface-container-low shadow-sm transition-shadow duration-300 hover:shadow-card sm:min-w-[400px]"
    >
      <div className="relative h-48 overflow-hidden md:h-64">
        <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-col items-start gap-1.5">
          <Chip
            tone={servesNow ? 'success' : 'neutral'}
            size="sm"
            className={cn(
              'shadow-sm',
              servesNow
                ? 'bg-emerald-500 text-white'
                : 'max-w-full whitespace-normal bg-slate-700/90 text-left leading-tight text-white',
            )}
          >
            {statusLabel}
          </Chip>
          {laterLabel ? (
            <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              {laterLabel}
            </span>
          ) : null}
        </div>
        <CarImage
          image={primaryImage(car)}
          alt={car.name}
          sizes="(max-width: 640px) 80vw, 400px"
          cldFit="auto"
          aspect={16 / 9}
          priority={priority}
          containerClassName="h-full w-full"
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
        />
      </div>
      <div className="p-5 md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">{car.name}</h3>
          {price ? (
            <div className="shrink-0 text-right">
              <p className="text-lg font-black text-primary">{price}</p>
              <p className="text-xs font-medium uppercase text-slate-500">per day</p>
            </div>
          ) : null}
        </div>
        {specs.length > 0 ? (
          <div className="mb-5 grid grid-cols-3 gap-2 md:mb-6">
            {specs.map((spec) => (
              <div key={spec.key} className="flex min-w-0 flex-col items-center rounded-xl bg-white p-2 text-center">
                <spec.icon aria-hidden="true" className="mb-1 size-[18px] shrink-0 text-primary" />
                <span className="max-w-full truncate text-xs font-semibold uppercase text-slate-600">
                  {spec.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <span
          className={cn(
            'flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm transition-colors md:text-base',
            servesNow || isConflict
              ? 'bg-primary text-white group-hover/card:bg-primary/90'
              : availableFrom
                ? 'bg-tertiary-container/10 text-tertiary-container group-hover/card:bg-tertiary-container/15'
                : 'bg-surface-container-low text-slate-600 group-hover/card:bg-slate-200',
          )}
        >
          {servesNow
            ? 'View Details'
            : isConflict
              ? 'Choose other dates'
              : availableFrom
                ? `Free from ${formatDate(availableFrom)}`
                : availabilityLabel(status)}
        </span>
      </div>
    </MotionLink>
  );
}

/** Matches the card's mobile image box and body so nothing shifts on load. */
function CarCardSkeleton() {
  return (
    <div className="min-w-[80%] snap-center overflow-hidden rounded-2xl border border-slate-100 bg-surface-container-low shadow-sm sm:min-w-[400px]">
      <Skeleton className="h-48 w-full rounded-none md:h-64" />
      <div className="p-5 md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <Skeleton className="h-6 w-36 rounded-xl" />
          <Skeleton className="h-6 w-20 rounded-xl" />
        </div>
        <div className="mb-5 grid grid-cols-3 gap-2 md:mb-6">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function AvailableCars() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { data, isPending } = useCars();
  const { data: locations } = useLocations();
  const { selected } = useCityFilter();
  const { startDate, endDate } = useDateRange();

  const dateQuery = `?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;
  const allCars = useMemo(() => data ?? [], [data]);

  const cars = useMemo(() => {
    const options = cityOptions(locations ?? [], allCars);
    const active = effectiveCitySelection(selected, options);
    const filtered = filterCarsByCities(allCars, active);
    // On the home page a blank rail reads as a broken site, and the picker is
    // right above it — so fall back to the whole fleet rather than show nothing.
    return filtered.length > 0 ? filtered : allCars;
  }, [allCars, locations, selected]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [cars]);

  const scrollToIndex = (nextIndex: number) => {
    const rail = scrollRef.current;
    if (!rail || cars.length === 0) return;
    const bounded = Math.max(0, Math.min(nextIndex, cars.length - 1));
    const card = rail.children.item(bounded) as HTMLElement | null;
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    setActiveIndex(bounded);
  };

  const syncActiveIndex = () => {
    const rail = scrollRef.current;
    if (!rail || rail.children.length === 0) return;
    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    Array.from(rail.children).forEach((child, index) => {
      const card = child as HTMLElement;
      const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - railCenter);
      if (distance < closestDistance) {
        closest = index;
        closestDistance = distance;
      }
    });
    setActiveIndex(closest);
  };

  return (
    <section id="available-cars" className="overflow-hidden bg-white py-12 md:py-24">
      <div className="group relative mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Premium Selection"
          title="Available Cars"
          action={(
            <Link
              to={`/all-cars${dateQuery}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-bold text-primary hover:underline active:scale-95"
            >
              View All <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          )}
        />

        {cars.length === 0 && !isPending ? (
          <EmptyState
            title="Cars will appear here soon"
            description="Please check back for the latest fleet availability."
            variant="panel"
            className="bg-surface-container-low"
          />
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              aria-label="Show previous car"
              disabled={activeIndex === 0}
              className="absolute -left-2 top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-40 md:flex"
            >
              <ChevronLeft aria-hidden="true" className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              aria-label="Show next car"
              disabled={activeIndex >= cars.length - 1}
              className="absolute -right-2 top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-40 md:flex"
            >
              <ChevronRight aria-hidden="true" className="size-6" />
            </button>

            <div
              ref={scrollRef}
              onScroll={syncActiveIndex}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-5 pr-8 no-scrollbar md:gap-6 md:pb-6 md:pr-0"
            >
              {isPending
                ? Array.from({ length: 3 }).map((_, index) => <CarCardSkeleton key={index} />)
                : cars.map((car, index) => {
                    const status = carAvailability(car);
                    const servesRange = availableForRange(car, startDate, endDate);
                    const offTheRoad = status.kind === 'unavailable';
                    const freeFrom = servesRange || offTheRoad
                      ? null
                      : nextFreeDate(car.blocks ?? [], startDate);
                    // Case B: free today, chosen dates land in a future booking.
                    const conflict = status.kind === 'available' && !servesRange
                      ? conflictWindow(car.blocks ?? [], startDate, endDate)
                      : null;
                    return (
                      <CarCard
                        key={car.id}
                        car={car}
                        dateQuery={dateQuery}
                        servesRange={servesRange}
                        conflict={conflict}
                        freeFrom={freeFrom}
                        priority={index === 0}
                      />
                    );
                  })}
            </div>

            {!isPending && cars.length > 1 ? (
              <div
                aria-live="polite"
                className="flex items-center justify-center gap-3 text-xs font-bold text-slate-600"
              >
                <span>{activeIndex + 1} / {cars.length}</span>
                <div aria-hidden="true" className="flex gap-1.5">
                  {cars.map((car, index) => (
                    <span
                      key={car.id}
                      className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-5 bg-primary' : 'w-1.5 bg-slate-300'}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
