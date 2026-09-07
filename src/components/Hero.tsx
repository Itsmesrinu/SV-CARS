import { Car, Clock, MessageCircle, UserCheck, Wind } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

import CarImage from '@/src/components/CarImage';
import { Chip, WhatsAppButton } from '@/src/components/ui';
import { useCars } from '@/src/hooks/useCars';
import { useLocations } from '@/src/hooks/useLocations';
import { useSettings } from '@/src/hooks/useSettings';
import { addDays, carAvailability, todayInIndia } from '@/src/lib/availability';
import { buildWhatsAppUrl } from '@/src/lib/booking';
import { driveModes, primaryImage } from '@/src/lib/carHelpers';
import { formatCityList } from '@/src/lib/cityFilter';
import { cityOptions } from '@/src/lib/locationHelpers';
import type { CarImageDTO } from '@/src/types/api';

export default function Hero() {
  const { data: locations } = useLocations();
  const { data: carsData } = useCars();
  const { data: settings } = useSettings();

  const cars = carsData ?? [];
  const cityList = formatCityList(cityOptions(locations ?? [], []).map((option) => option.city));
  const hasSelfDrive = cars.some((car) => driveModes(car).includes('self-drive'));
  const hasWithDriver = cars.some((car) => driveModes(car).includes('with-driver'));
  const hasAvailableNow = cars.some((car) => carAvailability(car).kind === 'available');

  const headline =
    hasSelfDrive && hasWithDriver
      ? 'Self-drive and with-driver car rentals'
      : hasSelfDrive
        ? 'Self-drive car rentals'
        : hasWithDriver
          ? 'Car rentals with a driver'
          : 'Car rentals';

  const pricedAvailableCars = cars.filter(
    (car) => carAvailability(car).kind === 'available' && car.pricePerDay > 0,
  );
  const minimumPrice =
    pricedAvailableCars.length > 0
      ? Math.min(...pricedAvailableCars.map((car) => car.pricePerDay))
      : null;

  const featuredCar = cars.find((car) => car.isFeatured && primaryImage(car));
  const fallbackCar = cars.find(
    (car) => carAvailability(car).kind === 'available' && primaryImage(car),
  );
  const heroCar = featuredCar ?? fallbackCar;
  const heroMode = heroCar?.selfDrive ? 'self' : heroCar?.withDriver ? 'driver' : null;

  // The admin-managed hero image wins. With none set we fall back to an
  // auto-picked fleet photo, so the hero is never blank.
  const adminHero = settings?.heroImage ?? null;
  const heroImage: CarImageDTO | null = adminHero
    ? {
        id: 'hero',
        publicId: adminHero.publicId,
        width: adminHero.width,
        height: adminHero.height,
        blurDataUrl: adminHero.blurDataUrl,
        kind: 'main',
        sortOrder: 0,
        isPrimary: true,
        alt: null,
      }
    : heroCar
      ? primaryImage(heroCar)
      : null;

  const today = todayInIndia();
  const whatsappHref =
    heroCar && heroMode && settings
      ? buildWhatsAppUrl({
          car: heroCar,
          settings,
          startDate: today,
          endDate: addDays(today, 1),
          days: 1,
          mode: heroMode,
          carPageUrl: new URL(`/car/${heroCar.id}`, window.location.origin).toString(),
          variant: 'details',
        })
      : null;

  const services = [
    hasAvailableNow && { icon: Clock, label: '24/7 Availability' },
    hasSelfDrive && { icon: Car, label: 'Self Drive' },
    hasWithDriver && { icon: UserCheck, label: 'With Driver' },
    { icon: Wind, label: 'AC & Non-AC' },
    { icon: MessageCircle, label: 'WhatsApp Booking' },
  ].filter(Boolean) as { icon: React.ElementType; label: string }[];

  return (
    <section className="relative overflow-hidden bg-surface py-8 md:py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-6 px-4 md:grid-cols-2 md:gap-12 md:px-6">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
            Sri Venkateshwara Cars
          </p>
          <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tighter text-slate-900 md:text-6xl">
            {headline}
          </h1>

          {cityList ? (
            <p className="mt-3 text-base font-semibold text-slate-600">Available in {cityList}</p>
          ) : null}

          {minimumPrice !== null ? (
            <p className="mt-3 text-xl font-extrabold tracking-tight text-primary">
              Starting From ₹{minimumPrice.toLocaleString('en-IN')}/day
            </p>
          ) : null}

          {/* Hidden for now — kept for later use.
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {whatsappHref ? (
              <WhatsAppButton href={whatsappHref} size="md">
                Enquire on WhatsApp
              </WhatsAppButton>
            ) : null}
            <Link
              to="/all-cars"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-primary px-5 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5 active:scale-95"
            >
              Browse all cars
            </Link>
          </div>
          */}

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Rental services">
            {services.map((service) => (
              <Chip key={service.label} tone="primary" size="sm">
                <service.icon aria-hidden="true" className="mr-1.5 size-3.5 shrink-0" />
                {service.label}
              </Chip>
            ))}
          </div>
        </motion.div>

        {heroImage ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: 'easeOut' }}
            className="relative"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-8 -bottom-3 h-12 rounded-full bg-primary/10 blur-2xl"
            />
            <CarImage
              image={heroImage}
              alt={heroImage.alt ?? (heroCar ? `${heroCar.name} rental car` : 'Sri Venkateshwara Cars')}
              sizes="(max-width: 767px) calc(100vw - 32px), 50vw"
              priority
              aspect={16 / 9}
              cldFit="auto"
              containerClassName="rounded-2xl border border-slate-100 shadow-card"
            />
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
