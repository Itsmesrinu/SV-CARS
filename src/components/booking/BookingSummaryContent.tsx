import { Calendar, MapPin, Shield, Gauge } from 'lucide-react';
import type { CarDTO, SettingsDTO } from '@/src/types/api';
import CarImage from '@/src/components/CarImage';
import {
  calcTotal,
  effectiveDriverRate,
  effectiveExtraKm,
  effectiveKmLimit,
  primaryImage,
} from '@/src/lib/carHelpers';
import { formatDate } from '@/src/lib/availability';

interface BookingSummaryContentProps {
  car: CarDTO;
  settings: SettingsDTO;
  days: number;
  startDate: string;
  endDate: string;
  mode: 'self' | 'driver';
}

export default function BookingSummaryContent({
  car,
  settings,
  days,
  startDate,
  endDate,
  mode,
}: BookingSummaryContentProps) {
  const modeLabel = mode === 'self' ? 'Self Drive' : 'With Driver';
  const driverRate = effectiveDriverRate(car, settings);
  const kmLimit = effectiveKmLimit(car, settings);
  const extraKm = effectiveExtraKm(car, settings);
  const { basePrice, driverTotal, total } = calcTotal(car, settings, days, mode);
  const category = car.carType ?? '';
  // The car's branch city, or the settings fallback for a car with no branch.
  const pickupCity = car.location?.city ?? settings.pickupAddress;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">Secure Reservation</span>
        <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900 md:text-5xl">Confirm your booking</h1>
      </div>

      {/* Main Bento Summary Card */}
      <div className="min-w-0 rounded-2xl bg-surface-container-low p-5 md:p-8">
        <div className="grid min-w-0 gap-6 md:grid-cols-2 md:gap-8">
          {/* Car Image & Model */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-white shadow-sm">
              <CarImage
                image={primaryImage(car)}
                alt={car.name}
                sizes="(max-width: 768px) 100vw, 400px"
                aspect={16 / 9}
                containerClassName="w-full h-full"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-extrabold tracking-tight text-slate-900">{car.name}</h2>
              <p className="mt-1 break-words font-medium text-slate-500">{[category, modeLabel].filter(Boolean).join(' • ')}</p>
            </div>
          </div>

          {/* Technical Specs Bento */}
          <div className="grid min-w-0 grid-cols-2 gap-3 md:gap-4">
            <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 shadow-sm md:p-4">
              <Calendar aria-hidden="true" className="size-5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Duration</span>
              <span className="text-sm font-bold text-slate-900">{days} {days > 1 ? 'Days' : 'Day'}</span>
              <span className="break-words text-xs font-semibold leading-relaxed text-slate-500">
                {formatDate(startDate)} → {formatDate(endDate)}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 shadow-sm md:p-4">
              <MapPin aria-hidden="true" className="size-5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Pick-up</span>
              <span className="break-words text-sm font-bold text-slate-900">{pickupCity}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 shadow-sm md:p-4">
              <Shield aria-hidden="true" className="size-5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Insurance</span>
              <span className="text-sm font-bold text-slate-900">Included</span>
            </div>
            <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-3 shadow-sm md:p-4">
              <Gauge aria-hidden="true" className="size-5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Mileage</span>
              <span className="break-words text-sm font-bold text-slate-900">{mode === 'self' ? `${kmLimit} km/day` : 'With Driver'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Price Breakdown Section */}
      <div className="flex min-w-0 flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card md:p-8">
        <h3 className="text-xl font-bold tracking-tight text-slate-900">Booking Summary</h3>
        <div className="space-y-4">
          {/* Nothing is shown at ₹0 — the owner hasn't entered a rate yet, and a
              quoted zero is worse than an honest "we'll confirm on WhatsApp". */}
          {car.pricePerDay > 0 ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-slate-500">
              <span className="min-w-0">Daily Rate (₹{car.pricePerDay.toLocaleString()} × {days})</span>
              <span className="font-medium text-slate-900">₹{basePrice.toLocaleString()}</span>
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-slate-500">
              <span>Daily Rate</span>
              <span className="font-medium text-slate-900">On request</span>
            </div>
          )}
          {mode === 'driver' && driverRate > 0 && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-slate-500">
              <span className="min-w-0">Driver Charge (₹{driverRate.toLocaleString()}/day × {days})</span>
              <span className="font-medium text-slate-900">₹{driverTotal.toLocaleString()}</span>
            </div>
          )}
          {mode === 'self' && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-slate-500">
              <span className="min-w-0">Extra KM Charge</span>
              <span className="max-w-44 text-right font-medium text-slate-900">₹{extraKm.toLocaleString()}/km beyond {kmLimit} km/day</span>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-slate-500">
            <span>Insurance & Protection</span>
            <span className="font-medium text-emerald-600">Included</span>
          </div>
          <div className="h-px w-full bg-slate-200" />
          <div className="flex items-end justify-between gap-4 rounded-xl bg-surface-container-low p-4">
            <div>
              <span className="block text-lg font-bold text-slate-900">Total</span>
              {car.pricePerDay === 0 ? (
                <span className="mt-1 block text-xs text-slate-500">We’ll confirm the rate in WhatsApp.</span>
              ) : null}
            </div>
            <span className="shrink-0 text-right text-2xl font-extrabold tracking-tight text-primary">
              {car.pricePerDay > 0 ? `₹${total.toLocaleString()}` : 'On request'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
