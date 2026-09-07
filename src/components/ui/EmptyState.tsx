import type { JSX, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/src/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** A button or Link. */
  action?: ReactNode;
  variant?: 'page' | 'panel';
  className?: string;
}

/** Empty-page geometry copied from AllCarsPage's fleet error and no-results blocks. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'page',
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        variant === 'page' ? 'py-32' : 'rounded-2xl p-10',
        className,
      )}
    >
      {Icon ? (
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-6" />
        </div>
      ) : null}
      <h2 className="text-3xl font-extrabold tracking-tighter text-slate-900">{title}</h2>
      {description ? <p className="mt-4 max-w-xl text-slate-500">{description}</p> : null}
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}
