/**
 * The ONE WhatsApp message builder (CONTRACT.md §11).
 *
 * Before this file there were four hand-written copies of the message body —
 * two URL builders (`CarDetailsPage.tsx:98-129`, `ConciergeSidebarContent.tsx:58-86`)
 * and a JSX "Message Preview" that duplicated one of them in markup. They were
 * already free to drift and Amendment 2 adds lines to all of them, so they are
 * collapsed here and every surface renders from `buildWhatsAppLines`.
 *
 * The message body is a contract, not copy. The emoji, the bullet character, the
 * blank lines, the line order and the wording were copied character by character
 * from those two files. The only permitted differences from the pre-build output:
 *
 *  1. the phone, pickup address, driver rate, km limit and extra-km charge come
 *     from the database instead of literals — and for today's single-branch fleet
 *     they resolve to exactly the same strings;
 *  2. the two date lines of Amendment 2 (§11.1), straight after `Duration:`;
 *  3. when `pricePerDay` is 0 the rate/total lines are dropped in favour of a
 *     request for a quote — see `showPrices` below.
 *
 * The two variants have deliberately different wording ("I'd like to book" vs
 * "I'd like to confirm my booking for"). That is why `variant` exists; it is not
 * a styling switch.
 */

import type { CarDTO, SettingsDTO } from '@/src/types/api';
import { formatDate } from './availability';
import {
  bookingPhone,
  calcTotal,
  effectiveDriverRate,
  effectiveExtraKm,
  effectiveKmLimit,
  pickupAddress,
} from './carHelpers';

export interface BookingContext {
  car: CarDTO;
  settings: SettingsDTO;
  /** 'YYYY-MM-DD'. Required — the customer always has dates (§16.4). */
  startDate: string;
  endDate: string;
  /** Always `rentalDays(startDate, endDate)`. Passed in so callers can't disagree. */
  days: number;
  mode: 'self' | 'driver';
  /** Absolute URL of the car detail page. */
  carPageUrl: string;
  /** Google Maps link from the geolocation share toggle, if the customer opted in. */
  locationLink?: string | null;
  /** 'details' keeps the CarDetailsPage wording, 'confirm' keeps the ConciergeSidebar wording. */
  variant: 'details' | 'confirm';
}

/**
 * The message body as lines, before URL encoding.
 *
 * Exported because `ConciergeSidebarContent` renders a live preview of the
 * message to the customer. Rendering it from this array is the only way the
 * preview cannot lie about what WhatsApp will actually receive.
 */
export function buildWhatsAppLines(ctx: BookingContext): string[] {
  const { car, settings, startDate, endDate, days, mode, carPageUrl, locationLink, variant } = ctx;

  const modeLabel = mode === 'self' ? 'Self Drive' : 'With Driver';
  const dailyRate = car.pricePerDay;
  const driverRate = effectiveDriverRate(car, settings);
  const kmLimit = effectiveKmLimit(car, settings);
  const extraKm = effectiveExtraKm(car, settings);
  const { driverTotal, total } = calcTotal(car, settings, days, mode);
  const pickup = pickupAddress(car, settings);
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  // After the migration every car sits at pricePerDay = 0 until the owner enters
  // real rates, and today's code would happily send him "Total: ₹0". A message
  // that asks for a rate is strictly better than one that quotes a fake zero.
  const priceKnown = dailyRate > 0;
  // A car that is off the road gets an enquiry, not a quote — the price is not
  // what that conversation is about (P05 Task 5).
  const showPrices = priceKnown && car.availability;

  if (variant === 'confirm') {
    const lines = [
      `Hello Sri Venkateshwara Cars!`,
      `I'd like to confirm my booking for the ${car.name} (${car.carType ?? ''}).`,
      ``,
      `• Drive Mode: ${modeLabel}`,
      `• Duration: ${days} ${days > 1 ? 'Days' : 'Day'}`,
      `• Start Date: ${start}`,
      `• End Date: ${end}`,
    ];
    if (showPrices) {
      lines.push(`• Rate: ₹${dailyRate.toLocaleString()}/day`);
    }
    if (mode === 'self') {
      lines.push(`• Kilometres: ${kmLimit} km/day`);
      lines.push(`• Extra KM: ₹${extraKm.toLocaleString()}/km`);
    }
    if (mode === 'driver' && driverRate > 0) {
      lines.push(`• Driver: ₹${driverRate.toLocaleString()}/day (₹${driverTotal.toLocaleString()} total)`);
    }
    if (showPrices) {
      lines.push(`• Total: ₹${total.toLocaleString()}`);
    } else if (!priceKnown) {
      lines.push(`• Please share the rate for these dates.`);
    }
    lines.push(`• Pickup: ${pickup}`);
    lines.push(``);
    lines.push(`🚗 Car Details: ${carPageUrl}`);
    if (locationLink) {
      lines.push(`📍 My Pickup Location: ${locationLink}`);
    }
    lines.push(``);
    lines.push(`Please confirm availability and send the agreement.`);
    return lines;
  }

  const lines = [
    `Hello Sri Venkateshwara Cars!`,
    `I'd like to book the following car:`,
    ``,
    `Car: ${car.name}`,
    `Category: ${car.carType ?? ''}`,
    `Drive Mode: ${modeLabel}`,
    `Duration: ${days} ${days > 1 ? 'Days' : 'Day'}`,
    `Start Date: ${start}`,
    `End Date: ${end}`,
  ];
  if (showPrices) {
    lines.push(`Price Per Day: ₹${dailyRate.toLocaleString()}`);
  }
  if (mode === 'self') {
    lines.push(`KM Limit: ${kmLimit} km/day`);
    lines.push(`Extra KM Charge: ₹${extraKm.toLocaleString()}/km`);
  }
  if (mode === 'driver' && driverRate > 0) {
    lines.push(`Driver Charge: ₹${driverRate.toLocaleString()}/day (₹${driverTotal.toLocaleString()} total)`);
  }
  if (showPrices) {
    lines.push(`Total: ₹${total.toLocaleString()}`);
  } else if (!priceKnown) {
    lines.push(`Please share the rate for these dates.`);
  }
  lines.push(``);
  lines.push(`Selected Car Page: ${carPageUrl}`);
  lines.push(``);
  if (locationLink) {
    lines.push(`Delivery Location: ${locationLink}`);
  }
  lines.push(``);
  lines.push(`Pickup: ${pickup}`);
  lines.push(`Please confirm availability.`);
  return lines;
}

/**
 * The `wa.me` deep link. A thin wrapper over `buildWhatsAppLines` — this is the
 * only place in the codebase that builds one, and there are no payments behind
 * it by design (CONTRACT.md §1 rule 3).
 */
export function buildWhatsAppUrl(ctx: BookingContext): string {
  const phone = bookingPhone(ctx.car, ctx.settings);
  const text = encodeURIComponent(buildWhatsAppLines(ctx).join('\n'));
  return `https://wa.me/${phone}?text=${text}`;
}