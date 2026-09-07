/**
 * Loading skeletons — the shapes P04 and P05 drop in while a query is pending.
 *
 * Owned by P03. Two rules govern this file:
 *
 * 1. **No new visual styles.** docs/design-system.md forbids them, and a
 *    skeleton is not an exemption. Everything here uses tokens and radii that
 *    already exist in the app: `bg-surface-container-low`, `bg-slate-100`,
 *    `rounded-xl`, `rounded-2xl`, `border-slate-100`.
 * 2. **The skeleton must be the same size as the thing it stands in for.** A
 *    skeleton of the wrong height causes exactly the layout shift the loading
 *    state exists to prevent — the content lands and everything below it jumps.
 *    So `FleetCardSkeleton` mirrors `AllCarsPage.tsx`'s card (`h-28 md:h-64`
 *    image, `p-2.5 md:p-6` body) and `CarDetailSkeleton` mirrors
 *    `CarDetailsPage.tsx`'s `aspect-[16/9] md:aspect-[21/9]` gallery, measurement
 *    for measurement.
 */

import type { JSX } from 'react';

import { cn } from '@/src/lib/utils';

export interface SkeletonProps {
  className?: string;
}

/** The base pulse block. Everything else here is composed from it. */
export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse bg-surface-container-low rounded-lg', className)}
    />
  );
}

/**
 * Stands in for one `FleetCarCard`. Dimensions copied from
 * `src/pages/AllCarsPage.tsx`: the card chrome, the `h-28 md:h-64` image block,
 * then the `p-2.5 md:p-6` body with the mobile-hidden sections omitted exactly
 * as the real card hides them.
 */
export function FleetCardSkeleton(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="bg-white rounded-xl shadow-sm flex flex-col overflow-hidden border border-slate-100"
    >
      <div className="h-28 md:h-64 bg-surface-container-low animate-pulse" />

      <div className="p-2.5 md:p-6 flex flex-col flex-grow">
        {/* Name + price row */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-1 md:mb-2 gap-1 md:gap-4">
          <div className="min-w-0 flex-1 space-y-1 md:space-y-2">
            <Skeleton className="h-3 md:h-5 w-3/4" />
            <Skeleton className="hidden md:block h-3 w-1/2" />
          </div>
          <Skeleton className="h-3.5 md:h-6 w-16 md:w-24 shrink-0" />
        </div>

        {/* Description — hidden on mobile, like the real card */}
        <div className="hidden md:block space-y-2 my-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>

        {/* Specs grid — hidden on mobile */}
        <div className="hidden md:grid grid-cols-3 gap-2 mb-6">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>

        {/* CTA */}
        <Skeleton className="mt-auto h-7 md:h-12 w-full rounded-lg md:rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Stands in for the car detail gallery: the `aspect-[16/9] md:aspect-[21/9]`
 * main frame plus the `w-32 md:w-44 aspect-video` thumbnail strip, both from
 * `src/pages/CarDetailsPage.tsx`.
 */
export function CarDetailSkeleton(): JSX.Element {
  return (
    <div aria-hidden="true" className="space-y-4">
      <Skeleton className="w-full aspect-[16/9] md:aspect-[21/9] rounded-2xl" />

      <div className="flex gap-4 overflow-hidden pb-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="flex-shrink-0 w-32 md:w-44 aspect-video rounded-xl" />
        ))}
      </div>

      {/* Title + price block below the gallery */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-8">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-6 md:h-9 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-8 md:h-10 w-32" />
      </div>
    </div>
  );
}