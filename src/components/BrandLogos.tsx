import { Car, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import CarImage from '@/src/components/CarImage';
import { Skeleton } from '@/src/components/ui';
import { useCars } from '@/src/hooks/useCars';
import { useLocations } from '@/src/hooks/useLocations';
import { carAvailability } from '@/src/lib/availability';
import { filterCarsByCities, primaryImage } from '@/src/lib/carHelpers';
import { effectiveCitySelection, useCityFilter } from '@/src/lib/cityFilter';
import { cityOptions } from '@/src/lib/locationHelpers';

const SECTION_CLASS = 'bg-surface-container-low/50 py-12 md:py-24';

/** Matches the horizontally scrolling fleet strip so nothing shifts on load. */
function BrandLogosSkeleton() {
  return (
    <section className={SECTION_CLASS}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mb-5 flex items-center justify-between">
          <Skeleton className="h-5 w-36 rounded-xl" />
          <Skeleton className="h-5 w-20 rounded-xl" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 min-w-56 rounded-2xl" />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function BrandLogos() {
  const { data, isPending } = useCars();
  const { data: locations } = useLocations();
  const { selected } = useCityFilter();

  const availableCars = useMemo(() => {
    const all = data ?? [];
    const options = cityOptions(locations ?? [], all);
    const scoped = filterCarsByCities(all, effectiveCitySelection(selected, options));
    // Same fallback as the carousel below it: an empty strip on the home page
    // reads as a broken site, so a filter that matches nothing shows the fleet.
    const inScope = scoped.length > 0 ? scoped : all;
    // Derived from the master switch AND the calendar — never the raw boolean,
    // otherwise a car that is out until Friday is listed as "Available".
    return inScope.filter((car) => carAvailability(car).kind === 'available');
  }, [data, locations, selected]);

  if (isPending) return <BrandLogosSkeleton />;

  if (availableCars.length === 0) {
    return (
      <section className={SECTION_CLASS}>
        <div className="mx-auto max-w-7xl px-4 text-center md:px-6">
          <p className="text-sm font-medium text-slate-600">
            No cars are available at the moment. Please check back soon.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={SECTION_CLASS}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Car aria-hidden="true" className="size-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Available now</h2>
          </div>
          <Link
            to="/all-cars"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-bold text-primary hover:underline active:scale-95"
          >
            View All <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-8 no-scrollbar">
          {availableCars.map((car) => (
            <Link
              key={car.id}
              to={`/car/${car.id}`}
              className="flex min-h-20 min-w-56 snap-start items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition-shadow hover:shadow-card active:scale-[0.98]"
            >
              <CarImage
                image={primaryImage(car)}
                alt={car.name}
                sizes="56px"
                cldFit="auto"
                aspect={1}
                containerClassName="size-14 shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{car.name}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Available
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
