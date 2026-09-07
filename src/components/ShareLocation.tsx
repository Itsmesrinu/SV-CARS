import { Loader2, MapPin, Send } from 'lucide-react';
import { useState } from 'react';

import { buildDeliveryWhatsAppUrl } from '@/src/components/layout/contact';
import { useSettings } from '@/src/hooks/useSettings';

type LocationStatus = 'idle' | 'fetching' | 'success' | 'denied' | 'error';

export default function ShareLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const { data: settings } = useSettings();
  const phone = settings?.whatsappPhone;
  const loading = status === 'fetching';

  const handleShareLocation = () => {
    if (!phone) return;
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }

    setStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
        // Route through the central URL builder — no file except contact.ts and
        // booking.ts may hand-write a wa.me URL (CONTRACT.md §11).
        window.open(buildDeliveryWhatsAppUrl(phone, mapsLink), '_blank', 'noopener,noreferrer');
        setStatus('success');
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <section className="bg-surface-container-low py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-4 text-center md:px-6">
        <h2 className="mb-2 text-xl font-bold tracking-tight text-slate-900 md:mb-3 md:text-2xl">
          Want a Car Delivered to Your Location?
        </h2>
        <p className="mx-auto mb-6 max-w-xl text-sm text-slate-600 md:mb-8 md:text-base">
          Share your current location and we&apos;ll arrange delivery right to your doorstep via WhatsApp.
        </p>
        <button
          type="button"
          onClick={handleShareLocation}
          /* Disabled until settings arrive: opening WhatsApp with an empty
             number sends the customer to a dead screen. */
          disabled={loading || !phone}
          className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-whatsapp px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-whatsapp-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-14 md:px-8 md:py-4 md:text-base"
        >
          {loading ? (
            <>
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              Fetching Location…
            </>
          ) : (
            <>
              <Send aria-hidden="true" className="size-5" />
              Share My Location for Delivery
            </>
          )}
        </button>

        <div aria-live="polite" className="mx-auto mt-4 min-h-6 max-w-xl text-sm font-medium">
          {status === 'success' ? (
            <p className="flex items-center justify-center gap-2 text-emerald-600">
              <MapPin aria-hidden="true" className="size-4" />
              WhatsApp opened with your delivery location.
            </p>
          ) : null}
          {status === 'denied' ? (
            <p className="text-tertiary-container">
              Location access was denied. Allow it in your browser settings, then try again.
            </p>
          ) : null}
          {status === 'error' ? (
            <p className="text-red-600">
              We could not fetch your location. Check your device settings and try again.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
