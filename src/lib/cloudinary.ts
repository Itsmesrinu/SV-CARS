/**
 * Cloudinary delivery-URL builder — client safe.
 *
 * Owned by P00, read-only for every other session (CONTRACT.md §5).
 *
 * This is deliberately hand-built string concatenation and NOT the `cloudinary`
 * npm package. That package is a server-side SDK that is configured with the API
 * secret; importing it anywhere under `src/` would pull the secret into the Vite
 * module graph and ship it in the browser bundle. It stays server-only (P01's
 * upload signing, P02's migration script) — see CONTRACT.md §5.2.
 *
 * The only Cloudinary value that may appear here is the cloud name, which is
 * public by design: it is visible in every image URL on the deployed site.
 */

export type CldFit = 'limit' | 'fill' | 'auto';

export interface CldOptions {
  width: number;
  height?: number;
  fit?: CldFit;      // default 'limit'
  quality?: string;  // default 'auto'
}

/** The standard responsive widths used across the app. */
export const CLD_WIDTHS: readonly number[] = [400, 640, 800, 1200, 1600];

const CLOUD_NAME = (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '').trim();

let warned = false;
function cloudName(): string {
  if (!CLOUD_NAME && !warned) {
    warned = true;
    // Loud but non-fatal: a missing cloud name must not take the site down, and
    // "every image is missing" plus this line is a much faster diagnosis than a
    // wall of 404s from res.cloudinary.com.
    console.error(
      '[cloudinary] VITE_CLOUDINARY_CLOUD_NAME is not set — image URLs cannot be built. ' +
        'Add it to .env.local (or .env) and restart Vite; on Vercel add it to the project env.',
    );
  }
  return CLOUD_NAME;
}

/**
 * `fit` → the crop segment of the transformation (CONTRACT.md §5.1).
 *
 * - `limit` → `c_limit`  never upscales, preserves aspect. The default.
 * - `fill`  → `c_fill`   fills the box, may crop edges.
 * - `auto`  → `c_auto,g_auto`  content-aware crop; Cloudinary picks the subject.
 */
function cropSegment(fit: CldFit): string {
  switch (fit) {
    case 'fill':
      return 'c_fill';
    case 'auto':
      return 'c_auto,g_auto';
    case 'limit':
    default:
      return 'c_limit';
  }
}

function transformation(opts: CldOptions): string {
  const { width, height, fit = 'limit', quality = 'auto' } = opts;

  // f_auto and q_auto are always present: they are what make Cloudinary negotiate
  // AVIF/WebP per browser and pick a per-image quality. Biggest single win here.
  const parts = ['f_auto', `q_${quality}`, `w_${Math.max(1, Math.round(width))}`];
  if (height !== undefined) parts.push(`h_${Math.max(1, Math.round(height))}`);
  parts.push(cropSegment(fit));

  return parts.join(',');
}

/**
 * Single transformed delivery URL.
 *
 * `https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,w_800,c_limit/<publicId>`
 *
 * Returns `''` when the cloud name is unset, so an `<img>` simply fetches nothing
 * instead of the whole page throwing.
 */
export function cldUrl(publicId: string, opts: CldOptions): string {
  const cloud = cloudName();
  if (!cloud) return '';
  return `https://res.cloudinary.com/${cloud}/image/upload/${transformation(opts)}/${publicId}`;
}

/**
 * `srcSet` string across `CLD_WIDTHS`, filtered to `<= naturalWidth` so a candidate
 * never asks Cloudinary to upscale. When the image is narrower than every standard
 * width, the natural width is used as the single candidate.
 *
 * `height` is interpreted as **the height at `naturalWidth`** and is scaled in
 * proportion for every candidate, so all candidates share one aspect ratio. To pin
 * a fixed ratio (the fleet cards' `16/9` boxes), pass the height that ratio implies
 * at the natural width:
 *
 * ```ts
 * cldSrcSet(img.publicId, img.width, { fit: 'auto', height: Math.round(img.width / (16 / 9)) })
 * ```
 */
export function cldSrcSet(
  publicId: string,
  naturalWidth: number,
  opts?: Omit<CldOptions, 'width'>,
): string {
  const usable = CLD_WIDTHS.filter((w) => w <= naturalWidth);
  const widths = usable.length > 0 ? usable : [Math.max(1, Math.round(naturalWidth))];

  return widths
    .map((w) => {
      const height =
        opts?.height !== undefined && naturalWidth > 0
          ? Math.max(1, Math.round((opts.height * w) / naturalWidth))
          : undefined;
      return `${cldUrl(publicId, { ...opts, width: w, height })} ${w}w`;
    })
    .join(', ');
}
