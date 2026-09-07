/**
 * Admin-only view types (P04).
 *
 * The old `Vehicle` type and its four hardcoded Unsplash rows are gone: they
 * matched neither `docs/data-model.md` nor the real fleet, and every field they
 * carried now comes from `CarDTO` (CONTRACT.md §3, §3.1). What is left here is
 * strictly presentational state that never crosses the API boundary.
 */

import type { CarDTO, ImageKind } from '@/src/types/api';

export interface StatItem {
  label: string;
  value: string | number;
  trend?: string;
  trendIcon?: 'up' | 'down' | 'check' | 'build';
  variant: 'primary' | 'success' | 'warning';
  key?: string;
}

/** `CarFormDialog` serves create and edit from one component. */
export type CarFormMode = { mode: 'create' } | { mode: 'edit'; car: CarDTO };

/**
 * The car form's working copy.
 *
 * Every numeric field is held as a **string**, deliberately. An empty string is
 * the only way to express "inherit the settings default" for the three nullable
 * pricing columns — coercing to a number too early is how `null` becomes `0` and
 * a car's driver silently becomes free (P04 Task 4).
 */
export interface CarFormValues {
  name: string;
  carType: string;
  seating: string;
  fuel: string;
  transmission: string;
  year: string;
  description: string;
  locationId: string;          // '' => no branch
  pricePerDay: string;
  driverPricePerDay: string;   // '' => inherit
  kmLimitPerDay: string;       // '' => inherit
  extraKmCharge: string;       // '' => inherit
  selfDrive: boolean;
  withDriver: boolean;
  availability: boolean;
  deliveryAvailable: boolean;
  isFeatured: boolean;
  tags: string;                // comma-separated
}

/** The branch form's working copy. Same string-for-numbers rule as above. */
export interface LocationFormValues {
  city: string;
  addressShort: string;
  directionsUrl: string;
  addressFull: string;
  officeName: string;
  whatsappPhone: string;
  isActive: boolean;
  sortOrder: string;
}

/** Field name → message. Empty object means the form is valid. */
export type FormErrors = Record<string, string>;

export type UploadStage = 'queued' | 'preparing' | 'uploading' | 'saving' | 'done' | 'error';

/**
 * One file's journey through the four-step browser→Cloudinary→API upload
 * (P04 Task 5). Tracked per file so a single failure reports itself instead of
 * aborting the batch.
 */
export interface UploadItem {
  id: string;
  fileName: string;
  stage: UploadStage;
  progress: number;      // 0–100, from XMLHttpRequest.upload.onprogress
  error: string | null;
  kind: ImageKind;
}