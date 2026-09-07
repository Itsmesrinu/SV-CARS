/**
 * Browser-side LQIP generator — CONTRACT.md §7.
 *
 * Owned by P03, consumed by P04's admin uploader. It exists because `sharp` (the
 * server/migration path, P02) is Node-only: the admin uploads straight from the
 * browser to Cloudinary, so the blur placeholder has to be produced on a canvas
 * before the file ever leaves the page.
 *
 * The output is stored as `CarImageDTO.blurDataUrl` and rendered by `CarImage`
 * as the blurred backdrop behind every photo. It must stay tiny — it travels
 * inside `/api/cars` for every image of every car — hence 16px wide.
 */

export interface LqipResult {
  blurDataUrl: string;
  width: number;
  height: number;
}

/** Downscale target. 16px wide is ~0.5 KB as WebP and is indistinguishable once blurred. */
const LQIP_WIDTH = 16;

/** Low enough to stay under ~1 KB; the result is blurred to nothing anyway. */
const LQIP_QUALITY = 0.6;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * `createImageBitmap` is the fast path (off the main thread, no DOM node). Safari
 * only grew full `Blob` support for it recently, so the `<img>` + object URL path
 * stays as a fallback rather than an assumption.
 */
async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // fall through to the <img> path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error(`Could not read "${file.name}" as an image — is it a supported format?`));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Downscales `file` to 16px wide on a canvas and returns a base64 data URL plus
 * the image's **natural** size — the two numbers that go straight into
 * `POST /api/admin/cars/:id/images` as `width`/`height`, and from there into the
 * aspect box `CarImage` reserves.
 *
 * Prefers WebP and falls back to JPEG where `toDataURL('image/webp')` is not
 * supported (older Safari silently returns a PNG, which is several times larger).
 */
export async function createLqip(file: File): Promise<LqipResult> {
  const decoded = await decode(file);

  try {
    const { width, height } = decoded;
    if (width === 0 || height === 0) {
      throw new Error(`"${file.name}" decoded to a zero-sized image.`);
    }

    const targetWidth = Math.min(LQIP_WIDTH, width);
    const targetHeight = Math.max(1, Math.round((height / width) * targetWidth));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D canvas context to build the blur placeholder.');

    ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

    let blurDataUrl = canvas.toDataURL('image/webp', LQIP_QUALITY);
    if (!blurDataUrl.startsWith('data:image/webp')) {
      blurDataUrl = canvas.toDataURL('image/jpeg', LQIP_QUALITY);
    }

    return { blurDataUrl, width, height };
  } finally {
    decoded.release();
  }
}