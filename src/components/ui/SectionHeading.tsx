import type { JSX, ReactNode } from 'react';

import { cn } from '@/src/lib/utils';

export interface SectionHeadingProps {
  /** Small uppercase line above the title. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned link or action. */
  action?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

/** Heading rhythm copied from AvailableCars and the other home-page sections. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
  align = 'left',
  className,
}: SectionHeadingProps): JSX.Element {
  const centered = align === 'center';

  return (
    <div
      className={cn(
        'mb-8 flex items-end justify-between gap-4 md:mb-12',
        centered && 'flex-col items-center text-center',
        className,
      )}
    >
      <div className={cn('min-w-0', centered && 'mx-auto')}>
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-3xl font-extrabold tracking-tighter text-slate-900 md:text-4xl">
          {title}
        </h2>
        {subtitle ? (
          <p className={cn('mt-3 max-w-2xl text-sm text-slate-500 md:text-base', centered && 'mx-auto')}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
