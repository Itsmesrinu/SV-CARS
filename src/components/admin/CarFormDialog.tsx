/**
 * Add / edit a car. One component, two modes (P04 Task 4).
 *
 * The delicate part is the three nullable pricing columns. `null` means "use the
 * settings default"; `0` means "this car's driver is free". An empty field must
 * therefore travel as `null`, never as `0` — see `parseOptional()` below.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocations, useSettings } from '@/src/hooks';
import { officeLabel } from '@/src/lib/locationHelpers';
import type { CarDTO, CarInput } from '@/src/types/api';
import type { CarFormMode, CarFormValues, FormErrors } from '@/src/types/admin';
import AdminDialog from './AdminDialog';
import { errorMessage, useCarCreate, useCarUpdate } from './adminApi';
import {
  BTN_PRIMARY,
  BTN_QUIET,
  ERROR_TEXT,
  FIELD,
  FIELD_ERROR,
  HELP,
  LABEL,
  PANEL,
  SWITCH_TRACK_EMERALD,
} from './adminStyles';

interface CarFormDialogProps {
  open: boolean;
  mode: CarFormMode;
  /** Places a new car at the end of the fleet. Derived from the live list, not invented. */
  nextSortOrder: number;
  /** Every `carType` already in use, for the free-text datalist. */
  carTypes: string[];
  onClose: () => void;
  /** Fired after a successful create, so the dashboard can offer to add photos. */
  onCreated?: (car: CarDTO) => void;
}

const EMPTY: CarFormValues = {
  name: '',
  carType: '',
  seating: '',
  fuel: '',
  transmission: '',
  year: '',
  description: '',
  locationId: '',
  pricePerDay: '',
  driverPricePerDay: '',
  kmLimitPerDay: '',
  extraKmCharge: '',
  selfDrive: true,
  withDriver: true,
  availability: true,
  deliveryAvailable: false,
  isFeatured: false,
  tags: '',
};

