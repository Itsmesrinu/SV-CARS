/**
 * Class strings lifted verbatim from existing components, so the new admin UI
 * composes from the design system instead of inventing one.
 *
 * `docs/design-system.md` forbids new colours, radii, shadows and button shapes.
 * Every constant below names where it came from. **If you need a style that is
 * not here, go copy one from an existing file rather than writing a new one.**
 */

/** The card surface used by AdminVehicleCard and AdminStatCard. */
export const CARD = 'bg-white rounded-2xl shadow-card';

/** Focus ring, for anywhere the base layer's :focus-visible is not enough. */
export const FOCUS =
  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

/** Explains a control that exists but is not built yet. Replaces title= tooltips. */
export const BADGE_SOON =
  'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-800 text-slate-400';

/** The panel tint inside a card — AdminVehicleCard's toggle rows. */
export const PANEL = 'bg-surface-container-low p-4 rounded-xl';

/** Small uppercase label — AdminVehicleCard's "Availability"/"Featured" captions. */
export const LABEL =
  'text-[10px] uppercase tracking-widest font-bold text-slate-500';

/** Text/number/date input and select — from AllCarsPage.tsx:163's sort select. */
export const FIELD =
  'w-full bg-white border border-slate-200 rounded-xl text-sm font-semibold px-4 py-2.5 focus:ring-2 focus:ring-primary outline-none';

/** A field carrying a validation error. Red is already in use for destructive actions. */
export const FIELD_ERROR = `${FIELD} border-red-400 focus:ring-red-400`;

/** Helper/explanatory copy under a field — the slate-500 body text used throughout. */
export const HELP = 'text-xs text-slate-500 font-medium mt-1.5';

/** Inline validation message. */
export const ERROR_TEXT = 'text-xs text-red-500 font-bold mt-1.5';

/** Primary action — AdminVehicleCard's "Edit Specs" shape with the brand blue. */
export const BTN_PRIMARY =
  'bg-primary text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors active:scale-95 disabled:opacity-50 disabled:active:scale-100';

/** Secondary/outline action — OfficeLocation.tsx:38's "Get Directions" button. */
export const BTN_SECONDARY =
  'border-2 border-primary text-primary font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all active:scale-[0.98] disabled:opacity-50';

/** Dark action — AdminVehicleCard's "Edit Specs" button. */
export const BTN_DARK =
  'bg-slate-900 text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors active:scale-95 disabled:opacity-50 disabled:active:scale-100';

/** Quiet action — AdminVehicleCard's delete button surface. */
export const BTN_QUIET =
  'bg-surface-container-low text-slate-500 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors active:scale-95 disabled:opacity-50';

/** Destructive action. Red is the existing hover colour on AdminVehicleCard's trash button. */
export const BTN_DANGER =
  'bg-red-500 text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-600 transition-colors active:scale-95 disabled:opacity-50';

/** Filter pill — AdminPage's category row. `active` picks the selected variant. */
export function pillClass(active: boolean): string {
  return [
    'px-4 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest rounded-lg whitespace-nowrap transition-all',
    active ? 'text-primary bg-primary/10' : 'text-slate-500 hover:text-primary hover:bg-slate-100',
  ].join(' ');
}

/** Status badge — AdminVehicleCard's top-left pill. Emerald available, tertiary otherwise (§16.3). */
export function statusBadgeClass(available: boolean): string {
  return [
    'text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-lg',
    available ? 'bg-emerald-500 text-slate-950' : 'bg-tertiary-container text-white',
  ].join(' ');
}

/** The emerald peer-checked switch from AdminVehicleCard, unchanged. */
export const SWITCH_TRACK_EMERALD =
  "w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500";

/** The same switch in the brand blue — AdminVehicleCard's "Featured" toggle. */
export const SWITCH_TRACK_PRIMARY =
  "w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary";
