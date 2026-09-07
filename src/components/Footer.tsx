import { Clock3, Instagram, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLocations, useSettings } from '@/src/hooks';
import { WhatsAppButton } from '@/src/components/ui';
import {
  BUSINESS_NAME,
  INSTAGRAM_URL,
  buildGeneralWhatsAppUrl,
  phoneHref,
  phoneLabel,
} from '@/src/components/layout/contact';

const QUICK_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'All Cars', to: '/all-cars' },
  { label: 'Reviews', to: '/#reviews' },
  { label: 'Office Location', to: '/#location' },
];

export default function Footer() {
  const { data: settings } = useSettings();
  const { data: locations } = useLocations();
  const activeLocations = locations?.filter((location) => location.isActive) ?? [];

  return (
    <footer className="border-t border-slate-200 bg-surface-container-low py-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2 md:px-6 lg:grid-cols-[1.35fr_0.8fr_1fr] lg:gap-12">
        <section aria-labelledby="footer-business-heading">
          <h2 id="footer-business-heading" className="text-xl font-extrabold tracking-tighter text-primary">
            {BUSINESS_NAME}
          </h2>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Clock3 aria-hidden="true" className="size-5 shrink-0 text-primary" />
            24/7 availability
          </p>

          <div className="mt-5 space-y-4">
            {activeLocations.length > 0 ? (
              activeLocations.map((location) => {
                const phone = location.whatsappPhone || settings?.whatsappPhone;
                return (
                  <div key={location.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="font-bold text-slate-900">
                      {location.officeName || `${location.city} Branch`}
                    </h3>
                    <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600">
                      <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                      <span>{location.addressFull || location.addressShort}</span>
                    </p>
                    {phone ? (
                      <a
                        href={phoneHref(phone)}
                        className="mt-2 flex min-h-11 items-center gap-2 rounded-xl text-sm font-bold text-primary transition-colors hover:text-slate-900 active:scale-95"
                      >
                        <Phone aria-hidden="true" className="size-5 shrink-0" />
                        {phoneLabel(phone)}
                      </a>
                    ) : null}
                  </div>
                );
              })
            ) : settings?.pickupAddress ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                  <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>{settings.pickupAddress}</span>
                </p>
                {settings.whatsappPhone ? (
                  <a
                    href={phoneHref(settings.whatsappPhone)}
                    className="mt-2 flex min-h-11 items-center gap-2 rounded-xl text-sm font-bold text-primary transition-colors hover:text-slate-900 active:scale-95"
                  >
                    <Phone aria-hidden="true" className="size-5 shrink-0" />
                    {phoneLabel(settings.whatsappPhone)}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <nav aria-labelledby="footer-links-heading">
          <h2 id="footer-links-heading" className="text-sm font-bold uppercase tracking-widest text-slate-900">
            Quick links
          </h2>
          <div className="mt-4 flex flex-col gap-1">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="flex min-h-11 items-center rounded-xl text-sm font-semibold text-slate-600 transition-colors hover:text-primary active:scale-95"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <section aria-labelledby="footer-contact-heading">
          <h2 id="footer-contact-heading" className="text-sm font-bold uppercase tracking-widest text-slate-900">
            Get in touch
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Ask about cars, dates, and drive options directly on WhatsApp.
          </p>
          {settings?.whatsappPhone ? (
            <div className="mt-4">
              <WhatsAppButton href={buildGeneralWhatsAppUrl(settings)} fullWidth>
                Enquire on WhatsApp
              </WhatsAppButton>
            </div>
          ) : null}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-tertiary-container px-4 py-3 text-sm font-bold text-tertiary-container transition-colors hover:bg-tertiary-container hover:text-white active:scale-95"
          >
            <Instagram aria-hidden="true" className="size-5" />
            Follow on Instagram
          </a>
        </section>
      </div>

      <div className="mx-auto mt-10 max-w-7xl border-t border-slate-200 px-4 pt-6 md:px-6">
        <p className="text-sm font-medium text-slate-600">
          © {new Date().getFullYear()} {BUSINESS_NAME}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
