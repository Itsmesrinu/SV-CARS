import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Car,
  CreditCard,
  LogOut,
  PlusCircle,
  Rocket,
  Settings,
  Ticket,
  User,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BADGE_SOON } from './adminStyles';
import { useAdminSession } from './adminApi';

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the car form on the fleet page; links there from availability. */
  onAddCar?: () => void;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function AdminSidebar({ isOpen, onClose, onAddCar }: AdminSidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { email, logout, isLoggingOut } = useAdminSession();
  const panelRef = useRef<HTMLElement>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isMobile || !isOpen) return;

    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    requestAnimationFrame(() => focusables()[0]?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocus?.focus();
    };
  }, [isMobile, isOpen, onClose]);

  const navItems = [
    { icon: Car, label: 'Fleet Management', to: '/admin', active: pathname === '/admin' },
    {
      icon: CreditCard,
      label: 'Pricing',
      hint: 'Set each car’s rate on its card in Fleet Management.',
    },
    {
      icon: Calendar,
      label: 'Availability',
      to: '/admin/availability',
      active: pathname === '/admin/availability',
    },
    {
      icon: Ticket,
      label: 'Bookings',
      hint: 'Bookings arrive on WhatsApp and are not stored — see the README.',
    },
    { icon: BarChart3, label: 'Analytics', hint: 'Not built yet.' },
  ];

  const itemClass = (active?: boolean) => [
    'flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all',
    active
      ? 'border-r-4 border-emerald-500 bg-emerald-500/10 text-emerald-500'
      : 'text-slate-400 hover:bg-slate-800 hover:text-white active:scale-[0.98]',
  ].join(' ');

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate('/admin/login', { replace: true });
    }
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close admin navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        ref={panelRef}
        aria-label="Admin navigation"
        aria-modal={isMobile && isOpen ? true : undefined}
        role={isMobile ? 'dialog' : undefined}
        aria-hidden={isMobile && !isOpen ? true : undefined}
        inert={isMobile && !isOpen}
        className={`fixed left-0 top-0 z-50 flex h-dvh w-[min(19rem,88vw)] shrink-0 flex-col border-r border-slate-800 bg-slate-950 pt-safe pb-safe transition-transform duration-300 md:sticky md:w-72 md:translate-x-0 ${
          isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full md:visible'
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:py-6">
          <div className="mb-6 px-2 md:mb-8">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
                <Rocket className="size-6 fill-current" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black tracking-tighter text-white">Sri Venkateshwara</h2>
                <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Fleet Commander</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close admin navigation"
                className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white active:scale-95 md:hidden"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            {onAddCar ? (
              <button
                type="button"
                onClick={() => {
                  onAddCar();
                  onClose();
                }}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 transition-all hover:bg-emerald-400 active:scale-95"
              >
                <PlusCircle className="size-5" aria-hidden="true" />
                <span className="text-xs uppercase tracking-widest">Add New Car</span>
              </button>
            ) : (
              <Link
                to="/admin"
                onClick={onClose}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 transition-all hover:bg-emerald-400 active:scale-95"
              >
                <PlusCircle className="size-5" aria-hidden="true" />
                <span className="text-xs uppercase tracking-widest">Add New Car</span>
              </Link>
            )}
          </div>

          <nav className="flex-1 space-y-1" aria-label="Admin sections">
            {navItems.map((item) => item.to ? (
              <Link
                key={item.label}
                to={item.to}
                onClick={onClose}
                aria-current={item.active ? 'page' : undefined}
                className={itemClass(item.active)}
              >
                <item.icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-widest">{item.label}</span>
              </Link>
            ) : (
              <div
                key={item.label}
                aria-disabled="true"
                className="rounded-xl px-4 py-2.5 text-slate-400"
              >
                <div className="flex min-h-11 items-center gap-3">
                  <item.icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-xs font-bold uppercase tracking-widest">
                    {item.label}
                  </span>
                  <span className={BADGE_SOON} style={{ fontSize: '0.75rem' }}>Soon</span>
                </div>
                <p className="pb-1 pl-8 text-xs leading-5 text-slate-500">{item.hint}</p>
              </div>
            ))}
          </nav>

          <div className="mt-4 space-y-1 border-t border-slate-800 pt-4">
            <div aria-disabled="true" className="rounded-xl px-4 py-2.5 text-slate-400">
              <div className="flex min-h-11 items-center gap-3">
                <Settings className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-xs font-bold uppercase tracking-widest">Settings</span>
                <span className={BADGE_SOON} style={{ fontSize: '0.75rem' }}>Soon</span>
              </div>
              <p className="pb-1 pl-8 text-xs leading-5 text-slate-500">
                Business defaults are managed during setup for now.
              </p>
            </div>
            <Link
              to="/"
              className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-slate-400 transition-all hover:bg-slate-800 hover:text-white active:scale-[0.98]"
            >
              <LogOut className="size-5" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-widest">Back to Site</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-slate-400 transition-all hover:bg-slate-800 hover:text-white active:scale-[0.98] disabled:opacity-50"
            >
              <LogOut className="size-5" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-widest">
                {isLoggingOut ? 'Signing out…' : 'Sign Out'}
              </span>
            </button>

            <div className="mt-4 flex items-center gap-3 px-2">
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-slate-400">
                <User className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">Signed in</p>
                <p className="truncate text-xs text-slate-500">{email ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
