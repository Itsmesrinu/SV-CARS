/**
 * One car in the admin fleet grid.
 *
 * Same card as before — same classes, same `motion` entrance, same emerald
 * switches. What changed is underneath: it reads a real `CarDTO` and every
 * control persists through P03's mutation hooks instead of mutating a
 * `useState` array that a refresh threw away.
 *
 * Field mapping follows CONTRACT.md §3.1 via `src/lib/carHelpers.ts` and
 * `src/lib/availability.ts`. P05 maps the same fields on the public pages, and
 * hand-rolling either mapping is how the two drift apart.
 */

import { useEffect, useState } from 'react';
import { Image, Loader2, Trash2, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import type { CarDTO, CarInput } from '@/src/types/api';
import { primaryImage } from '@/src/lib/carHelpers';
import { availabilityLabel, carAvailability } from '@/src/lib/availability';
import { officeLabel } from '@/src/lib/locationHelpers';
import CarImage from '@/src/components/CarImage';
import ConfirmDialog from './ConfirmDialog';
import { errorMessage, useCarDelete, useCarUpdate } from './adminApi';
import {
  CARD,
  PANEL,
  SWITCH_TRACK_EMERALD,
  SWITCH_TRACK_PRIMARY,
  statusBadgeClass,
} from './adminStyles';

/** The three fields the card can flip inline. Kept narrow so the optimistic overlay stays typed. */
type OptimisticFields = Pick<CarDTO, 'availability' | 'isFeatured' | 'deliveryAvailable'>;

interface AdminVehicleCardProps {
  car: CarDTO;
  /**
   * False when the business has at most one branch. With a single office the
   * label is noise on every card, and CONTRACT.md §15.4 requires the pre-
   * amendment layout to survive untouched until a second city exists.
   */
  showBranch: boolean;
  onEditSpecs: (car: CarDTO) => void;
  onManageImages: (car: CarDTO) => void;
  key?: string;
}

export default function AdminVehicleCard({
  car,
  showBranch,
  onEditSpecs,
  onManageImages,
}: AdminVehicleCardProps) {
  const update = useCarUpdate();
  const remove = useCarDelete();

  const [optimistic, setOptimistic] = useState<Partial<OptimisticFields> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * `null` means "show the server's value". Any string means the owner is mid-
   * edit, which is also what lets the field sit visually empty at price 0.
   */
  const [priceDraft, setPriceDraft] = useState<string | null>(null);

  // What the card renders: server truth with any in-flight toggle laid over it.
  const view: CarDTO = optimistic ? { ...car, ...optimistic } : car;

  // Retire each optimistic value once the server's copy agrees. Clearing on the
  // mutation's resolve instead would flash the old value for the gap between
  // "mutation settled" and "query refetched", which reads as the toggle bouncing.
  useEffect(() => {
    setOptimistic((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next) as (keyof OptimisticFields)[]) {
        if (car[key] === next[key]) {
          delete next[key];
          changed = true;
        }
      }
      if (!changed) return prev;
      return Object.keys(next).length > 0 ? next : null;
    });
  }, [car]);

  async function toggle(field: keyof OptimisticFields, value: boolean) {
    setSaveError(null);
    setOptimistic((prev) => ({ ...prev, [field]: value }) as Partial<OptimisticFields>);
    try {
      await update.run({ id: car.id, patch: { [field]: value } as Partial<CarInput> });
    } catch (err) {
      // Roll back immediately: drop the overlay so the card falls back to the
      // server value the save failed to change.
      setOptimistic((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        delete next[field];
        return Object.keys(next).length > 0 ? next : null;
      });
      setSaveError(errorMessage(err, 'Could not save that change.'));
    }
  }

  // Debounced price persistence. 600ms is long enough that typing "1250" is one
  // request rather than four, short enough that the owner does not tab away first.
  useEffect(() => {
    if (priceDraft === null) return;

    const trimmed = priceDraft.trim();
    const parsed = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) return; // never persist garbage
    if (parsed === car.pricePerDay) {
      setPriceDraft(null);
      return;
    }

    const timer = setTimeout(() => {
      setSaveError(null);
      update
        .run({ id: car.id, patch: { pricePerDay: parsed } })
        .then((updated) => {
          // Do NOT clear the draft here. `useUpdateCar` invalidates rather than
          // writing through, so the list is still stale for a moment and
          // clearing now would flash the old price under the owner's cursor.
          // The equality branch above retires the draft once the refetch lands.
          // If the server normalised the value, adopt its number instead of ours.
          if (updated.pricePerDay !== parsed) {
            setPriceDraft(updated.pricePerDay === 0 ? '' : String(updated.pricePerDay));
          }
        })
        .catch((err) => {
          setPriceDraft(null); // rollback to the stored price
          setSaveError(errorMessage(err, 'Could not save the price.'));
        });
    }, 600);

    return () => clearTimeout(timer);
    // `update` is a fresh object each render; depending on it would re-arm the
    // timer on every keystroke's re-render and the debounce would never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceDraft, car.id, car.pricePerDay]);

  async function handleDelete() {
    try {
      await remove.run(car.id);
      setConfirmingDelete(false);
    } catch {
      // Left open so ConfirmDialog can show the reason.
    }
  }

  const status = carAvailability(view);
  const statusLabel = availabilityLabel(status);
  const priceValue = priceDraft ?? (car.pricePerDay === 0 ? '' : String(car.pricePerDay));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${CARD} group flex flex-col overflow-hidden border border-transparent transition-all hover:border-emerald-500/20 md:flex-row`}
    >
      {/* Image Section */}
      <div className="w-full md:w-2/5 relative h-56 md:h-auto overflow-hidden">
        {/*
          `cldFit` stays at its 'limit' default: CONTRACT.md §6.1 wants the owner
          to see the whole uncropped photo he uploaded, unlike the customer cards
          which crop to a fixed box.
        */}
        <CarImage
          image={primaryImage(car)}
          alt={car.name}
          sizes="(max-width: 768px) 100vw, 400px"
          containerClassName="w-full h-full"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />

        <button
          type="button"
          onClick={() => onManageImages(car)}
          className="absolute bottom-4 left-4 flex min-h-11 items-center gap-2 rounded-xl border border-white/60 bg-slate-950/85 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition-all hover:bg-slate-950 active:scale-95"
        >
          <Image className="size-4" aria-hidden="true" /> {car.images.length > 0 ? 'Swap Image' : 'Add Photos'}
        </button>

        <div className="absolute top-4 left-4">
          {/*
            The DERIVED status, never `car.availability` (CONTRACT.md §16.2). A
            car whose master switch is on but which is blocked today must read
            "Available from 08 Sep" here, not "Available".
          */}
          <span
            className={statusBadgeClass(status.kind === 'available')}
            style={{ fontSize: '0.75rem' }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex w-full flex-col p-4 md:w-3/5 md:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start md:mb-6">
          <div className="min-w-0">
            <h3 className="text-xl md:text-2xl font-extrabold tracking-tighter">{car.name}</h3>
            {/* No serial exists in the data model, so this slot shows the real slug. */}
            <p className="break-all text-xs font-medium text-slate-500">ID: {car.id}</p>
            {showBranch && (
              <p className="text-xs font-medium text-slate-500">
                {car.location ? (
                  officeLabel(car.location)
                ) : (
                  <span className="text-tertiary-container font-bold">No branch</span>
                )}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor={`daily-rate-${car.id}`}
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500"
            >
              Daily Rate
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base font-bold text-primary">₹</span>
              <input
                id={`daily-rate-${car.id}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                aria-label={`Daily rate for ${car.name}`}
                placeholder="Set price"
                value={priceValue}
                onChange={(e) => setPriceDraft(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-surface-container-low py-2 pl-8 pr-3 text-right text-lg font-black tracking-tighter text-primary placeholder:text-sm placeholder:font-bold placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:mb-6">
          {/* Availability — the MASTER switch (CONTRACT.md §16.2), not "out until Friday". */}
          <div
            className={`${PANEL} col-span-2 flex min-h-24 items-center justify-between gap-3`}
            title="Off = not rentable at all. For dated bookings use the availability calendar."
          >
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Availability</span>
              <p className="mt-1 text-xs font-bold text-slate-700">{statusLabel}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Turn off to make this car not rentable. Use the calendar for booked dates.
              </p>
            </div>
            <label className="relative inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center p-2">
              <input
                type="checkbox"
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`Master availability switch for ${car.name}`}
                checked={view.availability}
                onChange={(e) => void toggle('availability', e.target.checked)}
              />
              <div className={SWITCH_TRACK_EMERALD} />
            </label>
          </div>

          {/* Featured Toggle */}
          <div className={`${PANEL} flex min-h-20 items-center justify-between gap-2 p-3`}>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Featured</span>
            <label className="relative inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center p-2">
              <input
                type="checkbox"
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`Feature ${car.name} on the home page`}
                checked={view.isFeatured}
                onChange={(e) => void toggle('isFeatured', e.target.checked)}
              />
              <div className={SWITCH_TRACK_PRIMARY} />
            </label>
          </div>

          {/* Home Delivery Toggle */}
          <div className={`${PANEL} flex min-h-20 items-center justify-between gap-2 p-3`}>
            <div className="min-w-0">
              <Truck className="mb-1 size-5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold uppercase leading-4 tracking-widest text-slate-500">Home Delivery</span>
            </div>
            <label className="relative inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center p-2">
              <input
                type="checkbox"
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`Home delivery for ${car.name}`}
                checked={view.deliveryAvailable}
                onChange={(e) => void toggle('deliveryAvailable', e.target.checked)}
              />
              <div className={SWITCH_TRACK_EMERALD} />
            </label>
          </div>
        </div>

        {/*
          A switch that silently fails to save is the worst bug an admin panel
          can have, so both states are visible: saving, and what went wrong.
        */}
        <div className="min-h-[1.25rem] mb-2" aria-live="polite">
          {update.isPending && (
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {!update.isPending && saveError && (
            <span className="text-xs font-bold uppercase tracking-widest text-red-500">
              {saveError}
            </span>
          )}
        </div>

        <div className="mt-auto flex gap-3">
          <button
            type="button"
            onClick={() => onEditSpecs(car)}
            className="flex-1 bg-slate-900 text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors active:scale-95"
          >
            Edit Specs
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${car.name}`}
            className="p-4 bg-surface-container-low text-slate-500 rounded-2xl hover:text-red-500 transition-colors active:scale-95"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${car.name}?`}
        message={
          car.images.length > 0
            ? `This removes the car from the site and permanently destroys its ${car.images.length} photo${car.images.length === 1 ? '' : 's'} in Cloudinary.`
            : 'This removes the car from the site.'
        }
        confirmLabel="Delete car"
        isPending={remove.isPending}
        error={remove.error ? errorMessage(remove.error, 'Could not delete this car.') : null}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </motion.div>
  );
}
