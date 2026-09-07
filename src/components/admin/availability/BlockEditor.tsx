/**
 * Create / edit / delete one availability block (CONTRACT.md §16.7, Task 3).
 *
 * The field labels are the whole trick: **"Out from" and "Back on" ARE the
 * inclusive/exclusive rule**, expressed in the owner's language, so he never has
 * to meet the concept. Do not rename them to Start and End (§16.1 r2).
 *
 * The shell is P04's `AdminDialog` — the same modal `CarFormDialog` uses — and
 * every class string comes from `adminStyles.ts`. Both are read-only here.
 *
 * Owned by P09.
 */

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { addDays, isValidDate, rentalDays } from '@/src/lib/availability';
import type { AvailabilityBlockDTO, BlockInput, CarDTO } from '@/src/types/api';
import AdminDialog from '../AdminDialog';
import {
  BTN_DANGER,
  BTN_DARK,
  ERROR_TEXT,
  FIELD,
  FIELD_ERROR,
  HELP,
  LABEL,
  PANEL,
} from '../adminStyles';
import { dayMonth, weekdayShort } from './monthGrid';

interface BlockEditorProps {
  car: CarDTO;
  /** null = creating a new block. */
  block: AvailabilityBlockDTO | null;
  initialStart: string;
  initialEnd: string;
  initialNote: string;
  today: string;
  /** A failed write, already turned into the owner's words by the page. */
  errorMessage: string | null;
  isSaving: boolean;
  onSubmit: (values: BlockInput) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function BlockEditor({
  car,
  block,
  initialStart,
  initialEnd,
  initialNote,
  today,
  errorMessage,
  isSaving,
  onSubmit,
  onDelete,
  onClose,
}: BlockEditorProps) {
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [note, setNote] = useState(initialNote);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const startRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  // An existing block may legitimately have started before today — the car is
  // still out. Only a NEW block is pinned to today: the past expires on its own
  // and is never rewritten (§16.1 r5).
  const minStart = block ? undefined : today;

  const bothDatesGiven = isValidDate(startDate) && isValidDate(endDate);
  const datesValid = bothDatesGiven && endDate > startDate;
  const localError = datesValid
    ? null
    : bothDatesGiven
      ? 'It has to come back after it goes out — pick a later "Back on" date.'
      : 'Pick both dates.';

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!datesValid || isSaving) return;
    onSubmit({ startDate, endDate, note: note.trim() ? note.trim() : null });
  }

  function handleStartChange(value: string) {
    setStartDate(value);
    // Keep the range coherent while he types instead of rejecting it after.
    if (isValidDate(value) && endDate <= value) setEndDate(addDays(value, 1));
  }

  const message = errorMessage ?? localError;

  return (
    <AdminDialog
      open
      title={block ? 'Edit dates out' : 'Block dates'}
      subtitle={car.name}
      onClose={onClose}
      widthClassName="max-w-md"
      footer={
        <button
          type="submit"
          form="block-editor-form"
          disabled={!datesValid || isSaving}
          className={`${BTN_DARK} min-h-11 w-full`}
        >
          {isSaving ? 'Saving…' : block ? 'Save changes' : 'Block these dates'}
        </button>
      }
    >
      <form id="block-editor-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <div>
            <label className={LABEL} htmlFor="block-start">Out from</label>
            <input
              id="block-start"
              ref={startRef}
              type="date"
              value={startDate}
              min={minStart}
              onChange={(event) => handleStartChange(event.target.value)}
              className={`${datesValid ? FIELD : FIELD_ERROR} mt-1.5 min-h-11`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="block-end">Back on</label>
            <input
              id="block-end"
              type="date"
              value={endDate}
              min={isValidDate(startDate) ? addDays(startDate, 1) : minStart}
              onChange={(event) => setEndDate(event.target.value)}
              className={`${datesValid ? FIELD : FIELD_ERROR} mt-1.5 min-h-11`}
            />
          </div>
        </div>

        {/* The exclusive end, spelled out, every time he touches a date. */}
        <p className={`${PANEL} mt-3 text-xs font-semibold text-slate-600`}>
          {datesValid ? (
            <>
              {rentalDays(startDate, endDate)} days out, back on{' '}
              <span className="text-slate-900">
                {weekdayShort(endDate)} {dayMonth(endDate)}
              </span>
            </>
          ) : (
            'Pick the day it goes out and the day it comes back.'
          )}
        </p>

        <div className="mt-4">
          <label className={LABEL} htmlFor="block-note">Note (optional)</label>
          <input
            id="block-note"
            type="text"
            value={note}
            maxLength={200}
            placeholder="Service or trip details"
            onChange={(event) => setNote(event.target.value)}
            className={`${FIELD} mt-1.5 min-h-11`}
          />
          <p className={HELP}>Private — only you see this. It never reaches the website.</p>
        </div>

        {message && <p className={ERROR_TEXT}>{message}</p>}

        {block && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            {confirmingDelete && (
              <p className={`${HELP} mb-3 mt-0`}>
                Deleting frees {car.name} for these dates. The car goes straight back into the fleet.
              </p>
            )}
            <button
              type="button"
              onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
              disabled={isSaving}
              className={`${BTN_DANGER} flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto`}
            >
              <Trash2 className="h-5 w-5" />
              {confirmingDelete ? 'Confirm delete' : 'Delete block'}
            </button>
          </div>
        )}
      </form>
    </AdminDialog>
  );
}
