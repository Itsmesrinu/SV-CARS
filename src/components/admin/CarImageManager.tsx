/**
 * Photo manager for one car (P04 Task 5) — the "adding new images" requirement
 * from the client brief.
 *
 * Upload is four steps per file: LQIP on a canvas, ask P01 for a signature,
 * PUSH the bytes straight to Cloudinary, then record the metadata through our
 * API. Files are processed one at a time and each keeps its own status, so a
 * single failure reports itself instead of taking the batch down with it.
 *
 * Reorder uses up/down buttons only — HTML5 drag events do not fire on touch
 * and the owner uses this on a phone. The file-upload zone retains its own
 * dragover/drop handler for desktop convenience.
 */

import { useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Star, Trash2, Upload } from 'lucide-react';
import { api } from '@/src/lib/api';
import { createLqip } from '@/src/lib/lqip';
import CarImage from '@/src/components/CarImage';
import type { CarDTO, CarImageDTO, ImageKind } from '@/src/types/api';
import type { UploadItem } from '@/src/types/admin';
import AdminDialog from './AdminDialog';
import ConfirmDialog from './ConfirmDialog';
import { errorMessage, useImageAdd, useImageDelete, useImageReorder, useImageUpdate } from './adminApi';
import { BTN_QUIET, FIELD, LABEL, statusBadgeClass } from './adminStyles';
import { rejectReason, uploadToCloudinary } from './cloudinaryUpload';

const IMAGE_KINDS: ImageKind[] = ['main', 'front', 'side', 'inside', 'back', 'other'];

interface CarImageManagerProps {
  open: boolean;
  car: CarDTO;
  onClose: () => void;
}

