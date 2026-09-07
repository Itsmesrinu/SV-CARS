/**
 * The customer's city picker.
 *
 * The single most important line in this file is the `<= 1` check: with one
 * active office every customer page renders exactly as it did before the
 * multi-city work. The picker appears only when the owner adds a second city.
 */

import { Chip } from '@/src/components/ui';
import { useCars } from '@/src/hooks/useCars';
import { useLocations } from '@/src/hooks/useLocations';
import { useCityFilter } from '@/src/lib/cityFilter';
import { cityOptions } from '@/src/lib/locationHelpers';

interface CitySelectorProps {
  className?: string;
}

export default function CitySelector({ className = '' }: CitySelectorProps) {
  const { data: locations } = useLocations();
  const { data: cars } = useCars();
  const { selected, toggle, clear } = useCityFilter();

  const options = cityOptions(locations ?? [], cars ?? []);

  // One city (or none, or still loading) → today's UI, untouched.
  if (options.length <= 1) return null;

  const known = new Set(options.map((option) => option.slug));
  const active = selected.filter((slug) => known.has(slug));
  // Selecting every city is the same as selecting none, so "All cities" lights
  // up in both cases rather than leaving no pill selected.
  const allActive = active.length === 0 || active.length >= options.length;

  return (
    <div
      className={`-mx-1 flex items-center gap-2 overflow-x-auto p-1 no-scrollbar md:gap-4 ${className}`.trim()}
    >
      <Chip onClick={clear} selected={allActive} className="shrink-0">
        All cities
      </Chip>
      {options.map((option) => {
        const isOn = !allActive && active.includes(option.slug);
        return (
          <Chip
            key={option.slug}
            onClick={() => toggle(option.slug)}
            selected={isOn}
            className="shrink-0"
          >
            {option.city} ({option.carCount})
          </Chip>
        );
      })}
    </div>
  );
}
