import { useState, useCallback } from 'react';
import { CarFront, Phone, ArrowLeft, MapPin, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CarDTO, SettingsDTO } from '@/src/types/api';
import { bookingPhone, calcTotal } from '@/src/lib/carHelpers';
import { buildWhatsAppLines, buildWhatsAppUrl } from '@/src/lib/booking';
import { StickyActionBar, WhatsAppButton } from '@/src/components/ui';

interface ConciergeSidebarContentProps {
  car: CarDTO;
  settings: SettingsDTO;
  days: number;
  startDate: string;
  endDate: string;
  mode: 'self' | 'driver';
}

type LocationStatus = 'idle' | 'fetching' | 'success' | 'denied' | 'error';

export default function ConciergeSidebarContent({
  car,
  settings,
  days,
  startDate,
  endDate,
  mode,
}: ConciergeSidebarContentProps) {
  const [shareLocation, setShareLocation] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');

  const carPageUrl = `${window.location.origin}/car/${car.id}`;
  const { total } = calcTotal(car, settings, days, mode);
  const totalLabel = car.pricePerDay > 0 ? `₹${total.toLocaleString()}` : 'On request';

  const fetchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      return;
    }
    setLocationStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('success');
      },
      (err) => {
        setCoords(null);
        setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const handleShareToggle = useCallback(() => {
    if (!shareLocation) {
      setShareLocation(true);
      fetchLocation();
    } else {
      setShareLocation(false);
      setCoords(null);
      setLocationStatus('idle');
    }
  }, [shareLocation, fetchLocation]);

  const mapsLink = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : null;

  const bookingContext = {
    car,
    settings,
    startDate,
    endDate,
    days,
    mode,
    carPageUrl,
    locationLink: shareLocation ? mapsLink : null,
    variant: 'confirm' as const,
  };

  const whatsappUrl = buildWhatsAppUrl(bookingContext);
  // The preview used to be a second, hand-written JSX copy of the message body.
  // It renders from the same array the link encodes, so it cannot lie about what
  // the owner will actually receive (CONTRACT.md §11).
  const previewLines = buildWhatsAppLines(bookingContext);

  return (
    <>
      <div className="min-w-0 lg:sticky lg:top-28">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          {/* WhatsApp's header green is interface chrome, not a site palette colour. */}
          <div className="flex items-center gap-4 bg-[#075e54] p-5 text-white md:p-6">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
              <CarFront aria-hidden="true" className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="break-words font-bold">Sri Venkateshwara Cars</p>
              <p className="mt-0.5 text-xs text-white/80">Booking enquiry</p>
            </div>
          </div>

          {/* Message Preview */}
          <div className="min-w-0 bg-surface-container-low p-5 md:p-8">
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Message Preview</p>
            <div className="relative min-w-0 rounded-2xl rounded-tl-none bg-white p-5 shadow-sm md:p-6">
              <div aria-hidden="true" className="absolute -left-2 top-0 size-4 rotate-45 bg-white" />
              <p className="min-w-0 break-words text-sm font-medium leading-relaxed text-slate-900">
                {previewLines.map((line, i) => (
                  <MessageLine key={i} line={line} isLast={i === previewLines.length - 1} />
                ))}
              </p>
            </div>
          </div>

          {/* Share Location Option */}
          <div className="border-t border-slate-100 px-5 py-4 md:px-8 md:py-5">
            <label className="flex cursor-pointer select-none items-start gap-3" htmlFor="share-location-checkbox">
              <span className="relative flex size-11 shrink-0 items-center justify-center">
                <input
                  id="share-location-checkbox"
                  type="checkbox"
                  checked={shareLocation}
                  onChange={handleShareToggle}
                  className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <span
                  aria-hidden="true"
                  className="flex size-5 items-center justify-center rounded border-2 border-slate-300 bg-white text-white peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2"
                >
                  {shareLocation ? <span className="text-xs font-bold">✓</span> : null}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1 pt-2">
                <span className="flex items-start gap-1.5">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold text-slate-800">Share my current location as pickup point</span>
                </span>
                <span className="text-xs leading-relaxed text-slate-500">
                  Your GPS location will be sent as a Google Maps link so the owner knows where to deliver the car.
                </span>
              </span>
            </label>

            {/* Location Status */}
            {shareLocation && (
              <div className="mt-3 pl-14">
                {locationStatus === 'fetching' && (
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Fetching your location…
                  </div>
                )}
                {locationStatus === 'success' && mapsLink && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-600">
                    <MapPin aria-hidden="true" className="size-4" />
                    Location captured
                    <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="underline">View on map</a>
                  </div>
                )}
                {locationStatus === 'denied' && (
                  <div className="flex items-start gap-2 text-xs font-medium text-amber-600">
                    <span aria-hidden="true">⚠️</span>
                    Location access was denied. The booking can still be sent without your location.
                  </div>
                )}
                {locationStatus === 'error' && (
                  <div className="flex items-start gap-2 text-xs font-medium text-red-500">
                    <span aria-hidden="true">⚠️</span>
                    Could not fetch your location. Please check your device settings or try again.
                  </div>
                )}
              </div>
            )}

            <p className="mt-2 pl-14 text-xs text-slate-500">We only share your location when you choose to.</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-4 p-5 md:p-8">
            <WhatsAppButton href={whatsappUrl} size="lg" fullWidth>
              Confirm and Open WhatsApp
            </WhatsAppButton>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a
                href={`tel:+${bookingPhone(car, settings)}`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-surface-container-low active:bg-surface-container-low"
              >
                <Phone aria-hidden="true" className="size-4" />
                Call Owner
              </a>
              <Link
                to="/all-cars"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-surface-container-low active:bg-surface-container-low"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to all cars
              </Link>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-surface-container-low p-4">
            <p className="text-center text-xs font-medium leading-relaxed text-slate-500">
              By confirming, you agree to our concierge contacting you via WhatsApp for identity verification and contract delivery.
            </p>
          </div>
        </div>
      </div>

      <StickyActionBar
        info={(
          <div>
            <span className="block text-xs font-semibold text-slate-500">Total</span>
            <span className="block truncate text-lg font-extrabold tracking-tight text-primary">{totalLabel}</span>
          </div>
        )}
      >
        <WhatsAppButton href={whatsappUrl} size="md">
          Open WhatsApp
        </WhatsAppButton>
      </StickyActionBar>
    </>
  );
}

/**
 * One line of the message body, with the label up to the first colon bolded —
 * which is exactly the emphasis the hand-written preview used to carry. The text
 * itself is never reconstructed here; it comes from `buildWhatsAppLines`.
 */
function MessageLine({ line, isLast }: { line: string; isLast: boolean }) {
  const br = isLast ? null : <br />;
  if (line === '') return br;

  const colon = line.indexOf(':');
  if (colon === -1) {
    return (
      <>
        {line}
        {br}
      </>
    );
  }

  return (
    <>
      <span className="font-bold">{line.slice(0, colon + 1)}</span>
      {line.slice(colon + 1)}
      {br}
    </>
  );
}
