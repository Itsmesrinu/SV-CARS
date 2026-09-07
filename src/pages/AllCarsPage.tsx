import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CarFront, Filter, SearchX, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CarDTO } from '@/src/types/api';
import { useCars } from '@/src/hooks/useCars';
import { useLocations } from '@/src/hooks/useLocations';
import CarImage from '@/src/components/CarImage';
import CitySelector from '@/src/components/CitySelector';
import DateRangePicker from '@/src/components/DateRangePicker';
import { Chip, EmptyState, FleetCardSkeleton } from '@/src/components/ui';
import { bookedWindowLabel, conflictWindow, type ConflictWindow } from '@/src/lib/carCardStatus';
import { driveModes, filterCarsByCities, primaryImage } from '@/src/lib/carHelpers';
import { cityOptions } from '@/src/lib/locationHelpers';
import { effectiveCitySelection, formatCityList, useCityFilter } from '@/src/lib/cityFilter';
import { useDateRange } from '@/src/lib/dateFilter';
import {
  availabilityLabel,
  availableForRange,
  carAvailability,
  formatDate,
  nextFreeDate,
} from '@/src/lib/availability';
import {
  activeFilterCount,
  applyFleetFilters,
  DEFAULT_FILTERS,
  fleetFacets,
  type FleetFilters,
} from '@/src/lib/fleetFilters';

const PAGE_SIZE = 12;
const DRIVE_MODES: FleetFilters['driveMode'][] = ['all', 'self-drive', 'with-driver'];
const SORTS: FleetFilters['sort'][] = ['default', 'price-asc', 'price-desc', 'year-desc'];

interface FleetCarCardProps {
  car: CarDTO;
  dateQuery: string;
  servesRange: boolean;
  freeFrom: string | null;
  conflict: ConflictWindow | null;
}

