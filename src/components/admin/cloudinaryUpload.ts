/**
 * Browser → Cloudinary direct upload.
 *
 * The file never passes through our API: P01 signs the parameters, the browser
 * POSTs the bytes straight to Cloudinary, and only the resulting metadata comes
 * back to us (CONTRACT.md §8, P04 Task 5).
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: `fetch` has no upload
 * progress event. A phone photo over mobile data takes real seconds, and a
 * dialog with no progress bar looks frozen.
 */

import type { UploadSignature } from '@/src/types/api';

/** ~10 MB. Phone photos land well under this; a raw DSLR file does not. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface CloudinaryUploadResult {
  publicId: string;
  width: number;
  height: number;
}

/** Returns a human message when the file must not be uploaded, else null. */
export function rejectReason(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `${file.name} is not an image.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name} is ${mb} MB — the limit is 10 MB.`;
  }
  return null;
}

export function uploadToCloudinary(
  file: File,
  signature: UploadSignature,
  onProgress: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // EXACTLY the fields P01 signed, no more and no fewer. Cloudinary rebuilds
    // the signature from the parameters it receives, so one extra field — or one
    // missing — fails with an opaque "Invalid Signature".
    form.append('file', file);
    form.append('api_key', signature.apiKey);
    form.append('timestamp', String(signature.timestamp));
    form.append('signature', signature.signature);
    form.append('folder', signature.folder);
    form.append('public_id', signature.publicId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: {
        public_id?: string;
        width?: number;
        height?: number;
        error?: { message?: string };
      };
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error(`Cloudinary returned an unreadable response (${xhr.status}).`));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300 || !body.public_id) {
        reject(new Error(body.error?.message || `Cloudinary rejected the upload (${xhr.status}).`));
        return;
      }

      resolve({
        // Cloudinary's RETURNED public_id, not the one we asked for: it
        // deduplicates and may hand back a different id than we requested, and
        // storing our guess would point the site at an asset that isn't there.
        publicId: body.public_id,
        width: body.width ?? 0,
        height: body.height ?? 0,
      });
    };

    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    xhr.send(form);
  });
}