export default function CarImageManager({ open, car, onClose }: CarImageManagerProps) {
  const addImage = useImageAdd();
  const reorder = useImageReorder();
  const updateImage = useImageUpdate();
  const deleteImage = useImageDelete();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  /** Keeps the `File` behind each row alive so a failed one can be retried. */
  const filesById = useRef(new Map<string, File>());
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CarImageDTO | null>(null);

  const images = car.images;
  const isUploading = uploads.some((u) => u.stage !== 'done' && u.stage !== 'error');

  function patchUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  /** The four-step journey for one file. Never throws — it records the failure. */
  async function processFile(uploadId: string, file: File) {
    const reason = rejectReason(file);
    if (reason) {
      patchUpload(uploadId, { stage: 'error', error: reason });
      return;
    }

    try {
      patchUpload(uploadId, { stage: 'preparing', progress: 0, error: null });
      // Canvas-based, because `sharp` is Node-only and these bytes never reach
      // our server (CONTRACT.md §7).
      const lqip = await createLqip(file);

      const signature = await api.signUpload(car.id, file.name);

      patchUpload(uploadId, { stage: 'uploading', progress: 0 });
      const uploaded = await uploadToCloudinary(file, signature, (percent) =>
        patchUpload(uploadId, { progress: percent }),
      );

      patchUpload(uploadId, { stage: 'saving' });
      await addImage.run({
        carId: car.id,
        meta: {
          publicId: uploaded.publicId,
          // Cloudinary's dimensions win over the canvas's when both exist.
          width: uploaded.width || lqip.width,
          height: uploaded.height || lqip.height,
          blurDataUrl: lqip.blurDataUrl,
          kind: 'other',
          alt: car.name,
        },
      });

      patchUpload(uploadId, { stage: 'done', progress: 100 });
    } catch (err) {
      patchUpload(uploadId, { stage: 'error', error: errorMessage(err, 'Upload failed.') });
    }
  }

  /**
   * Sequential on purpose. Parallel uploads over a phone's connection make every
   * progress bar crawl at once, and Cloudinary signatures are per-file anyway.
   * One file failing must not abort the rest, which is why `processFile` swallows.
   */
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const queued: UploadItem[] = files.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      fileName: file.name,
      stage: 'queued',
      progress: 0,
      error: null,
      kind: 'other',
    }));
    queued.forEach((item, i) => filesById.current.set(item.id, files[i]));
    setUploads((prev) => [...prev, ...queued]);

    for (let i = 0; i < files.length; i += 1) {
      await processFile(queued[i].id, files[i]);
    }
  }

  async function retry(uploadId: string) {
    const file = filesById.current.get(uploadId);
    if (!file) return;
    await processFile(uploadId, file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDropTarget(false);
    void handleFiles(e.dataTransfer.files);
  }

  /** Moves the image at `from` to index `to` and persists the whole new order. */
  async function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const order = images.map((img) => img.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);

    setActionError(null);
    try {
      await reorder.run({ carId: car.id, order });
    } catch (err) {
      setActionError(errorMessage(err, 'Could not save the new order.'));
    }
  }

  async function setPrimary(image: CarImageDTO) {
    setActionError(null);
    try {
      await updateImage.run({ imageId: image.id, patch: { isPrimary: true } });
    } catch (err) {
      setActionError(errorMessage(err, 'Could not set the main photo.'));
    }
  }

  async function setKind(image: CarImageDTO, kind: ImageKind) {
    setActionError(null);
    try {
      await updateImage.run({ imageId: image.id, patch: { kind } });
    } catch (err) {
      setActionError(errorMessage(err, 'Could not change the photo type.'));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteImage.run(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // Left open; ConfirmDialog shows the reason.
    }
  }

  return (
    <AdminDialog
      open={open}
      title={`Photos — ${car.name}`}
      subtitle="The first photo is what customers see on the fleet card."
      onClose={onClose}
      widthClassName="max-w-3xl"
      initialFocusRef={chooseButtonRef}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {images.length} photo{images.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className={`${BTN_QUIET} min-h-11`}
          >
            Done
          </button>
        </div>
      }
    >
      {/* --- Upload zone --- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDropTarget(true);
        }}
        onDragLeave={() => setIsDropTarget(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-2 text-center transition-colors ${
          isDropTarget ? 'border-primary bg-primary/5' : 'border-slate-200 bg-surface-container-low'
        }`}
      >
        <button
          ref={chooseButtonRef}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full min-h-40 px-6 py-6 rounded-xl flex flex-col items-center justify-center text-slate-600 hover:bg-white/70 transition-colors active:scale-[0.99]"
        >
          <Upload aria-hidden="true" className="w-8 h-8 text-primary mb-3" />
          <span className="text-sm font-bold">Choose photos</span>
          <span className="text-xs text-slate-500 font-medium mt-1">
            Tap to browse, or drag JPG and PNG files here. Up to 10 MB each.
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            // Reset so re-picking the same file fires `change` again.
            e.target.value = '';
          }}
        />
      </div>

      {/* --- Per-file progress --- */}
      {uploads.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={LABEL}>Uploads</h3>
            {!isUploading && (
              <button
                type="button"
                onClick={() => {
                  setUploads([]);
                  filesById.current.clear();
                }}
                className="min-h-11 px-3 text-xs uppercase tracking-widest font-bold text-slate-500 hover:text-primary"
              >
                Clear
              </button>
            )}
          </div>
          {uploads.map((item) => (
            <div key={item.id} className="bg-surface-container-low p-3 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-600 truncate">{item.fileName}</span>
                <span
                  className={`text-xs uppercase tracking-widest font-bold shrink-0 ${
                    item.stage === 'error'
                      ? 'text-red-500'
                      : item.stage === 'done'
                        ? 'text-emerald-600'
                        : 'text-slate-500'
                  }`}
                >
                  {stageLabel(item)}
                </span>
              </div>
              {item.stage === 'uploading' && (
                <div
                  role="progressbar"
                  aria-label={`Uploading ${item.fileName}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                  className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden"
                >
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {item.error && (
                <div className="flex items-center justify-between gap-3 mt-1.5">
                  <p role="alert" className="text-xs text-red-500 font-bold">{item.error}</p>
                  {filesById.current.has(item.id) && !isUploading && (
                    <button
                      type="button"
                      onClick={() => void retry(item.id)}
                      className="min-h-11 px-3 text-xs uppercase tracking-widest font-bold text-primary hover:underline shrink-0"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-6 text-xs text-red-500 font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {actionError}
        </p>
      )}

      {/* --- Existing photos --- */}
      <div className="mt-8">
        <h3 className={`${LABEL} mb-4`}>Current Photos</h3>

        {images.length === 0 ? (
          <p className="text-sm text-slate-500 font-medium">
            No photos yet. Cars without a photo show a neutral placeholder to customers.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
              >
                <div className="relative">
                  <CarImage
                    image={image}
                    alt={image.alt ?? `${car.name} — ${image.kind}`}
                    sizes="(max-width: 640px) 100vw, 320px"
                  />
                  {image.isPrimary && (
                    <span className={`${statusBadgeClass(true)} absolute top-3 left-3`}>Main</span>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void move(index, index - 1)}
                      disabled={index === 0 || reorder.isPending}
                      aria-label={`Move ${image.alt ?? image.kind} earlier`}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-surface-container-low text-slate-500 hover:text-primary transition-colors active:scale-95 disabled:opacity-40"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void move(index, index + 1)}
                      disabled={index === images.length - 1 || reorder.isPending}
                      aria-label={`Move ${image.alt ?? image.kind} later`}
                      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-surface-container-low text-slate-500 hover:text-primary transition-colors active:scale-95 disabled:opacity-40"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    <select
                      aria-label="Photo type"
                      value={image.kind}
                      onChange={(e) => void setKind(image, e.target.value as ImageKind)}
                      className={`${FIELD} min-h-11 text-xs flex-1`}
                    >
                      {IMAGE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void setPrimary(image)}
                      disabled={image.isPrimary || updateImage.isPending}
                      className="min-h-11 flex-1 flex items-center justify-center gap-2 bg-surface-container-low text-slate-600 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-primary transition-colors active:scale-95 disabled:opacity-40"
                    >
                      <Star className="w-4 h-4" />
                      {image.isPrimary ? 'Primary photo' : 'Set as primary'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(image)}
                      className="min-h-11 px-3 inline-flex items-center justify-center gap-2 bg-surface-container-low text-slate-500 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-red-500 transition-colors active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {reorder.isPending && (
          <p className="mt-4 text-xs uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving order…
          </p>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this photo?"
        message="The file is permanently destroyed in Cloudinary, not just removed from the site."
        confirmLabel="Delete photo"
        isPending={deleteImage.isPending}
        error={deleteImage.error ? errorMessage(deleteImage.error, 'Could not delete.') : null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </AdminDialog>
  );
}

function stageLabel(item: UploadItem): string {
  switch (item.stage) {
    case 'queued':
      return 'Waiting';
    case 'preparing':
      return 'Preparing';
    case 'uploading':
      return `${item.progress}%`;
    case 'saving':
      return 'Saving';
    case 'done':
      return 'Done';
    case 'error':
      return 'Failed';
  }
}
