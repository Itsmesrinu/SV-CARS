import type { JSX, ReactNode } from 'react';

import { cn } from '@/src/lib/utils';

export interface StickyActionBarProps {
  /** Left slot — price, total, or other route context. */
  info?: ReactNode;
  /** Right slot — the action or actions. */
  children: ReactNode;
  /** Hide at this breakpoint and above. */
  hideFrom?: 'md' | 'lg';
  className?: string;
}

const HIDE_FROM = {
  md: 'md:hidden',
  lg: 'lg:hidden',
} as const;

/**
 * Mobile action chrome copied from the fixed WhatsApp panel in CarDetailsPage.
 * The spacer is part of the primitive so page content can never sit behind it.
 */
export function StickyActionBar({
  info,
  children,
  hideFrom = 'lg',
  className,
}: StickyActionBarProps): JSX.Element {
  const hiddenClass = HIDE_FROM[hideFrom];

  return (
    <>
      <div aria-hidden="true" className={hiddenClass}>
        <div className="h-20" />
        <div className="pb-safe" />
      </div>
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 shadow-bar backdrop-blur pb-safe',
          hiddenClass,
          className,
        )}
      >
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          {info ? <div className="min-w-0 shrink text-slate-900">{info}</div> : null}
          <div className={cn('flex items-center gap-2', !info && 'w-full justify-end')}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
