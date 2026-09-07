import { ArrowLeft, Instagram, Menu, Phone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useSettings } from '@/src/hooks';
import { cn } from '@/src/lib/utils';
import { WhatsAppButton } from '@/src/components/ui';
import {
  BUSINESS_NAME,
  INSTAGRAM_URL,
  buildGeneralWhatsAppUrl,
  phoneHref,
  phoneLabel,
} from '@/src/components/layout/contact';

const NAV_LINKS = [
  { name: 'HOME', to: '/' },
  { name: 'ALL CARS', to: '/all-cars' },
  { name: 'REVIEWS', to: '/#reviews' },
  { name: 'OFFICE LOCATION', to: '/#location' },
];

function Wordmark() {
  return (
    <span className="flex flex-col leading-[1.05] md:block md:leading-none">
      <span>Sri Venkateshwara</span>
      <span className="md:ml-1">Cars</span>
    </span>
  );
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const isHomePage = location.pathname === '/';

  const handleBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
      return;
    }

    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isActive = (to: string) => {
    const [, hash = ''] = to.split('#');
    if (hash) return location.pathname === '/' && location.hash === `#${hash}`;
    if (to === '/') {
      const sectionHash = location.hash === '#reviews' || location.hash === '#location';
      return location.pathname === '/' && !sectionHash;
    }
    return location.pathname === to;
  };

  const handleNavClick = (to: string) => {
    setIsOpen(false);
    if (to.startsWith('/#') && location.pathname === '/') {
      const element = document.querySelector(to.slice(1));
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const whatsappUrl = settings?.whatsappPhone
    ? buildGeneralWhatsAppUrl(settings)
    : null;

  return (
    <>
      <nav className="glass-nav sticky top-0 z-50 w-full border-b border-slate-100" aria-label="Primary navigation">
        <a
          href="#main"
          className="fixed left-4 top-2 z-[70] inline-flex min-h-11 -translate-y-20 items-center rounded-xl bg-primary px-4 font-bold text-white shadow-lg transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>

        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 md:h-20 md:px-6">
          <div className="flex min-w-0 items-center gap-1">
            {!isHomePage ? (
              <button
                type="button"
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-primary transition-transform active:scale-90 md:hidden"
                onClick={handleBack}
                aria-label="Go back"
              >
                <ArrowLeft aria-hidden="true" size={22} />
              </button>
            ) : null}
            <Link
              to="/"
              aria-label={BUSINESS_NAME}
              className="inline-flex min-h-11 min-w-0 items-center text-lg font-extrabold tracking-tighter text-primary md:text-xl"
            >
              <Wordmark />
            </Link>
          </div>

          <div className="hidden items-center gap-4 md:flex lg:gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.name}
                to={link.to}
                onClick={() => handleNavClick(link.to)}
                aria-current={isActive(link.to) ? 'page' : undefined}
                className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-slate-600 transition-colors hover:text-primary"
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden min-h-11 items-center gap-2 rounded-xl bg-tertiary-container px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-95 lg:flex"
            >
              <Instagram aria-hidden="true" size={18} />
              Instagram
            </a>
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-xl text-slate-900 transition-transform active:scale-90 md:hidden"
              onClick={() => setIsOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isOpen}
              aria-controls="mobile-navigation"
            >
              <Menu aria-hidden="true" size={24} />
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            ref={panelRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] flex flex-col bg-white pb-safe pt-safe"
          >
            <div className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-100 px-4">
              <Link
                to="/"
                aria-label={BUSINESS_NAME}
                className="inline-flex min-h-11 items-center text-lg font-extrabold tracking-tighter text-primary"
                onClick={() => setIsOpen(false)}
              >
                <Wordmark />
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-900 transition-transform active:scale-90"
                aria-label="Close navigation menu"
              >
                <X aria-hidden="true" size={24} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-6">
              {NAV_LINKS.map((link) => {
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.name}
                    to={link.to}
                    onClick={() => handleNavClick(link.to)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-12 items-center rounded-xl px-4 text-lg font-extrabold tracking-tight transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-slate-900 hover:bg-slate-50',
                    )}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </div>

            <div className="space-y-3 border-t border-slate-100 p-4">
              {settings?.whatsappPhone && whatsappUrl ? (
                <div className="rounded-2xl bg-surface-container-low p-3">
                  <p className="px-1 pb-2 text-xs font-bold uppercase tracking-widest text-slate-600">
                    Contact us
                  </p>
                  <a
                    href={phoneHref(settings.whatsappPhone)}
                    className="mb-2 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-900 transition-colors hover:bg-white active:scale-95"
                  >
                    <Phone aria-hidden="true" className="size-5 text-primary" />
                    {phoneLabel(settings.whatsappPhone)}
                  </a>
                  <WhatsAppButton href={whatsappUrl} fullWidth>
                    Chat on WhatsApp
                  </WhatsAppButton>
                </div>
              ) : null}

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-tertiary-container px-4 py-3 text-sm font-bold text-white transition-transform active:scale-95"
              >
                <Instagram aria-hidden="true" size={20} />
                Instagram
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
