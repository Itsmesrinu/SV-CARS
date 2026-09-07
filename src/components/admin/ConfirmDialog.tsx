/**
 * Confirmation for the two irreversible actions in the panel: deleting a car
 * (which also destroys its Cloudinary assets server-side) and deleting an image.
 *
 * Built on `AdminDialog` rather than `window.confirm` so the warning can say
 * *what* is about to be destroyed — "this also permanently deletes 4 photos" is
 * the sentence that stops the mistake.
 */

import { AlertTriangle, Loader2 } from 'lucide-react';
import AdminDialog from './AdminDialog';
import { BTN_DANGER, BTN_QUIET } from './adminStyles';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** One or more lines of consequence. Be specific and count things. */
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string | null;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  isPending = false,
  error = null,
}: ConfirmDialogProps) {
  return (
    <AdminDialog
      open={open}
      title={title}
      onClose={isPending ? () => {} : onCancel}
      widthClassName="max-w-md"
      footer={
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className={`${BTN_QUIET} min-h-11 w-full sm:w-auto`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`${BTN_DANGER} min-h-11 w-full sm:w-auto flex items-center justify-center gap-2`}
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="bg-red-500/10 p-3 rounded-xl h-fit shrink-0">
          <AlertTriangle aria-hidden="true" className="text-red-500 w-6 h-6" />
        </div>
        <div>
          <p className="text-slate-600 font-medium text-sm whitespace-pre-line">{message}</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-3">
            This cannot be undone
          </p>
          {error && (
            <p role="alert" className="text-xs text-red-500 font-bold mt-3">
              {error}
            </p>
          )}
        </div>
      </div>
    </AdminDialog>
  );
}
