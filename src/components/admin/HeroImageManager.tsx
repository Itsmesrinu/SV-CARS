/**
 * The homepage hero image — a single admin-managed photo.
 *
 * There is exactly ONE. To change it the owner deletes the current image and
 * uploads a new one; there is no "add second". Same four-step upload journey as
 * the car photo manager (LQIP → sign → push to Cloudinary → save), but the save
 * target is the settings row's hero columns via `PUT /api/admin/settings/hero`,
 * and the sign call passes no carId so the asset lands in 'sv-cars/site'.
 *
 * When no image is set the home page auto-picks a fleet photo, so an empty hero
 * here is a valid, non-broken state — not an error.
 */

import { useRef, useState } from 'react';
import { AlertTriangle, ImageUp, Loader2, Trash2 } from 'lucide-react';

import CarImage from '@/src/components/CarImage';
import { useSettings } from '@/src/hooks';
import { api } from '@/src/lib/api';
import { createLqip } from '@/src/lib/lqip';
import type { CarImageDTO } from '@/src/types/api';
import AdminDialog from './AdminDialog';
import ConfirmDialog from './ConfirmDialog';
import { errorMessage, useHeroImageDelete, useHeroImageSet } from './adminApi';
import { BTN_QUIET } from './adminStyles';
import { rejectReason, uploadToCloudinary } from './cloudinaryUpload';

type Stage = 'idle' | 'preparing' | 'uploading' | 'saving' | 'error';

interface HeroImageManagerProps {
  open: boolean;
  onClose: () => void;
}

const STAGE_LABEL: Record<Exclude<Stage, 'idle' | 'error'>, string> = {
  preparing: 'Preparing…',
  uploading: 'Uploading',
  saving: 'Saving…',
};

export default function HeroImageManager({ open, onClose }: HeroImageManagerProps) {
  const { data: settings } = useSettings();
  const setHero = useHeroImageSet();
  const deleteHero = useHeroImageDelete();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hero = settings?.heroImage ?? null;
  const isBusy = stage === 'preparing' || stage === 'uploading' || stage === 'saving';

  // CarImage speaks CarImageDTO; the hero stores only the four fields it reads,
  // so synthesise the car-image-only columns for the preview.
  const previewImage: CarImageDTO | null = hero
    ? {
        id: 'hero',
        publicId: hero.publicId,
        width: hero.width,
        height: hero.height,
        blurDataUrl: hero.blurDataUrl,
        kind: 'main',
        sortOrder: 0,
        isPrimary: true,
        alt: null,
      }
    : null;

  /** The four-step upload, for the single chosen file. Never throws. */
  async function upload(file: File) {
    const reason = rejectReason(file);
    if (reason) {
      setStage('error');
      setError(reason);
      return;
    }
    setError(null);
    try {
      setStage('preparing');
      setProgress(0);
      const lqip = await createLqip(file);

      // No carId → the signature folders this under 'sv-cars/site'.
      const signature = await api.signUpload(null, file.name);

      setStage('uploading');
      const uploaded = await uploadToCloudinary(file, signature, setProgress);

      setStage('saving');
      await setHero.run({
        publicId: uploaded.publicId,
        // Cloudinary's dimensions win over the canvas's when both exist.
        width: uploaded.width || lqip.width,
        height: uploaded.height || lqip.height,
        blurDataUrl: lqip.blurDataUrl,
      });

      // The settings refetch now carries the new hero; drop back to idle.
      setStage('idle');
      setProgress(0);
    } catch (err) {
      setStage('error');
      setError(errorMessage(err, 'Upload failed.'));
    }
  }

  function onChoose(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  async function doDelete() {
    try {
      await deleteHero.run();
      setConfirmDelete(false);
    } catch {
      // Left open; ConfirmDialog surfaces the reason.
    }
  }

  return (
    <AdminDialog
      open={open}
      title="Homepage hero image"
      subtitle="The large photo at the top of the home page. Just one — delete it to upload another."
      onClose={onClose}
      widthClassName="max-w-xl"
      initialFocusRef={chooseButtonRef}
      footer={
        <div className="flex items-center justify-end">
          <button type="button" onClick={onClose} disabled={isBusy} className={`${BTN_QUIET} min-h-11`}>
            Done
          </button>
        </div>
      }
    >
      {hero ? (
        /* --- Current image + delete-to-replace --- */
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <CarImage
              image={previewImage}
              alt="Homepage hero image"
              sizes="(max-width: 640px) 100vw, 480px"
              aspect={16 / 9}
              cldFit="auto"
            />
          </div>
          <p className="text-xs font-medium text-slate-500">
            To change the hero, delete this image first, then upload a new one.
          </p>
          <button
            ref={chooseButtonRef}
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface-container-low px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 transition-colors hover:text-red-500 active:scale-95"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete image
          </button>
        </div>
      ) : (
        /* --- Upload zone (no image yet) --- */
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-surface-container-low p-2 text-center">
            <button
              ref={chooseButtonRef}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="flex min-h-40 w-full flex-col items-center justify-center rounded-xl px-6 py-6 text-slate-600 transition-colors hover:bg-white/70 active:scale-[0.99] disabled:opacity-60"
            >
              {isBusy ? (
                <Loader2 className="mb-3 size-8 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <ImageUp className="mb-3 size-8 text-primary" aria-hidden="true" />
              )}
              <span className="text-sm font-bold">
                {isBusy ? STAGE_LABEL[stage as Exclude<Stage, 'idle' | 'error'>] : 'Choose hero image'}
              </span>
              <span className="mt-1 text-xs font-medium text-slate-500">
                One JPG or PNG, up to 10 MB. A wide (landscape) photo fits best.
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onChoose(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {stage === 'uploading' && (
            <div
              role="progressbar"
              aria-label="Uploading hero image"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-2 overflow-hidden rounded-full bg-slate-200"
            >
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <p className="text-xs font-medium text-slate-500">
            No hero image set. The home page currently shows an automatically chosen fleet photo.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 text-xs font-bold text-red-500">
          <AlertTriangle className="size-4" aria-hidden="true" /> {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete the hero image?"
        message="The file is permanently destroyed in Cloudinary. The home page will go back to an automatically chosen fleet photo until you upload a new one."
        confirmLabel="Delete image"
        isPending={deleteHero.isPending}
        error={deleteHero.error ? errorMessage(deleteHero.error, 'Could not delete.') : null}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
      />
    </AdminDialog>
  );
}
