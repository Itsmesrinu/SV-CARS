/**
 * The modal shell shared by `CarFormDialog`, `CarImageManager` and
 * `LocationManagerDialog`.
 *
 * Composed entirely from classes already in the tree: the `bg-black/50` scrim
 * from `AdminSidebar`'s mobile overlay, the `bg-white rounded-2xl shadow-…`
 * surface from `AdminVehicleCard`, and the same `motion` entrance those cards
 * already use. No new visual language (`docs/design-system.md`).
 */

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky action row pinned to the bottom of the panel. */
  footer?: ReactNode;
  /** Tailwind max-width for the panel. Defaults to the form width. */
  widthClassName?: string;
  /** Optional preferred first control. Falls back to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function AdminDialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-2xl',
  initialFocusRef,
}: AdminDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  // Escape closes, and the page behind must not scroll while a dialog is up —
  // on mobile a scrolling backdrop makes the panel feel detached.
  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (initialFocusRef?.current ?? firstFocusable ?? panelRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [initialFocusRef, open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // A nested confirmation dialog handles its own key event first. Stopping
    // propagation here prevents Escape from closing both sheets at once.
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.getClientRects().length > 0,
    );

    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitle ? subtitleId : undefined}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`relative w-full ${widthClassName} max-h-[92vh] md:max-h-[88vh] bg-white rounded-t-2xl md:rounded-2xl shadow-card flex flex-col overflow-hidden`}
          >
            <header className="flex items-start justify-between gap-4 px-4 py-4 md:px-6 md:py-5 border-b border-slate-200 shrink-0">
              <div>
                <h2 id={titleId} className="text-xl font-extrabold tracking-tighter text-slate-900">
                  {title}
                </h2>
                {subtitle && (
                  <p id={subtitleId} className="text-slate-500 font-medium text-sm">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-surface-container-low text-slate-500 hover:text-primary transition-colors active:scale-95 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">{children}</div>

            {footer && (
              <footer className="border-t border-slate-200 bg-surface-container-low shrink-0 pb-safe">
                <div className="px-4 py-4 md:px-6">{footer}</div>
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
