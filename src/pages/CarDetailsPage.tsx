import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Fuel,
  Gavel,
  MapPin,
  Navigation,
  RefreshCw,
  Settings2,
  Sun,
  User as UserIcon,
  Users,
} from 'lucide-react';

import DateRangePicker from '@/src/components/DateRangePicker';
import CarGallery from '@/src/components/gallery/CarGallery';
import {
  CarDetailSkeleton,
  EmptyState,
  StickyActionBar,
  WhatsAppButton,
} from '@/src/components/ui';
import { useCar } from '@/src/hooks/useCars';
import { useSettings } from '@/src/hooks/useSettings';
import { availabilityLabel, carAvailability, formatDate } from '@/src/lib/availability';
import { buildWhatsAppUrl } from '@/src/lib/booking';
import {
  calcTotal,
  effectiveDriverRate,
  effectiveExtraKm,
  effectiveKmLimit,
} from '@/src/lib/carHelpers';
import { useDateRange } from '@/src/lib/dateFilter';
import { directionsHref, displayAddress, officeLabel } from '@/src/lib/locationHelpers';

type DriveMode = 'self' | 'driver';
type LocationStatus = 'idle' | 'fetching' | 'success' | 'denied' | 'error';

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const carQuery = useCar(id);
  const settingsQuery = useSettings();
  const car = carQuery.data;
  const settings = settingsQuery.data;

  const [driveMode, setDriveMode] = useState<DriveMode>('self');
  const { startDate, endDate, days: bookingDays } = useDateRange();
  const [shareLocation, setShareLocation] = useState(false);
  const [locationLink, setLocationLink] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationMessage, setLocationMessage] = useState('');

  const handleLocationToggle = (checked: boolean) => {
    setShareLocation(checked);
    setLocationMessage('');

    if (!checked) {
      setLocationLink(null);
      setLocationStatus('idle');
      return;
    }

    if (!navigator.geolocation) {
      setShareLocation(false);
      setLocationStatus('error');
      setLocationMessage('Location is not supported by this browser. You can still send your enquiry.');
      return;
    }

    setLocationStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationLink(`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`);
        setLocationStatus('success');
        setLocationMessage('Location captured and ready to include.');
      },
      (error) => {
        setShareLocation(false);
        setLocationLink(null);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
          setLocationMessage('Location access was denied. You can still send your enquiry without it.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationStatus('error');
          setLocationMessage('Your location is unavailable. You can still send your enquiry without it.');
        } else if (error.code === error.TIMEOUT) {
          setLocationStatus('error');
          setLocationMessage('The location request timed out. You can try again or continue without it.');
        } else {
          setLocationStatus('error');
          setLocationMessage('We could not fetch your location. You can still send your enquiry.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  if (carQuery.isPending || settingsQuery.isPending) return <CarDetailSkeleton />;

  if (!car || !settings) {
    const notFound = carQuery.error?.code === 'not_found' || carQuery.error?.status === 404;
    return (
      <EmptyState
        icon={notFound ? Car : AlertCircle}
        title={notFound ? 'Car Not Found' : 'Something Went Wrong'}
        description={
          notFound
            ? "The car you're looking for doesn't exist."
            : 'We could not load this car right now. Please try again.'
        }
        action={
          notFound ? (
            <Link
              to="/all-cars"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-6 py-3 font-bold text-white active:scale-95"
            >
              Browse All Cars
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                carQuery.refetch();
                settingsQuery.refetch();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white active:scale-95"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Retry
            </button>
          )
        }
      />
    );
  }

  const dailyRate = car.pricePerDay;
  const driverRate = effectiveDriverRate(car, settings);
  const kmLimit = effectiveKmLimit(car, settings);
  const extraKm = effectiveExtraKm(car, settings);
  const { basePrice, driverTotal, total } = calcTotal(car, settings, bookingDays, driveMode);
  const category = car.carType ?? '';
  const status = carAvailability(car);
  const isAvailable = status.kind === 'available';
  const branch = car.location;
  const cityPhrase = branch ? ` in ${branch.city}` : '';
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  const whatsappUrl = buildWhatsAppUrl({
    car,
    settings,
    startDate,
    endDate,
    days: bookingDays,
    mode: driveMode,
    carPageUrl: pageUrl,
    locationLink: shareLocation ? locationLink : null,
    variant: 'details',
  });

  const whatsappLabel = isAvailable ? 'Send on WhatsApp' : 'Check availability';

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-4 md:px-6 md:pb-16 md:pt-8">
        <section aria-label={`${car.name} photos`} className="mb-6 md:mb-10">
          <CarGallery carName={car.name} images={car.images ?? []} />
        </section>

        <header className="mb-6 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div>
            {category ? (
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-primary">
                {category}
              </span>
            ) : null}
            <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900 md:text-5xl">
              {car.name}
            </h1>
            <p className="mt-2 flex items-start gap-2 text-sm text-slate-600 md:text-base">
              <CheckCircle2
                aria-hidden="true"
                className={`mt-0.5 size-5 shrink-0 ${
                  isAvailable ? 'fill-emerald-500/10 text-emerald-500' : 'text-slate-500'
                }`}
              />
              {isAvailable
                ? `Available for immediate booking${cityPhrase}`
                : status.kind === 'booked'
                  ? `Booked till ${formatDate(status.until)}${cityPhrase}`
                  : `${availabilityLabel(status)}${cityPhrase}`}
            </p>
            {status.kind === 'booked' ? (
              <span className="mt-2 inline-flex rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white">
                Book for later dates
              </span>
            ) : null}
          </div>

          <div className="rounded-xl border-l-4 border-primary bg-surface-container-low px-4 py-3 md:px-6 md:py-4">
            <p className="text-xs font-medium text-slate-500">Starting from</p>
            {dailyRate > 0 ? (
              <p className="mt-0.5 text-2xl font-extrabold text-slate-900 md:text-3xl">
                ₹{dailyRate.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-slate-500 md:text-base">/day</span>
              </p>
            ) : (
              <p className="mt-0.5 text-lg font-extrabold text-slate-900">Price on request</p>
            )}
          </div>
        </header>

        <div className="flex flex-col lg:grid lg:grid-cols-3 lg:items-start lg:gap-12">
          <main className="contents lg:col-span-2 lg:block lg:space-y-10">
            <section className="order-1 mb-7 lg:mb-0" aria-labelledby="dates-heading">
              <h2 id="dates-heading" className="text-xl font-extrabold tracking-tight text-slate-900">
                When do you need it?
              </h2>
              <p className="mt-1 text-sm text-slate-500">Choose your rental dates</p>
              <DateRangePicker car={car} className="mt-4" />
            </section>

            <section className="order-2 mb-7 lg:mb-0" aria-labelledby="drive-mode-heading">
              <h2 id="drive-mode-heading" className="text-xl font-extrabold tracking-tight text-slate-900">
                Select Drive Mode
              </h2>
              <p className="mt-1 text-sm text-slate-500">Pick how you would like to travel</p>

              <div className="mt-4 grid grid-cols-2 gap-3 md:gap-5">
                <DriveModeCard
                  selected={driveMode === 'self'}
                  onSelect={() => setDriveMode('self')}
                  icon={Car}
                  title="Self-Drive"
                  description="Take the wheel yourself"
                  facts={[`${kmLimit} km included per day`, `Extra km at ₹${extraKm.toLocaleString()}/km`]}
                />
                <DriveModeCard
                  selected={driveMode === 'driver'}
                  onSelect={() => setDriveMode('driver')}
                  icon={UserIcon}
                  title="With Driver"
                  description="Travel with a chauffeur"
                  facts={['Experienced driver included', `₹${driverRate.toLocaleString()}/day driver charge`]}
                />
              </div>
            </section>

            <section className="order-4 mb-7 lg:mb-0" aria-labelledby="specs-heading">
              <h2 id="specs-heading" className="sr-only">Car specifications</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
                {[
                  car.transmission ? { label: 'Transmission', value: car.transmission, icon: Settings2 } : null,
                  car.seating ? { label: 'Capacity', value: `${car.seating} Seats`, icon: Users } : null,
                  car.year ? { label: 'Year', value: String(car.year), icon: Sun } : null,
                  car.fuel ? { label: 'Fuel', value: car.fuel, icon: Fuel } : null,
                ]
                  .filter((spec): spec is NonNullable<typeof spec> => spec !== null)
                  .map((spec) => (
                    <div
                      key={spec.label}
                      className="flex min-h-24 items-center gap-3 rounded-xl bg-surface-container-low p-3 sm:flex-col sm:justify-center sm:text-center md:p-5"
                    >
                      <spec.icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{spec.label}</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-900 md:text-base">{spec.value}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            <div className="order-6 mb-7 rounded-2xl border border-slate-100 bg-white p-4 shadow-card lg:hidden">
              <p className="text-sm font-bold text-slate-900">Ready with your details?</p>
              <p className="mt-1 text-xs text-slate-500">
                Tap below to send your dates and drive mode to us on WhatsApp.
              </p>
              <WhatsAppButton href={whatsappUrl} size="lg" fullWidth className="mt-4">
                {whatsappLabel}
              </WhatsAppButton>
              <p className="mt-3 text-center text-xs font-medium uppercase tracking-widest text-slate-500">
                Instant confirmation • No card needed
              </p>
            </div>

            <LegalNotice kmLimit={kmLimit} extraKm={extraKm} />
          </main>

          <aside className="contents lg:sticky lg:top-24 lg:block lg:space-y-6" aria-label="Booking summary">
            <PriceBreakdown
              dailyRate={dailyRate}
              bookingDays={bookingDays}
              driveMode={driveMode}
              driverRate={driverRate}
              basePrice={basePrice}
              driverTotal={driverTotal}
              total={total}
            />

            <section className="order-5 mb-7 rounded-2xl border border-slate-100 bg-white p-4 shadow-card lg:mb-0 lg:p-6" aria-labelledby="pickup-heading">
              <h2 id="pickup-heading" className="text-lg font-extrabold tracking-tight text-slate-900">
                Pickup Location
              </h2>
              <div className="mt-4 flex items-start gap-3">
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <div>
                  {branch ? <p className="text-sm font-bold text-slate-900">{officeLabel(branch)}</p> : null}
                  <p className="text-sm text-slate-500">
                    {branch ? displayAddress(branch) : settings.pickupAddress}
                  </p>
                  {branch ? (
                    <a
                      href={directionsHref(branch)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold text-primary"
                    >
                      <Navigation aria-hidden="true" className="size-4" />
                      Get Directions
                    </a>
                  ) : null}
                </div>
              </div>

              <LocationShare
                checked={shareLocation}
                status={locationStatus}
                message={locationMessage}
                locationLink={locationLink}
                onChange={handleLocationToggle}
              />
            </section>

            <section className="hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-card lg:block" aria-labelledby="rules-heading">
              <h2 id="rules-heading" className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {driveMode === 'self' ? 'Self-Drive' : 'With Driver'} Rules
              </h2>
              <div className="mt-4 rounded-xl bg-primary/5 p-4">
                {driveMode === 'self' ? (
                  <div className="space-y-3 text-sm">
                    <p><strong>{kmLimit} km included per day.</strong> Drive up to {kmLimit * bookingDays} km over {bookingDays} {bookingDays === 1 ? 'day' : 'days'}.</p>
                    <p><strong>₹{extraKm.toLocaleString()} per extra km.</strong> Charged only above the daily limit.</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <p><strong>₹{driverRate.toLocaleString()} per day.</strong> The driver total is ₹{driverTotal.toLocaleString()}.</p>
                    <p><strong>No km limit.</strong> Unlimited distance with your driver.</p>
                  </div>
                )}
              </div>
            </section>

            <div className="hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-card lg:block">
              <WhatsAppButton href={whatsappUrl} size="lg" fullWidth>
                {whatsappLabel}
              </WhatsAppButton>
              <p className="mt-3 text-center text-xs font-medium uppercase tracking-widest text-slate-500">
                Instant confirmation • No card needed
              </p>
            </div>
          </aside>
        </div>
      </div>

      <StickyActionBar
        info={
          dailyRate > 0 ? (
            <>
              <p className="text-lg font-extrabold leading-tight text-slate-900">₹{total.toLocaleString()}</p>
              <p className="truncate text-xs text-slate-500">
                ₹{dailyRate.toLocaleString()}/day × {bookingDays} {bookingDays === 1 ? 'day' : 'days'}
                {driveMode === 'driver' ? ' + driver' : ''}
              </p>
            </>
          ) : (
            <p className="text-sm font-extrabold leading-tight text-slate-900">Price on request</p>
          )
        }
      >
        <WhatsAppButton href={whatsappUrl} size="md" className="whitespace-nowrap px-4">
          {whatsappLabel}
        </WhatsAppButton>
      </StickyActionBar>
    </>
  );
}

interface DriveModeCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: typeof Car;
  title: string;
  description: string;
  facts: string[];
}

function DriveModeCard({ selected, onSelect, icon: Icon, title, description, facts }: DriveModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative rounded-2xl border-2 p-3.5 text-left transition-colors active:scale-[0.99] md:p-6 ${
        selected
          ? 'border-primary bg-primary/5 shadow-card'
          : 'border-slate-200 bg-surface-container-low hover:border-slate-300'
      }`}
    >
      {selected ? (
        <CheckCircle2 aria-hidden="true" className="absolute right-3 top-3 size-5 fill-primary/10 text-primary" />
      ) : null}
      <div
        className={`mb-3 flex size-11 items-center justify-center rounded-xl ${
          selected ? 'bg-primary text-white' : 'bg-slate-200 text-slate-600'
        }`}
      >
        <Icon aria-hidden="true" className="size-5 md:size-7" />
      </div>
      <p className="pr-4 text-sm font-extrabold text-slate-900 md:text-lg">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 md:text-sm">{description}</p>
      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
        {facts.map((fact) => (
          <p key={fact} className="flex items-start gap-2 text-xs font-semibold text-slate-700 md:text-sm">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            {fact}
          </p>
        ))}
      </div>
    </button>
  );
}

interface PriceBreakdownProps {
  dailyRate: number;
  bookingDays: number;
  driveMode: DriveMode;
  driverRate: number;
  basePrice: number;
  driverTotal: number;
  total: number;
}

function PriceBreakdown({
  dailyRate,
  bookingDays,
  driveMode,
  driverRate,
  basePrice,
  driverTotal,
  total,
}: PriceBreakdownProps) {
  return (
    <section className="order-3 mb-7 rounded-2xl border border-slate-100 bg-white p-4 shadow-card lg:mb-0 lg:p-6" aria-labelledby="price-heading">
      <h2 id="price-heading" className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Live Price
      </h2>
      {dailyRate > 0 ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <p className="font-semibold text-slate-700">Car rental</p>
              <p className="text-xs text-slate-500">₹{dailyRate.toLocaleString()} × {bookingDays} {bookingDays === 1 ? 'day' : 'days'}</p>
            </div>
            <strong className="text-slate-900">₹{basePrice.toLocaleString()}</strong>
          </div>
          {driveMode === 'driver' ? (
            <div className="flex items-center justify-between gap-4 text-sm">
              <div>
                <p className="font-semibold text-slate-700">Driver charge</p>
                <p className="text-xs text-slate-500">₹{driverRate.toLocaleString()} × {bookingDays} {bookingDays === 1 ? 'day' : 'days'}</p>
              </div>
              <strong className="text-slate-900">₹{driverTotal.toLocaleString()}</strong>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-slate-700">Insurance &amp; Protection</span>
            <strong className="text-emerald-600">Included</strong>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="font-extrabold text-slate-900">Total</span>
            <span className="text-xl font-extrabold text-primary">₹{total.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-lg font-extrabold text-slate-900">Price on request</p>
          <p className="mt-1 text-sm text-slate-500">Send your dates and drive mode for a quote.</p>
        </div>
      )}
    </section>
  );
}

interface LocationShareProps {
  checked: boolean;
  status: LocationStatus;
  message: string;
  locationLink: string | null;
  onChange: (checked: boolean) => void;
}

function LocationShare({ checked, status, message, locationLink, onChange }: LocationShareProps) {
  const statusTone = status === 'success' ? 'text-emerald-600' : status === 'idle' ? '' : 'text-tertiary-container';

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <label className="relative flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl p-2 hover:bg-surface-container-low">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded border-2 border-slate-300 bg-white text-white peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2"
        >
          {checked ? <CheckCircle2 className="size-4" /> : null}
        </span>
        <span className="text-sm font-medium text-slate-700">
          {status === 'fetching' ? 'Fetching your location…' : 'Share my current location for delivery'}
        </span>
      </label>

      {message ? (
        <p role="status" className={`mt-2 text-xs font-medium ${statusTone}`}>
          {message}{' '}
          {status === 'success' && locationLink ? (
            <a href={locationLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
              View on map
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function LegalNotice({ kmLimit, extraKm }: { kmLimit: number; extraKm: number }) {
  return (
    <section
      aria-labelledby="legal-heading"
      className="order-6 mb-0 rounded-xl border-l-4 border-tertiary-container bg-tertiary-container/5 p-4 lg:mb-0 lg:p-6"
    >
      <h2
        id="legal-heading"
        className="flex items-center gap-3 font-extrabold tracking-tight text-tertiary-container"
      >
        <Gavel aria-hidden="true" className="size-5 shrink-0" />
        Legal Notice &amp; Compliance
      </h2>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
        <li>
          All traffic violations, including speeding fines and parking tickets incurred during the rental period, are the sole responsibility of the hirer.
        </li>
        <li>
          Sri Venkateshwara Cars reserves the right to charge an administrative fee for processing each violation notice.
        </li>
        <li>
          <strong>Self-drive:</strong> Includes {kmLimit} km per day. Excess usage is charged at ₹{extraKm.toLocaleString()} per extra km.
        </li>
      </ul>
    </section>
  );
}