function FleetCarCard({ car, dateQuery, servesRange, freeFrom, conflict }: FleetCarCardProps) {
  const status = carAvailability(car);
  // Effective availability for the SELECTED dates — a car free today but booked
  // across the chosen range is NOT available, so it must not get the green chip.
  const servesNow = status.kind === 'available' && servesRange;
  // Case B: the car is free today, but the chosen dates fall inside a FUTURE
  // booking. We show the taken window instead of a misleading countdown.
  const isConflict = conflict !== null;
  // The real calendar date the car comes back. Prefer the date derived from the
  // selected range; otherwise fall back to the car's own next-free date (from
  // today) so a booked card always shows an actual date.
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
  const category = car.carType ?? '';
  const specs = [
    car.fuel ? { icon: '⛽', value: car.fuel } : null,
    car.transmission ? { icon: '⚙️', value: car.transmission } : null,
    car.seating ? { icon: '👥', value: `${car.seating} Seats` } : null,
  ].filter((spec): spec is NonNullable<typeof spec> => spec !== null);

  return (
    <Link
      to={`/car/${car.id}${dateQuery}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow duration-300 hover:shadow-card"
    >
      <div className="relative h-32 overflow-hidden md:h-64">
        <CarImage
          image={primaryImage(car)}
          alt={car.name}
          sizes="(max-width: 768px) 50vw, 33vw"
          cldFit="auto"
          aspect={16 / 9}
          containerClassName="h-full w-full"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1 md:left-4 md:top-4">
          <Chip
            size="sm"
            tone={servesNow ? 'success' : 'neutral'}
            className={servesNow
              ? 'bg-emerald-500 text-white'
              : 'max-w-full whitespace-normal bg-slate-700/90 text-left leading-tight text-white'}
          >
            {statusLabel}
          </Chip>
          {laterLabel ? (
            <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              {laterLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className={`flex flex-grow flex-col p-3 md:p-6 ${!servesNow ? 'opacity-90' : ''}`}>
        <div className="mb-2 flex flex-col md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-sm font-extrabold leading-tight tracking-tighter text-primary md:text-xl">
              {car.name}
            </h2>
            <p className="mt-1 hidden text-xs font-bold uppercase tracking-widest text-slate-500 md:block">
              {[car.year || null, category || null].filter(Boolean).join(' • ')}
            </p>

          </div>
          <div className="mt-1 shrink-0 md:mt-0 md:text-right">
            {car.pricePerDay > 0 ? (
              <p className="text-base font-bold text-primary md:text-2xl">
                ₹{car.pricePerDay.toLocaleString()}
                <span className="ml-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  /day
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {(car.seating || car.fuel) ? (
          <div className="mb-3 flex flex-wrap gap-1.5 md:hidden">
            {car.seating ? <Chip size="sm">{car.seating} seats</Chip> : null}
            {car.fuel ? <Chip size="sm">{car.fuel}</Chip> : null}
          </div>
        ) : null}

        {car.description ? (
          <p className="my-4 hidden text-sm text-slate-500 line-clamp-2 md:block">{car.description}</p>
        ) : null}

        {specs.length > 0 ? (
          <div className="mb-6 hidden grid-cols-3 gap-2 md:grid">
            {specs.map((spec) => (
              <div key={spec.icon} className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-2">
                <span aria-hidden="true" className="text-sm font-bold text-primary">{spec.icon}</span>
                <span className="mt-1 text-xs font-bold uppercase text-slate-600">{spec.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-6 hidden flex-wrap gap-2 md:flex">
          {driveModes(car).map((driveType) => (
            <Chip key={driveType} size="sm">
              {driveType === 'self-drive' ? 'Self Drive' : 'With Driver'}
            </Chip>
          ))}
        </div>

        <span
          className={`mt-auto flex min-h-11 w-full items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-bold leading-tight transition-colors md:text-base ${
            servesNow || isConflict
              ? 'bg-primary text-white group-hover:bg-primary/90'
              : availableFrom
                ? 'bg-tertiary-container/10 text-tertiary-container group-hover:bg-tertiary-container/15'
                : 'bg-surface-container-low text-slate-600 group-hover:bg-slate-200'
          }`}
        >
          {servesNow
            ? <><span className="md:hidden">View Details</span><span className="hidden md:inline">View Details to Book</span></>
            : isConflict
              ? 'Choose other dates'
              : availableFrom
                ? `Free from ${formatDate(availableFrom)}`
                : availabilityLabel(status)}
        </span>
      </div>
    </Link>
  );
}

function FleetHero({ availableCount, cityPhrase, datesChosen }: {
  availableCount: number;
  cityPhrase: string;
  datesChosen: boolean;
}) {
  return (
    <section className="bg-surface-container-low px-4 py-6 md:px-6 md:py-16">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 md:flex-row md:items-end md:gap-6">
        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-primary md:mb-3">Exclusive collection</span>
          <h1 className="text-3xl font-extrabold tracking-tighter text-primary md:text-5xl">All Cars</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 md:mt-4 md:text-lg">Find the right car{cityPhrase} for your trip.</p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-primary md:text-4xl">{availableCount}</span>
          <span className="text-xs font-medium uppercase tracking-wider text-slate-600 md:text-sm">
            {datesChosen ? 'Available for your dates' : 'Vehicles available'}
          </span>
        </div>
      </div>
    </section>
  );
}

function useFleetFilterParams(): [FleetFilters, (update: Partial<FleetFilters> | FleetFilters) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo<FleetFilters>(() => {
    const drive = searchParams.get('drive');
    const sort = searchParams.get('sort');
    const seating = Number(searchParams.get('seating'));
    return {
      driveMode: DRIVE_MODES.includes(drive as FleetFilters['driveMode']) ? drive as FleetFilters['driveMode'] : 'all',
      availableNow: searchParams.get('available') === '1',
      model: searchParams.get('model') || null,
      fuel: searchParams.get('fuel') || null,
      seating: Number.isInteger(seating) && seating > 0 ? seating : null,
      sort: SORTS.includes(sort as FleetFilters['sort']) ? sort as FleetFilters['sort'] : 'default',
    };
  }, [query, searchParams]);

  const updateFilters = useCallback((update: Partial<FleetFilters> | FleetFilters) => {
    setSearchParams((previous) => {
      const nextFilters = { ...filters, ...update };
      const next = new URLSearchParams(previous);
      if (nextFilters.driveMode === 'all') next.delete('drive'); else next.set('drive', nextFilters.driveMode);
      if (nextFilters.availableNow) next.set('available', '1'); else next.delete('available');
      if (nextFilters.model) next.set('model', nextFilters.model); else next.delete('model');
      if (nextFilters.fuel) next.set('fuel', nextFilters.fuel); else next.delete('fuel');
      if (nextFilters.seating) next.set('seating', String(nextFilters.seating)); else next.delete('seating');
      if (nextFilters.sort === 'default') next.delete('sort'); else next.set('sort', nextFilters.sort);
      return next;
    }, { replace: true });
  }, [filters, setSearchParams]);

  return [filters, updateFilters];
}

const SELECT_CLASS = 'min-h-11 w-full rounded-xl border border-slate-200 bg-surface-container-low px-3 py-2 pr-8 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

function FilterSelects({ filters, cars, updateFilters, idPrefix, labelsVisible = false }: {
  filters: FleetFilters;
  cars: CarDTO[];
  updateFilters: (update: Partial<FleetFilters>) => void;
  idPrefix: string;
  labelsVisible?: boolean;
}) {
  const facets = useMemo(() => fleetFacets(cars), [cars]);
  const labelClass = labelsVisible ? 'mb-1 block text-xs font-bold uppercase tracking-widest text-slate-600' : 'sr-only';

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-model`}>Car model</label>
        <select id={`${idPrefix}-model`} className={SELECT_CLASS} value={filters.model ?? ''} onChange={(event) => updateFilters({ model: event.target.value || null })}>
          <option value="">All models</option>
          {facets.models.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-fuel`}>Fuel type</label>
        <select id={`${idPrefix}-fuel`} className={SELECT_CLASS} value={filters.fuel ?? ''} onChange={(event) => updateFilters({ fuel: event.target.value || null })}>
          <option value="">All fuel types</option>
          {facets.fuels.map((fuel) => <option key={fuel} value={fuel}>{fuel}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-seating`}>Seating</label>
        <select id={`${idPrefix}-seating`} className={SELECT_CLASS} value={filters.seating ?? ''} onChange={(event) => updateFilters({ seating: event.target.value ? Number(event.target.value) : null })}>
          <option value="">Any seating</option>
          {facets.seatings.map((seats) => <option key={seats} value={seats}>{seats} seats</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-sort`}>Sort by</label>
        <select id={`${idPrefix}-sort`} className={SELECT_CLASS} value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value as FleetFilters['sort'] })}>
          <option value="default">Recommended</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="year-desc">Year: newest</option>
        </select>
      </div>
    </div>
  );
}

function FleetFilterBar({ cars, filters, updateFilters, resultCount }: {
  cars: CarDTO[];
  filters: FleetFilters;
  updateFilters: (update: Partial<FleetFilters> | FleetFilters) => void;
  resultCount: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const filterCount = activeFilterCount(filters);

  useEffect(() => {
    if (!sheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [sheetOpen]);

  const clearAll = () => updateFilters(DEFAULT_FILTERS);

  return (
    <section className="sticky top-16 z-40 border-b border-slate-200 bg-white px-4 py-3 md:top-20 md:px-6 md:py-4">
      <div className="mx-auto max-w-7xl space-y-3">
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 no-scrollbar md:mx-0 md:overflow-visible md:px-0">
          <CitySelector className="shrink-0 pr-1" />
          <Chip selected={filters.availableNow} onClick={() => updateFilters({ availableNow: !filters.availableNow })}>
            <span aria-hidden="true" className={`mr-2 size-2 rounded-full ${filters.availableNow ? 'bg-white' : 'bg-emerald-500'}`} />
            Available now
          </Chip>
          <Chip selected={filters.driveMode === 'self-drive'} onClick={() => updateFilters({ driveMode: filters.driveMode === 'self-drive' ? 'all' : 'self-drive' })}>Self drive</Chip>
          <Chip selected={filters.driveMode === 'with-driver'} onClick={() => updateFilters({ driveMode: filters.driveMode === 'with-driver' ? 'all' : 'with-driver' })}>With driver</Chip>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <DateRangePicker className="w-full lg:max-w-xl" />
          <div className="hidden min-w-0 flex-1 md:block">
            <FilterSelects filters={filters} cars={cars} updateFilters={updateFilters} idPrefix="desktop-filter" />
          </div>
        </div>

        <div className="flex min-h-11 items-center justify-between gap-3">
          <p role="status" aria-atomic="true" className="text-sm font-semibold text-slate-700">{resultCount} {resultCount === 1 ? 'car' : 'cars'} found</p>
          <div className="flex items-center gap-2">
            {filterCount > 0 ? <button type="button" onClick={clearAll} className="min-h-11 px-2 text-xs font-bold text-primary active:scale-95">Clear all</button> : null}
            <button type="button" onClick={() => setSheetOpen(true)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-primary active:scale-95 md:hidden" aria-haspopup="dialog">
              <Filter aria-hidden="true" className="size-4" /> Filters
              {filterCount > 0 ? <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-white" aria-label={`${filterCount} active filters`}>{filterCount}</span> : null}
            </button>
          </div>
        </div>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-slate-950/50" onClick={() => setSheetOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="fleet-filter-title" className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-6 pt-4 shadow-lg pb-safe">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="fleet-filter-title" className="text-xl font-extrabold tracking-tighter text-primary">Filter the fleet</h2>
                <p className="mt-1 text-xs text-slate-600">Results update as you choose.</p>
              </div>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close filters" className="flex size-11 items-center justify-center rounded-full bg-surface-container-low text-slate-700 active:scale-95"><X aria-hidden="true" className="size-5" /></button>
            </div>
            <FilterSelects filters={filters} cars={cars} updateFilters={updateFilters} idPrefix="mobile-filter" labelsVisible />
            <div className="mt-6 flex gap-3">
              {filterCount > 0 ? <button type="button" onClick={clearAll} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold text-primary active:scale-95">Clear all</button> : null}
              <button type="button" onClick={() => setSheetOpen(false)} className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-bold text-white active:scale-95">Show {resultCount} {resultCount === 1 ? 'car' : 'cars'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AllCarsPage() {
  const { data: cars, isPending, isError, refetch } = useCars();
  const { data: locations } = useLocations();
  const { selected, clear: clearCities } = useCityFilter();
  const { startDate, endDate, isDefault } = useDateRange();
  const [filters, updateFilters] = useFleetFilterParams();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allCars = useMemo(() => cars ?? [], [cars]);
  const options = useMemo(() => cityOptions(locations ?? [], allCars), [locations, allCars]);
  const activeSelection = useMemo(() => effectiveCitySelection(selected, options), [selected, options]);
  const cityCars = useMemo(() => filterCarsByCities(allCars, activeSelection), [allCars, activeSelection]);
  const filteredCars = useMemo(() => applyFleetFilters(cityCars, filters), [cityCars, filters]);

  const ordered = useMemo(() => {
    const decorated = filteredCars.map((car) => {
      const status = carAvailability(car);
      const servesRange = availableForRange(car, startDate, endDate);
      const offTheRoad = status.kind === 'unavailable';
      const freeFrom = servesRange || offTheRoad ? null : nextFreeDate(car.blocks ?? [], startDate);
      // Case B: free today, chosen dates land in a future booking.
      const conflict = status.kind === 'available' && !servesRange
        ? conflictWindow(car.blocks ?? [], startDate, endDate)
        : null;
      return { car, servesRange, freeFrom, conflict };
    });
    return [...decorated.filter((entry) => entry.servesRange), ...decorated.filter((entry) => !entry.servesRange)];
  }, [filteredCars, startDate, endDate]);

  const resetSignature = `${activeSelection.join(',')}|${JSON.stringify(filters)}`;
  useEffect(() => setVisibleCount(PAGE_SIZE), [resetSignature]);

  const availableCount = ordered.filter((entry) => entry.servesRange).length;
  const cityNames = (activeSelection.length > 0 ? options.filter((option) => activeSelection.includes(option.slug)) : options).map((option) => option.city);
  const cityList = formatCityList(cityNames);
  const cityPhrase = cityList ? ` in ${cityList}` : '';
  const dateQuery = `?${new URLSearchParams({ start: startDate, end: endDate }).toString()}`;
  const filterCount = activeFilterCount(filters);
  const shownEntries = ordered.slice(0, visibleCount);

  return (
    <>
      <FleetHero availableCount={availableCount} cityPhrase={cityPhrase} datesChosen={!isDefault} />
      <FleetFilterBar cars={allCars} filters={filters} updateFilters={updateFilters} resultCount={ordered.length} />

      <section className="px-4 py-6 md:px-6 md:py-12">
        {isError ? (
          <EmptyState icon={AlertCircle} title="Couldn't load the fleet" description="Something went wrong fetching the cars. Please try again." action={<button type="button" onClick={() => void refetch()} className="min-h-11 rounded-xl bg-primary px-6 py-3 font-bold text-white active:scale-95">Retry</button>} />
        ) : isPending ? (
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <FleetCardSkeleton key={index} />)}
          </div>
        ) : allCars.length === 0 ? (
          <EmptyState icon={CarFront} title="No cars yet" description="The fleet is being updated. Please check back soon." />
        ) : cityCars.length === 0 && activeSelection.length > 0 ? (
          <EmptyState icon={CarFront} title="No cars in this city" description="Try another city, or browse the whole fleet." action={<button type="button" onClick={clearCities} className="min-h-11 rounded-xl bg-primary px-6 py-3 font-bold text-white active:scale-95">Show all cities</button>} />
        ) : ordered.length === 0 && filterCount > 0 ? (
          <EmptyState icon={SearchX} title="No cars match these filters" description="Clear the filters to see the full fleet again." action={<button type="button" onClick={() => updateFilters(DEFAULT_FILTERS)} className="min-h-11 rounded-xl bg-primary px-6 py-3 font-bold text-white active:scale-95">Clear filters</button>} />
        ) : (
          <>
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
              {shownEntries.map(({ car, servesRange, freeFrom, conflict }) => <FleetCarCard key={car.id} car={car} dateQuery={dateQuery} servesRange={servesRange} freeFrom={freeFrom} conflict={conflict} />)}
            </div>
            {visibleCount < ordered.length ? (
              <div className="mt-8 flex justify-center md:mt-12">
                <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="min-h-11 rounded-xl border border-primary px-6 py-3 text-sm font-bold text-primary active:scale-95">Load more</button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