export default function CarFormDialog({
  open,
  mode,
  nextSortOrder,
  carTypes,
  onClose,
  onCreated,
}: CarFormDialogProps) {
  const locationsQuery = useLocations();
  const settingsQuery = useSettings();
  const create = useCarCreate();
  const update = useCarUpdate();

  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);
  const settings = settingsQuery.data;

  const [values, setValues] = useState<CarFormValues>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const editingCar = mode.mode === 'edit' ? mode.car : null;
  const editingId = editingCar?.id ?? null;
  const soleLocationId = locations.length === 1 ? locations[0].id : '';

  // Reload the working copy when the dialog opens or switches car, so reopening
  // after a cancel never shows the previous car's half-typed values.
  //
  // Keyed on `editingId` rather than on `mode`: the parent rebuilds that object
  // literal every render, so depending on it would reset the form on every
  // keystroke. Same reason `values` is absent from the deps.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);
    setValues(editingCar ? toValues(editingCar) : { ...EMPTY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  // A new car defaults to the only branch when there is exactly one. That is not
  // inventing data — it is the single true answer — and it keeps the car out of
  // the invisible-to-city-filtered-customers state of CONTRACT.md §15.5.
  //
  // Separate from the reset above because `useLocations()` may still be loading
  // when the dialog opens; this fills the default in when the answer arrives,
  // and never overwrites a branch the owner has already picked.
  useEffect(() => {
    if (!open || editingId || soleLocationId === '') return;
    setValues((prev) => (prev.locationId === '' ? { ...prev, locationId: soleLocationId } : prev));
  }, [open, editingId, soleLocationId]);

  const isPending = create.isPending || update.isPending;

  function set<K extends keyof CarFormValues>(key: K, value: CarFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPending) return;

    const found = validate(values);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0] as keyof CarFormValues | undefined;
    if (firstInvalid) {
      window.requestAnimationFrame(() => {
        const control = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`);
        control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        control?.focus({ preventScroll: true });
      });
      return;
    }

    setSubmitError(null);
    const input = toInput(values, mode.mode === 'edit' ? mode.car.sortOrder : nextSortOrder);

    try {
      if (mode.mode === 'edit') {
        await update.run({ id: mode.car.id, patch: input });
      } else {
        const created = await create.run(input);
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      // The server is the authority on validation; if its rules and ours ever
      // disagree, the owner needs to read the server's reason, not ours.
      setSubmitError(errorMessage(err, 'Could not save this car. Please try again.'));
    }
  }

  return (
    <AdminDialog
      open={open}
      title={mode.mode === 'edit' ? `Edit ${mode.car.name}` : 'Add a Car'}
      subtitle={
        mode.mode === 'edit'
          ? `ID: ${mode.car.id}`
          : 'Leave anything you do not know yet blank — you can fill it in later.'
      }
      onClose={onClose}
      initialFocusRef={firstFieldRef}
      footer={
        <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-3">
          {submitError && (
            <p role="alert" className={`${ERROR_TEXT} mt-0 md:mr-auto`}>
              {submitError}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={`${BTN_QUIET} min-h-11`}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="car-form"
            disabled={isPending}
            className={`${BTN_PRIMARY} min-h-11 flex items-center justify-center gap-2`}
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode.mode === 'edit' ? 'Save Changes' : 'Add Car'}
          </button>
        </div>
      }
    >
      <form ref={formRef} id="car-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* --- Identity --- */}
        <Group title="Identity">
          <Field name="name" label="Name" required error={errors.name} className="md:col-span-2">
            <input
              ref={firstFieldRef}
              {...fieldA11y('name', errors.name)}
              className={controlClass(errors.name)}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field name="carType" label="Body type" error={errors.carType}>
            <input
              {...fieldA11y('carType', errors.carType)}
              className={controlClass(errors.carType)}
              list="car-type-options"
              value={values.carType}
              onChange={(e) => set('carType', e.target.value)}
              placeholder="e.g. SUV"
            />
            <datalist id="car-type-options">
              {carTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className={HELP}>Free text — pick an existing one or type a new one.</p>
          </Field>

          <Field name="year" label="Year" error={errors.year}>
            <input
              {...fieldA11y('year', errors.year)}
              type="number"
              min={1980}
              max={2100}
              inputMode="numeric"
              className={controlClass(errors.year)}
              value={values.year}
              onChange={(e) => set('year', e.target.value)}
            />
          </Field>

          <Field name="description" label="Description" className="md:col-span-2">
            <textarea
              {...fieldA11y('description')}
              rows={3}
              className={controlClass()}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </Group>

        {/* --- Capacity --- */}
        <Group title="Capacity">
          <Field name="seating" label="Seating" error={errors.seating}>
            <input
              {...fieldA11y('seating', errors.seating)}
              type="number"
              min={1}
              max={60}
              inputMode="numeric"
              className={controlClass(errors.seating)}
              value={values.seating}
              onChange={(e) => set('seating', e.target.value)}
            />
          </Field>

          <Field name="fuel" label="Fuel" error={errors.fuel}>
            <input
              {...fieldA11y('fuel', errors.fuel)}
              className={controlClass(errors.fuel)}
              value={values.fuel}
              onChange={(e) => set('fuel', e.target.value)}
            />
          </Field>

          <Field name="transmission" label="Transmission" error={errors.transmission}>
            <input
              {...fieldA11y('transmission', errors.transmission)}
              className={controlClass(errors.transmission)}
              value={values.transmission}
              onChange={(e) => set('transmission', e.target.value)}
            />
          </Field>
        </Group>

        {/* --- Pricing --- */}
        <Group title="Pricing">
          <Field name="pricePerDay" label="Price per day (₹)" error={errors.pricePerDay}>
            <input
              {...fieldA11y('pricePerDay', errors.pricePerDay)}
              type="number"
              min={0}
              inputMode="numeric"
              className={controlClass(errors.pricePerDay)}
              value={values.pricePerDay}
              onChange={(e) => set('pricePerDay', e.target.value)}
              placeholder="Not set yet"
            />
          </Field>

          <Field
            name="driverPricePerDay"
            label="Driver charge per day (₹)"
            error={errors.driverPricePerDay}
          >
            <input
              {...fieldA11y('driverPricePerDay', errors.driverPricePerDay)}
              type="number"
              min={0}
              inputMode="numeric"
              className={controlClass(errors.driverPricePerDay)}
              value={values.driverPricePerDay}
              onChange={(e) => set('driverPricePerDay', e.target.value)}
              placeholder={defaultPlaceholder(settings?.defaultDriverPricePerDay)}
            />
          </Field>

          <Field name="kmLimitPerDay" label="Km limit per day" error={errors.kmLimitPerDay}>
            <input
              {...fieldA11y('kmLimitPerDay', errors.kmLimitPerDay)}
              type="number"
              min={0}
              inputMode="numeric"
              className={controlClass(errors.kmLimitPerDay)}
              value={values.kmLimitPerDay}
              onChange={(e) => set('kmLimitPerDay', e.target.value)}
              placeholder={defaultPlaceholder(settings?.defaultKmLimitPerDay)}
            />
          </Field>

          <Field name="extraKmCharge" label="Extra km charge (₹)" error={errors.extraKmCharge}>
            <input
              {...fieldA11y('extraKmCharge', errors.extraKmCharge)}
              type="number"
              min={0}
              inputMode="numeric"
              className={controlClass(errors.extraKmCharge)}
              value={values.extraKmCharge}
              onChange={(e) => set('extraKmCharge', e.target.value)}
              placeholder={defaultPlaceholder(settings?.defaultExtraKmCharge)}
            />
          </Field>

          <p className={`${HELP} md:col-span-2 mt-0`}>
            Leave the last three blank to use the business defaults. Entering 0 means this car
            really charges nothing for it.
          </p>
        </Group>

        {/* --- Availability and placement --- */}
        <Group title="Availability & placement">
          <Field name="locationId" label="Rents from" className="md:col-span-2">
            {locations.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium">
                No branches yet. Use <span className="font-bold text-primary">Manage Cities</span> on
                the dashboard to add the city and office address this car rents from.
              </p>
            ) : (
              <>
                <select
                  {...fieldA11y('locationId')}
                  className={controlClass()}
                  value={values.locationId}
                  onChange={(e) => set('locationId', e.target.value)}
                >
                  <option value="">No branch yet</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {officeLabel(loc)}
                    </option>
                  ))}
                </select>
                {values.locationId === '' && (
                  <p className={HELP}>
                    A car with no branch is hidden from customers who have picked a city.
                  </p>
                )}
              </>
            )}
          </Field>
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Switch
              label="Self drive"
              checked={values.selfDrive}
              onChange={(v) => set('selfDrive', v)}
            />
            <Switch
              label="With driver"
              checked={values.withDriver}
              onChange={(v) => set('withDriver', v)}
            />
            <Switch
              label="Available"
              checked={values.availability}
              onChange={(v) => set('availability', v)}
              hint="Off = not rentable at all. For dated bookings use the availability calendar."
            />
            <Switch
              label="Home delivery"
              checked={values.deliveryAvailable}
              onChange={(v) => set('deliveryAvailable', v)}
            />
            <Switch
              label="Featured on home page"
              checked={values.isFeatured}
              onChange={(v) => set('isFeatured', v)}
            />
          </div>

          <Field name="tags" label="Tags" className="md:col-span-2">
            <input
              {...fieldA11y('tags')}
              className={controlClass()}
              value={values.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="Comma separated"
            />
          </Field>
        </Group>
      </form>
    </AdminDialog>
  );
}

// --- presentational helpers -------------------------------------------------

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4 md:p-5">
      <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-4">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({
  name,
  label,
  required,
  error,
  className = '',
  children,
}: {
  name: keyof CarFormValues;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = `car-${name}`;
  return (
    <label htmlFor={id} className={`block ${className}`}>
      <span className={`${LABEL} block mb-2`}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      )}
    </label>
  );
}

function fieldA11y(name: keyof CarFormValues, error?: string) {
  const id = `car-${name}`;
  return {
    id,
    'data-field': name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}

function controlClass(error?: string): string {
  return `${error ? FIELD_ERROR : FIELD} min-h-11`;
}

function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <div className={`${PANEL} min-h-14 flex items-center justify-between gap-4`}>
      <div>
        <span className={LABEL}>{label}</span>
        {hint && <p className="text-xs font-medium text-slate-500 mt-1">{hint}</p>}
      </div>
      <label className="relative inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          className="absolute inset-0 w-full h-full opacity-0 peer cursor-pointer"
          aria-label={label}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`${SWITCH_TRACK_EMERALD} pointer-events-none`} />
      </label>
    </div>
  );
}

// --- value mapping ----------------------------------------------------------

function toValues(car: CarDTO): CarFormValues {
  return {
    name: car.name,
    carType: car.carType ?? '',
    seating: car.seating === null ? '' : String(car.seating),
    fuel: car.fuel ?? '',
    transmission: car.transmission ?? '',
    year: car.year === null ? '' : String(car.year),
    description: car.description ?? '',
    locationId: car.location?.id ?? '',
    // 0 means "not set yet" (CONTRACT.md §3), so it shows as an empty field.
    pricePerDay: car.pricePerDay === 0 ? '' : String(car.pricePerDay),
    driverPricePerDay: car.driverPricePerDay === null ? '' : String(car.driverPricePerDay),
    kmLimitPerDay: car.kmLimitPerDay === null ? '' : String(car.kmLimitPerDay),
    extraKmCharge: car.extraKmCharge === null ? '' : String(car.extraKmCharge),
    selfDrive: car.selfDrive,
    withDriver: car.withDriver,
    availability: car.availability,
    deliveryAvailable: car.deliveryAvailable,
    isFeatured: car.isFeatured,
    tags: car.tags.join(', '),
  };
}

/** Blank text → `null`. Never an empty string, which would be invented data. */
function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Blank number → `null` ("inherit the default"). The single most consequential
 * line in this file: returning 0 here would make a car's driver free.
 */
function parseOptional(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function toInput(values: CarFormValues, sortOrder: number): CarInput {
  return {
    name: values.name.trim(),
    carType: trimmedOrNull(values.carType),
    seating: parseOptional(values.seating),
    fuel: trimmedOrNull(values.fuel),
    transmission: trimmedOrNull(values.transmission),
    year: parseOptional(values.year),
    description: trimmedOrNull(values.description),
    // pricePerDay is NOT nullable: blank means "not set yet", which is 0.
    pricePerDay: values.pricePerDay.trim() === '' ? 0 : Number(values.pricePerDay),
    driverPricePerDay: parseOptional(values.driverPricePerDay),
    kmLimitPerDay: parseOptional(values.kmLimitPerDay),
    extraKmCharge: parseOptional(values.extraKmCharge),
    selfDrive: values.selfDrive,
    withDriver: values.withDriver,
    availability: values.availability,
    deliveryAvailable: values.deliveryAvailable,
    isFeatured: values.isFeatured,
    tags: values.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    sortOrder,
    locationId: values.locationId === '' ? null : values.locationId,
  };
}

function defaultPlaceholder(value: number | undefined): string {
  return value === undefined ? 'Business default' : `${value} (default)`;
}

// --- validation, mirroring P01's zod rules ----------------------------------

function validate(values: CarFormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.name.trim() === '') errors.name = 'Give the car a name.';

  checkInt(errors, 'seating', values.seating, 1, 60, 'Seats must be between 1 and 60.');
  checkInt(errors, 'year', values.year, 1980, 2100, 'Year must be between 1980 and 2100.');
  checkInt(errors, 'pricePerDay', values.pricePerDay, 0, Infinity, 'Enter a whole rupee amount.');
  checkInt(errors, 'driverPricePerDay', values.driverPricePerDay, 0, Infinity, 'Enter a whole rupee amount.');
  checkInt(errors, 'kmLimitPerDay', values.kmLimitPerDay, 0, Infinity, 'Enter a whole number of km.');
  checkInt(errors, 'extraKmCharge', values.extraKmCharge, 0, Infinity, 'Enter a whole rupee amount.');

  return errors;
}

/** Blank always passes — every one of these fields is legitimately optional. */
function checkInt(
  errors: FormErrors,
  key: keyof CarFormValues,
  raw: string,
  min: number,
  max: number,
  message: string,
) {
  const trimmed = raw.trim();
  if (trimmed === '') return;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) errors[key] = message;
}
