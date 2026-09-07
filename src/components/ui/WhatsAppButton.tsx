import type { JSX, ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';

import { cn } from '@/src/lib/utils';

export interface WhatsAppButtonProps {
  /** A complete URL produced by buildWhatsAppUrl() in src/lib/booking.ts. */
  href: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

const SIZE = {
  sm: 'min-h-11 px-4 py-2 text-xs',
  md: 'min-h-12 px-5 py-3 text-sm',
  lg: 'min-h-14 px-6 py-3.5 text-base',
} as const;

/** The shared green CTA is derived from the WhatsApp actions in CarDetailsPage and BookingPage. */
export function WhatsAppButton({
  href,
  children,
  size = 'md',
  fullWidth = false,
  className,
}: WhatsAppButtonProps): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl bg-whatsapp font-bold text-white transition-colors hover:bg-whatsapp-dark active:scale-95',
        SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      <MessageCircle aria-hidden="true" className="size-5 shrink-0" />
      <span>{children}</span>
    </a>
  );
}
