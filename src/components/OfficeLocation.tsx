import { Building2, Clock, Home, MapPin, Navigation, Phone } from 'lucide-react';
import { useState } from 'react';

import { Chip, SectionHeading, Skeleton, WhatsAppButton } from '@/src/components/ui';
import { buildGeneralWhatsAppUrl } from '@/src/components/layout/contact';
import { useLocations } from '@/src/hooks/useLocations';
import { useSettings } from '@/src/hooks/useSettings';
import { useCityFilter } from '@/src/lib/cityFilter';
import { citySlug, directionsHref, displayAddress, mapEmbedSrc } from '@/src/lib/locationHelpers';
import type { LocationDTO, SettingsDTO } from '@/src/types/api';

/**
 * The number for this office: the branch's own line when the owner gave it one,
 * else the single business number.
 *
 * Rendered in the local form the card has always shown. The database stores the
 * country code because WhatsApp needs it there, so it is dropped here — and only
 * when what remains is a full ten-digit number.
 */
function displayPhone(location: LocationDTO | null, settings: SettingsDTO | undefined): string | null {
  const digits = location?.whatsappPhone ?? settings?.whatsappPhone;
  if (!digits) return null;
  return digits.replace(/^91(?=\d{10}$)/, '');
}

export default function OfficeLocation() {
  const { data: locations, isPending } = useLocations();
  const { data: settings } = useSettings();
  const { selected } = useCityFilter();
  const [chosenId, setChosenId] = useState<string | null>(null);

  const branches = locations ?? [];

  // Default to the customer's city choice when one was made, else the first
  // active branch. An explicit tap on the switcher wins over both.
  const preferred =
    branches.find((branch) => branch.id === chosenId) ??
    branches.find((branch) => selected.includes(citySlug(branch.city))) ??
    branches[0] ??
    null;

  /*
    A branch the owner hasn't created yet still needs an address here, so fall
    back to the settings address. Only address-derived helpers use this object;
    no invented city name reaches the page.
  */
  const fallback: LocationDTO | null = settings
    ? {
        id: 'settings-fallback',
        city: '',
        officeName: null,
        addressShort: settings.pickupAddress,
        addressFull: null,
        directionsUrl: null,
        whatsappPhone: null,
        isActive: true,
        sortOrder: 0,
      }
    : null;

  const location = preferred ?? fallback;
  const phone = displayPhone(location, settings);
  const whatsappPhone = location?.whatsappPhone ?? settings?.whatsappPhone;
  // General enquiry — no car context. Route through buildGeneralWhatsAppUrl so
  // this file never hand-writes a wa.me URL (CONTRACT.md §11).
  const whatsappHref = whatsappPhone ? buildGeneralWhatsAppUrl({ whatsappPhone }) : '';

  return (
    <section id="location" className="bg-surface-container-low py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Visit or call"
          title="Visit Sri Venkateshwara Cars"
          subtitle="Get directions to the office or ask the proprietor a question on WhatsApp."
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
          <div>
            {/* One branch renders exactly today's card. The switcher appears only
                from the second city onwards. */}
            {branches.length > 1 ? (
              <div className="-mx-1 mb-6 flex items-center gap-2 overflow-x-auto p-1 no-scrollbar md:gap-4">
                {branches.map((branch) => (
                  <Chip
                    key={branch.id}
                    onClick={() => setChosenId(branch.id)}
                    selected={location?.id === branch.id}
                    className="shrink-0"
                  >
                    {branch.city}
                  </Chip>
                ))}
              </div>
            ) : null}

            <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm md:p-8">
              <div className="mb-6 flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <MapPin aria-hidden="true" className="size-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">Sri Venkateshwara Cars</h3>
                  {location ? (
                    <p className="text-slate-600">{displayAddress(location)}</p>
                  ) : isPending ? (
                    <Skeleton className="mt-1 h-5 w-56 max-w-full rounded-xl" />
                  ) : null}
                </div>
              </div>

              <div className="mb-6 flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Clock aria-hidden="true" className="size-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Operating Hours</h3>
                  <p className="text-slate-600">24/7 Availability</p>
                  <div className="mt-6 border-t border-slate-100 pt-6">
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">Proprietor</p>
                    <p className="text-lg font-bold text-slate-900">Pavan Chowdam</p>
                    {phone ? (
                      <p className="mt-2 flex items-center gap-2 text-slate-600">
                        <Phone aria-hidden="true" className="size-4" /> {phone}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href={location ? directionsHref(location) : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!location}
                  tabIndex={location ? undefined : -1}
                  className={`inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-primary px-5 py-3 text-center text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-white active:scale-[0.98] ${!location ? 'pointer-events-none opacity-60' : ''}`}
                >
                  Get Directions
                </a>
                {whatsappHref ? (
                  <WhatsAppButton href={whatsappHref} fullWidth>
                    Ask on WhatsApp
                  </WhatsAppButton>
                ) : null}
              </div>
            </div>

            <h3 className="mb-4 text-xl font-bold tracking-tight md:mb-6 md:text-2xl">Delivery Options</h3>
            <div className="grid grid-cols-3 gap-2 md:gap-4">
              {[
                { icon: Home, label: 'Home Delivery' },
                { icon: Building2, label: 'Hotel Drop-off' },
                { icon: Navigation, label: 'Nearby Towns' },
              ].map((option) => (
                <div key={option.label} className="rounded-2xl bg-white p-3 text-center shadow-sm md:p-6">
                  <option.icon aria-hidden="true" className="mx-auto mb-2 size-6 text-primary md:size-8" />
                  <p className="text-xs font-bold leading-tight md:text-sm">{option.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[280px] overflow-hidden rounded-2xl bg-slate-200 md:min-h-[400px]">
            {/* Derived from the real address; no invented coordinates or place id. */}
            {location ? (
              <iframe
                title="Sri Venkateshwara Cars Location"
                src={mapEmbedSrc(location)}
                className="absolute inset-0 h-full w-full border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
