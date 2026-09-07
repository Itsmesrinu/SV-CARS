import { Link, useLocation } from 'react-router-dom';

import { useSettings } from '@/src/hooks';
import { StickyActionBar, WhatsAppButton } from '@/src/components/ui';
import { buildGeneralWhatsAppUrl } from './contact';

export default function MobileActionBar() {
  const { pathname } = useLocation();
  const { data: settings } = useSettings();

  const isSupportedCustomerRoute = pathname === '/' || pathname === '/all-cars';

  if (pathname.startsWith('/admin') || !isSupportedCustomerRoute || !settings?.whatsappPhone) {
    return null;
  }

  const isFleet = pathname === '/all-cars';

  return (
    <StickyActionBar hideFrom="md">
      {!isFleet ? (
        <Link
          to="/all-cars"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-primary transition-colors hover:bg-primary/5 active:scale-95"
        >
          All Cars
        </Link>
      ) : null}
      <WhatsAppButton
        href={buildGeneralWhatsAppUrl(settings)}
        fullWidth={isFleet}
        className={isFleet ? 'flex-1' : undefined}
      >
        WhatsApp Us
      </WhatsAppButton>
    </StickyActionBar>
  );
}
