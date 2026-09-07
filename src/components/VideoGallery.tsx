import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import CarImage from '@/src/components/CarImage';
import { SectionHeading, Skeleton } from '@/src/components/ui';
import { useCars } from '@/src/hooks/useCars';
import { useLocations } from '@/src/hooks/useLocations';
import { filterCarsByCities } from '@/src/lib/carHelpers';
import { effectiveCitySelection, useCityFilter } from '@/src/lib/cityFilter';
import { cityOptions } from '@/src/lib/locationHelpers';

const SECTION_CLASS = 'bg-surface-container-low py-12 md:py-24';

export default function VideoGallery() {
  const { data, isPending } = useCars();
  const { data: locations } = useLocations();
  const { selected } = useCityFilter();

  const gallery = useMemo(() => {
    const allCars = data ?? [];
    const options = cityOptions(locations ?? [], allCars);
    const scoped = filterCarsByCities(allCars, effectiveCitySelection(selected, options));
    const cars = scoped.length > 0 ? scoped : allCars;

    return cars
      .flatMap((car) =>
        car.images
          .filter((image) => !image.isPrimary)
          .map((image) => ({ car, image })),
      )
      .slice(0, 4);
  }, [data, locations, selected]);

  if (!isPending && gallery.length === 0) {
    // TODO: Render this slot again when the fleet has secondary photos, or when
    // the owner provides a videos table / curated Instagram embed.
    return null;
  }

  return (
    <section className={SECTION_CLASS}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Real fleet photos"
          title="A Closer Look"
          subtitle="Explore more views of the cars currently listed in our fleet."
          align="center"
        />

        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-12 no-scrollbar md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:pr-0">
          {isPending
            ? Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="aspect-[4/3] w-full min-w-[72%] rounded-2xl md:min-w-0" />
              ))
            : gallery.map(({ car, image }, index) => (
                <Link
                  key={image.id}
                  to={`/car/${car.id}`}
                  aria-label={`View ${car.name}`}
                  className="group min-w-[72%] snap-center overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-card active:scale-[0.98] md:min-w-0"
                >
                  <CarImage
                    image={image}
                    alt={image.alt ?? `${car.name} — ${image.kind}`}
                    sizes="(max-width: 767px) 72vw, 25vw"
                    cldFit="auto"
                    aspect={4 / 3}
                    priority={index === 0}
                    containerClassName="w-full"
                    className="transition-transform duration-300 group-hover:scale-105"
                  />
                  <p className="truncate px-3 py-3 text-sm font-bold text-slate-900">{car.name}</p>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}
