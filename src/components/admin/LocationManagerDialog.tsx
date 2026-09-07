/**
 * Branch manager — the multi-city amendment's reason for existing
 * (CONTRACT.md §15, P04 Task 6).
 *
 * The client asked for exactly three things: type in a city, the office address,
 * and a map link, and have the site use them. Those three are the first three
 * fields, labelled in his words, and everything else is optional.
 *
 * Two things here are load-bearing:
 *
 *  - **`addressShort` becomes the `Pickup:` line of every WhatsApp message** for
 *    cars at this branch. It is the highest-consequence input on the screen, so
 *    the helper text says so.
 *  - **`directionsUrl` ends up in an `href` the owner's browser follows.** It is
 *    validated here, again by P01 on write, and again by `directionsHref()` at
 *    render (§15.3). This file is the first of those three layers, not the only one.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCars, useSettings } from '@/src/hooks';
import { directionsHref, officeLabel } from '@/src/lib/locationHelpers';
import type { LocationDTO, LocationInput } from '@/src/types/api';
import type { FormErrors, LocationFormValues } from '@/src/types/admin';
import AdminDialog from './AdminDialog';
import {
  errorMessage,
  isConflictError,
  useAllLocations,
  useLocationCreate,
  useLocationDelete,
  useLocationUpdate,
} from './adminApi';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_QUIET,
  BTN_SECONDARY,
  ERROR_TEXT,
  FIELD,
  FIELD_ERROR,
  HELP,
  LABEL,
  PANEL,
  SWITCH_TRACK_EMERALD,
} from './adminStyles';

const EMPTY: LocationFormValues = {
  city: '',
  addressShort: '',
  directionsUrl: '',
  addressFull: '',
  officeName: '',
  whatsappPhone: '',
  isActive: true,
  sortOrder: '0',
};

interface LocationManagerDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function LocationManagerDialog({ open, onClose }: LocationManagerDialogProps) {
  const locationsQuery = useAllLocations();
  const carsQuery = useCars();
  const settingsQuery = useSettings();

  const create = useLocationCreate();
  const update = useLocationUpdate();
  const remove = useLocationDelete();

  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);
  const cars = useMemo(() => carsQuery.data ?? [], [carsQuery.data]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [values, setValues] = useState<LocationFormValues>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const addBranchRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<LocationDTO | null>(null);
  const [deleteConflict, setDeleteConflict] = useState(false);
  const [deleteChoice, setDeleteChoice] = useState<'deactivate' | 'force'>('deactivate');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Start clean each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setView('list');
    setEditingId(null);
    setValues(EMPTY);
    setErrors({});
    setSubmitError(null);
    setDeleteTarget(null);
  }, [open]);

  const isPending = create.isPending || update.isPending;

  function set<K extends keyof LocationFormValues>(key: K, value: LocationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  }

  function startEdit(location: LocationDTO) {
    setEditingId(location.id);
    setValues(toValues(location));
    setErrors({});
    setSubmitError(null);
    setView('form');
  }

  function startCreate() {
    setEditingId(null);
    // A new branch goes after the existing ones.
    setValues({ ...EMPTY, sortOrder: String(locations.length) });
    setErrors({});
    setSubmitError(null);
    setView('form');
  }

  function returnToList() {
    setView('list');
    setEditingId(null);
    setErrors({});
    setSubmitError(null);
    window.requestAnimationFrame(() => addBranchRef.current?.focus());
  }

  useEffect(() => {
    if (!open || view !== 'form') return;
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[data-field="city"]')?.focus());
  }, [open, view, editingId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPending) return;

    const found = validate(values);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0] as keyof LocationFormValues | undefined;
    if (firstInvalid) {
      window.requestAnimationFrame(() => {
        const control = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid}"]`);
        control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        control?.focus({ preventScroll: true });
      });
      return;
    }

    setSubmitError(null);
    const input = toInput(values);

    try {
      if (editingId) {
        await update.run({ id: editingId, patch: input });
      } else {
        await create.run(input);
      }
      returnToList();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Could not save this branch. Please try again.'));
    }
  }

  function carsAt(locationId: string): number {
    return cars.filter((car) => car.location?.id === locationId).length;
  }

  function askDelete(location: LocationDTO) {
    setDeleteTarget(location);
    // Pre-empt the round trip when we can already see the cars pointing at it,
    // so the owner meets the safe choice first rather than a bare confirm.
    const conflicted = carsAt(location.id) > 0;
    setDeleteConflict(conflicted);
    setDeleteChoice('deactivate');
    setDeleteError(null);
  }

  async function runDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);

    // "Deactivate instead" is a normal update — the branch and its cars survive,
    // the city just stops appearing to customers.
    if (deleteConflict && deleteChoice === 'deactivate') {
      try {
        await update.run({ id: deleteTarget.id, patch: { isActive: false } });
        setDeleteTarget(null);
        if (editingId === deleteTarget.id) startCreate();
      } catch (err) {
        setDeleteError(errorMessage(err, 'Could not deactivate this branch.'));
      }
      return;
    }

    try {
      await remove.run({ id: deleteTarget.id, force: deleteConflict });
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) startCreate();
    } catch (err) {
      // The 409 is the server telling us cars still reference this branch. Never
      // swallow it — switch the dialog into the two-honest-choices mode.
      if (isConflictError(err)) {
        setDeleteConflict(true);
        setDeleteChoice('deactivate');
        setDeleteError(null);
        return;
      }
      setDeleteError(errorMessage(err, 'Could not delete this branch.'));
    }
  }

  const settings = settingsQuery.data;
  const previewHref = directionsHref(toDraft(values));
  const hasMapLink = values.directionsUrl.trim() !== '';
  const affectedCars = deleteTarget ? carsAt(deleteTarget.id) : 0;

  return (
    <>
      <AdminDialog
        open={open}
        title={view === 'list' ? 'Manage Cities' : editingId ? 'Edit Branch' : 'Add a Branch'}
        subtitle={
          view === 'list'
            ? 'Choose a branch to edit, or add a new city.'
            : 'A city, an office address and a map link. Customers browse by city.'
        }
        onClose={onClose}
        widthClassName="max-w-3xl"
        initialFocusRef={view === 'list' ? addBranchRef : undefined}
        footer={
          view === 'list' ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
              <button type="button" onClick={onClose} className={`${BTN_QUIET} min-h-11`}>
                Close
              </button>
              <button
                ref={addBranchRef}
                type="button"
                onClick={startCreate}
                className={`${BTN_PRIMARY} min-h-11 inline-flex items-center justify-center gap-2`}
              >
                <Plus aria-hidden="true" className="w-4 h-4" />
                Add Branch
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-3">
              {submitError && (
                <p role="alert" className={`${ERROR_TEXT} mt-0 md:mr-auto`}>
                  {submitError}
                </p>
              )}
              <button
                type="button"
                onClick={returnToList}
                disabled={isPending}
                className={`${BTN_QUIET} min-h-11 inline-flex items-center justify-center gap-2`}
              >
                <ArrowLeft aria-hidden="true" className="w-4 h-4" />
                Back to Branches
              </button>
              <button
                type="submit"
                form="location-form"
                disabled={isPending}
                className={`${BTN_PRIMARY} min-h-11 flex items-center justify-center gap-2`}
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Save Branch' : 'Add Branch'}
              </button>
            </div>
          )
        }
      >
        {view === 'list' ? (
          <section aria-labelledby="branches-heading">
            <h3 id="branches-heading" className={`${LABEL} mb-4`}>
              Your Branches
            </h3>
          {locationsQuery.isPending ? (
            <p className="text-sm text-slate-500 font-medium">Loading…</p>
          ) : locations.length === 0 ? (
            <div className={PANEL}>
              <p className="text-sm text-slate-600 font-medium">
                No branches yet. Adding a city turns on city filtering for customers — they pick a
                city and see only the cars that rent from it. Use Add Branch to create the first
                one.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {locations.map((location) => (
                <li
                  key={location.id}
                  className={`${PANEL} flex items-center justify-between gap-3 ${
                    editingId === location.id ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">
                      {officeLabel(location)}
                      {!location.isActive && (
                        <span className="ml-2 text-xs uppercase tracking-widest font-bold text-tertiary-container">
                          Hidden
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {location.addressShort}
                    </p>
                    <p className="text-xs uppercase tracking-widest font-bold text-slate-500 mt-1">
                      {carsAt(location.id)} car{carsAt(location.id) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(location)}
                      aria-label={`Edit ${officeLabel(location)}`}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white text-slate-500 hover:text-primary transition-colors active:scale-95"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => askDelete(location)}
                      aria-label={`Delete ${officeLabel(location)}`}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white text-slate-500 hover:text-red-500 transition-colors active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </section>
        ) : (
        <form
          ref={formRef}
          id="location-form"
          onSubmit={handleSubmit}
          className="space-y-5"
          noValidate
        >
          <Field name="city" label="City" required error={errors.city}>
            <input
              {...fieldA11y('city', errors.city)}
              className={controlClass(errors.city)}
              value={values.city}
              onChange={(e) => set('city', e.target.value)}
            />
            <p className={HELP}>This is the name customers pick from.</p>
          </Field>

          <Field
            name="addressShort"
            label="Short address (shown on booking)"
            required
            error={errors.addressShort}
          >
            <textarea
              {...fieldA11y('addressShort', errors.addressShort)}
              rows={2}
              className={controlClass(errors.addressShort)}
              value={values.addressShort}
              onChange={(e) => set('addressShort', e.target.value)}
            />
            <p className={HELP}>
              This exact text becomes the <span className="font-bold">Pickup:</span> line of every
              WhatsApp booking message for cars at this branch.
            </p>
          </Field>

          <Field
            name="directionsUrl"
            label="Google Maps link (Get Directions button)"
            error={errors.directionsUrl}
          >
            <input
              {...fieldA11y('directionsUrl', errors.directionsUrl)}
              type="url"
              inputMode="url"
              placeholder="https://"
              className={controlClass(errors.directionsUrl)}
              value={values.directionsUrl}
              onChange={(e) => set('directionsUrl', e.target.value)}
            />
            <p className={HELP}>
              Open the office in Google Maps → Share → Copy link. Leave it empty and the button
              searches Maps for the address above — optional, not broken.
            </p>
            {/* He pasted a URL; let him confirm where it goes BEFORE saving it. */}
            {!errors.directionsUrl && (values.addressShort.trim() !== '' || hasMapLink) && (
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 min-h-11 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline break-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                {hasMapLink ? 'Test this link' : 'Test the fallback map search'}
              </a>
            )}
          </Field>

          <Field name="addressFull" label="Full address (optional)">
            <textarea
              {...fieldA11y('addressFull')}
              rows={2}
              className={controlClass()}
              value={values.addressFull}
              onChange={(e) => set('addressFull', e.target.value)}
            />
            <p className={HELP}>The long postal address shown in the office section on the site.</p>
          </Field>

          <Field name="officeName" label="Office name (optional)">
            <input
              {...fieldA11y('officeName')}
              className={controlClass()}
              value={values.officeName}
              onChange={(e) => set('officeName', e.target.value)}
              placeholder={values.city.trim() ? `${values.city.trim()} Branch` : 'Leave blank for “<City> Branch”'}
            />
          </Field>

          <Field name="whatsappPhone" label="WhatsApp number (optional)" error={errors.whatsappPhone}>
            <input
              {...fieldA11y('whatsappPhone', errors.whatsappPhone)}
              inputMode="numeric"
              className={controlClass(errors.whatsappPhone)}
              value={values.whatsappPhone}
              onChange={(e) => set('whatsappPhone', e.target.value)}
              placeholder={settings ? `${settings.whatsappPhone} (default)` : 'Business default'}
            />
            <p className={HELP}>Digits with country code. Blank uses the business number.</p>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`${PANEL} min-h-14 flex items-center justify-between gap-4`}>
              <div>
                <span className={LABEL}>Active</span>
                <p className="text-xs font-medium text-slate-500">Off hides the city</p>
              </div>
              <label className="relative inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="absolute inset-0 w-full h-full opacity-0 peer cursor-pointer"
                  aria-label="Branch is active"
                  checked={values.isActive}
                  onChange={(e) => set('isActive', e.target.checked)}
                />
                <div className={`${SWITCH_TRACK_EMERALD} pointer-events-none`} />
              </label>
            </div>

            <Field name="sortOrder" label="Order" error={errors.sortOrder}>
              <input
                {...fieldA11y('sortOrder', errors.sortOrder)}
                type="number"
                min={0}
                inputMode="numeric"
                className={controlClass(errors.sortOrder)}
                value={values.sortOrder}
                onChange={(e) => set('sortOrder', e.target.value)}
              />
            </Field>
          </div>
        </form>
        )}
      </AdminDialog>

      {/* --- Delete / deactivate --- */}
      <AdminDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete ${officeLabel(deleteTarget)}?` : 'Delete branch'}
        onClose={remove.isPending || update.isPending ? () => {} : () => setDeleteTarget(null)}
        widthClassName="max-w-lg"
        footer={
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={remove.isPending || update.isPending}
              className={`${BTN_QUIET} min-h-11 w-full sm:w-auto`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void runDelete()}
              disabled={remove.isPending || update.isPending}
              className={`${
                deleteConflict && deleteChoice === 'deactivate' ? BTN_SECONDARY : BTN_DANGER
              } min-h-11 w-full sm:w-auto flex items-center justify-center gap-2`}
            >
              {(remove.isPending || update.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {deleteConflict && deleteChoice === 'deactivate' ? 'Deactivate' : 'Delete'}
            </button>
          </div>
        }
      >
        {deleteConflict ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="bg-tertiary-container/10 p-3 rounded-xl h-fit shrink-0">
                <AlertTriangle className="text-tertiary-container w-6 h-6" />
              </div>
              <p className="text-slate-600 font-medium text-sm">
                <span className="font-bold">
                  {affectedCars} car{affectedCars === 1 ? '' : 's'}
                </span>{' '}
                {affectedCars === 1 ? 'is' : 'are'} still assigned to this branch.
              </p>
            </div>

            <Choice
              selected={deleteChoice === 'deactivate'}
              onSelect={() => setDeleteChoice('deactivate')}
              title="Deactivate instead"
              detail="The branch stops appearing to customers. Every car keeps its address and its WhatsApp number. Recommended."
            />
            <Choice
              selected={deleteChoice === 'force'}
              onSelect={() => setDeleteChoice('force')}
              title="Delete anyway"
              detail={`Those ${affectedCars} car${affectedCars === 1 ? '' : 's'} will have no branch. They disappear from every city-filtered view until you reassign them.`}
            />
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="bg-red-500/10 p-3 rounded-xl h-fit shrink-0">
              <MapPin className="text-red-500 w-6 h-6" />
            </div>
            <p className="text-slate-600 font-medium text-sm">
              No cars are assigned to this branch, so nothing else changes. This cannot be undone.
            </p>
          </div>
        )}

        {deleteError && (
          <p role="alert" className={ERROR_TEXT}>
            {deleteError}
          </p>
        )}
      </AdminDialog>
    </>
  );
}

// --- presentational helpers -------------------------------------------------

function Field({
  name,
  label,
  required,
  error,
  children,
}: {
  name: keyof LocationFormValues;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const id = `location-${name}`;
  return (
    <label htmlFor={id} className="block">
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

function fieldA11y(name: keyof LocationFormValues, error?: string) {
  const id = `location-${name}`;
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

/** Two honest choices. "Delete anyway" must never be the easy path. */
function Choice({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full min-h-11 text-left p-4 rounded-xl border-2 transition-all ${
        selected ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <p className="font-bold text-sm text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 font-medium mt-1">{detail}</p>
    </button>
  );
}

// --- value mapping ----------------------------------------------------------

function toValues(location: LocationDTO): LocationFormValues {
  return {
    city: location.city,
    addressShort: location.addressShort,
    directionsUrl: location.directionsUrl ?? '',
    addressFull: location.addressFull ?? '',
    officeName: location.officeName ?? '',
    whatsappPhone: location.whatsappPhone ?? '',
    isActive: location.isActive,
    sortOrder: String(location.sortOrder),
  };
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toInput(values: LocationFormValues): LocationInput {
  return {
    city: values.city.trim(),
    officeName: trimmedOrNull(values.officeName),
    addressShort: values.addressShort.trim(),
    addressFull: trimmedOrNull(values.addressFull),
    directionsUrl: trimmedOrNull(values.directionsUrl),
    whatsappPhone: trimmedOrNull(values.whatsappPhone.replace(/[^\d]/g, '')),
    isActive: values.isActive,
    sortOrder: values.sortOrder.trim() === '' ? 0 : Number(values.sortOrder),
  };
}

/**
 * A throwaway `LocationDTO` so `directionsHref()` — the same function the public
 * page will call — can resolve the preview. Using the real helper rather than
 * re-deriving the URL is the point: the preview cannot disagree with the button.
 */
function toDraft(values: LocationFormValues): LocationDTO {
  return {
    id: 'draft',
    city: values.city.trim(),
    officeName: trimmedOrNull(values.officeName),
    addressShort: values.addressShort.trim(),
    addressFull: trimmedOrNull(values.addressFull),
    directionsUrl: trimmedOrNull(values.directionsUrl),
    whatsappPhone: trimmedOrNull(values.whatsappPhone),
    isActive: values.isActive,
    sortOrder: 0,
  };
}

// --- validation -------------------------------------------------------------

function validate(values: LocationFormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.city.trim() === '') errors.city = 'Enter the city.';
  if (values.addressShort.trim() === '') errors.addressShort = 'Enter the office address.';

  const url = values.directionsUrl.trim();
  if (url !== '' && !isHttpUrl(url)) {
    // Layer one of three (§15.3). A `javascript:` value must not even become a
    // request, let alone reach an href.
    errors.directionsUrl = 'Paste a link starting with http:// or https://.';
  }

  const phone = values.whatsappPhone.trim();
  if (phone !== '' && !/^\d{6,15}$/.test(phone)) {
    errors.whatsappPhone = 'Digits only, including the country code.';
  }

  const order = values.sortOrder.trim();
  if (order !== '' && (!Number.isInteger(Number(order)) || Number(order) < 0)) {
    errors.sortOrder = 'Enter a whole number.';
  }

  return errors;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
