import type { SettingsDTO } from '@/src/types/api';

export const BUSINESS_NAME = 'Sri Venkateshwara Cars';

export const INSTAGRAM_URL =
  'https://www.instagram.com/carssrivenkateshwara?igsh=MW9tcXBlbzB5M3ZhNw==';

const GENERAL_ENQUIRY_MESSAGE =
  'Hello Sri Venkateshwara Cars! I would like to enquire about renting a car.';

/**
 * General enquiries have no car context, so they cannot use buildWhatsAppUrl.
 * Keep the contract-approved fallback in this one place for every shell CTA.
 */
export function buildGeneralWhatsAppUrl(
  settings: Pick<SettingsDTO, 'whatsappPhone'>,
): string {
  const phone = settings.whatsappPhone.replace(/\D/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(GENERAL_ENQUIRY_MESSAGE)}`;
}

/**
 * Location-delivery enquiry. Builds the wa.me URL with a custom message
 * containing the customer's Google Maps link. Centralised here so no other
 * file needs to hand-write a wa.me URL.
 */
export function buildDeliveryWhatsAppUrl(phone: string, mapsLink: string): string {
  const digits = phone.replace(/\D/g, '');
  const message = `Hi, I want car delivery to my location: ${mapsLink}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function phoneHref(phone: string): string {
  return `tel:+${phone.replace(/\D/g, '')}`;
}

export function phoneLabel(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}
