import type { JSX, ReactNode } from 'react';

import { cn } from '@/src/lib/utils';

export interface ChipProps {
  children: ReactNode;
  /** Interactive when supplied; otherwise the chip is a static tag. */
  onClick?: () => void;
  /** Optional link target for navigation chips. */
  href?: string;
  selected?: boolean;
  tone?: 'neutral' | 'primary' | 'success' | 'warning';
  size?: 'sm' | 'md';
  className?: string;
}

const TONE = {
  neutral: 'bg-surface-container-low text-slate-600',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600',
  warning: 'bg-tertiary-container/10 text-tertiary-container',
} as const;

/** Pill styling copied from OfficeLocation's city switcher and fleet status tags. */
export function Chip({
  children,
  onClick,
  href,
  selected = false,
  tone = 'neutral',
  size = 'md',
  className,
}: ChipProps): JSX.Element {
  const interactive = Boolean(onClick || href);
  const classes = cn(
    'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap',
    interactive
      ? 'min-h-11 px-4 py-2 text-sm transition-colors active:scale-95'
      : size === 'sm'
        ? 'px-2.5 py-1 text-xs'
        : 'px-4 py-2 text-sm',
    selected ? 'bg-primary text-white' : TONE[tone],
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes} aria-current={selected ? 'page' : undefined}>
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} aria-pressed={selected}>
        {children}
      </button>
    );
  }

  return <span className={classes}>{children}</span>;
}
