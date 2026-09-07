/**
 * The customer's city selection (CONTRACT.md §15.2).
 *
 * This is UI state, not server state, so it lives here and not in React Query.
 * Two P05 surfaces read it — `HomePage`/`AvailableCars` and `AllCarsPage` — and
 * they must agree, which is what the four frozen rules below buy:
 *
 *  1. the URL owns it (`?cities=proddatur,kadapa`), so a filtered fleet is a
 *     shareable link — this client's customers pass links around on WhatsApp;
 *  2. it is mirrored to `localStorage['sv-cities']` and restored only when the
 *     URL carries no `cities` param, so a deep link always beats a memory;
 *  3. an unknown slug is ignored rather than an error — see
 *     `effectiveCitySelection`, because a city the owner deleted must never
 *     produce an empty page;
 *  4. "all selected" and "none selected" both mean "show everything".
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { citySlug } from './locationHelpers';

const PARAM = 'cities';
const STORAGE_KEY = 'sv-cities';

/** Deduplicated, slugified, order-preserving. Empty string entries are dropped. */
function parseSlugs(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const slug = citySlug(part);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function readStored(): string[] {
  try {
    return parseSlugs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode / disabled storage. A remembered filter is a nicety, not a
    // feature worth throwing over.
    return [];
  }
}

function writeStored(slugs: string[]): void {
  try {
    if (slugs.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, slugs.join(','));
  } catch {
    /* ignore — see readStored */
  }
}

export interface CityFilterState {
  /** Selected city slugs. Empty array = all cities. */
  selected: string[];
  setSelected: (slugs: string[]) => void;
  toggle: (slug: string) => void;
  clear: () => void;
}

export function useCityFilter(): CityFilterState {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(PARAM);
  const hasParam = searchParams.has(PARAM);

  const selected = useMemo(() => parseSlugs(raw), [raw]);

  const write = useCallback(
    (slugs: string[]) => {
      writeStored(slugs);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (slugs.length === 0) next.delete(PARAM);
          else next.set(PARAM, slugs.join(','));
          return next;
        },
        // `replace` on purpose: toggling pills should not fill the back button
        // with one entry per tap.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Restore a remembered choice exactly once, and only when the URL is silent
  // about cities. `?cities=` present but empty is an explicit "all cities" and
  // must not be overridden.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (hasParam) return;
    const stored = readStored();
    if (stored.length > 0) write(stored);
  }, [hasParam, write]);

  const toggle = useCallback(
    (slug: string) => {
      const clean = citySlug(slug);
      if (!clean) return;
      write(selected.includes(clean) ? selected.filter((s) => s !== clean) : [...selected, clean]);
    },
    [selected, write],
  );

  const clear = useCallback(() => write([]), [write]);

  return { selected, setSelected: write, toggle, clear };
}

/**
 * The selection actually worth filtering on, given the cities that exist.
 *
 * Two rules from §15.2 collapse into one function so every surface applies them
 * identically:
 *
 *  - unknown slugs are dropped (rule 3): the owner deleted Kadapa, and a stale
 *    `?cities=kadapa` link must show the fleet, not "0 cars";
 *  - a selection covering every city is the same as no selection (rule 4), which
 *    also keeps branch-less cars visible in that case (§15.5).
 */
export function effectiveCitySelection(
  selected: string[],
  options: { slug: string }[],
): string[] {
  if (selected.length === 0 || options.length === 0) return [];
  const known = new Set(options.map((o) => o.slug));
  const kept = selected.filter((slug) => known.has(slug));
  if (kept.length === 0 || kept.length >= options.length) return [];
  return kept;
}

/**
 * One city · 'A & B' · 'A, B & C'.
 *
 * Shared by `Hero` and `AllCarsPage`, both of which splice a city list into a
 * sentence that already existed. Returns '' for an empty list so callers can
 * drop the trailing place name rather than flash a placeholder.
 */
export function formatCityList(cities: string[]): string {
  if (cities.length === 0) return '';
  if (cities.length === 1) return cities[0];
  return `${cities.slice(0, -1).join(', ')} & ${cities[cities.length - 1]}`;
}