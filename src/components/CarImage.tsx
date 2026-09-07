/**
 * `CarImage` — every photo on the site goes through here. CONTRACT.md §6.
 *
 * Owned by P03, consumed by P04 (admin grid) and P05 (fleet cards, carousel,
 * detail gallery). It is the component that delivers the "fast, no loading jank"
 * requirement, and it does it with four mechanisms:
 *
 * 1. **The box is reserved before any bytes arrive.** The wrapper carries an
 *    explicit `aspect-ratio` and the `<img>` carries intrinsic `width`/`height`
 *    attributes, both derived from the DB's stored dimensions. Zero layout shift,
 *    which is the thing today's gallery (`CarDetailsPage.tsx:136`, a motion.img
 *    fading in over an empty div) gets wrong.
 * 2. **LQIP.** The ~0.5 KB `blurDataUrl` renders as a blurred backdrop
 *    immediately, and the real photo fades in over it on load. No white flash.
 * 3. **Responsive delivery.** `srcSet` across the standard Cloudinary widths,
 *    filtered to the image's natural width, so a 400px card never downloads a
 *    1600px file.
 * 4. **It never breaks.** `image === null` and a failed load both render the
 *    neutral placeholder, never the browser's broken-image glyph. A car whose
 *    photos aren't uploaded yet still lays out correctly.
 *
 * No new colours: the placeholder is the existing `bg-surface-container-low`
 * token (docs/design-system.md).
 */

import { useState, type JSX } from 'react';

import { cldSrcSet, cldUrl, CLD_WIDTHS, type CldFit } from '@/src/lib/cloudinary';
import { cn } from '@/src/lib/utils';
import type { CarImageDTO } from '@/src/types/api';

export interface CarImageProps {
  image: CarImageDTO | null;
  /** Required. Callers pass e.g. `${car.name} — front`. */
  alt: string;
  /** Required. e.g. '(max-width: 768px) 50vw, 400px'. */
  sizes: string;
  /** Applied to the `<img>`. */
  className?: string;
  /** Hero / first gallery frame: `loading="eager"` + `fetchpriority="high"`. Default false. */
  priority?: boolean;
  /** CSS `object-fit` on the `<img>`. Default 'cover'. */
  fit?: 'cover' | 'contain';
  /** Cloudinary crop mode baked into the URL. Default 'limit'. See CONTRACT.md §6.1. */
  cldFit?: CldFit;
  /** Override the wrapper ratio (w/h), e.g. 16/9. Default: the image's own. */
  aspect?: number;
  /** Applied to the aspect-ratio wrapper. */
  containerClassName?: string;
}

/** Used for the wrapper box when there is no image to take a ratio from. */
const FALLBACK_ASPECT = 16 / 9;

/**
 * The `src` fallback for browsers that ignore `srcSet`, and the width
 * `prefetchCarImage` warms.
 *
 * Snapped to a real `CLD_WIDTHS` candidate — a prefetch or fallback at a width
 * that isn't in the `srcSet` is a second Cloudinary derivation and a second
 * download, i.e. the opposite of the intent.
 */
function pickWidth(naturalWidth: number, desired: number): number {
  const usable = CLD_WIDTHS.filter((w) => w <= naturalWidth);
  if (usable.length === 0) return Math.max(1, Math.round(naturalWidth));
  return usable.find((w) => w >= desired) ?? usable[usable.length - 1];
}

/** Mid-range default: big enough for a full-width mobile hero, small enough for a card. */
const DEFAULT_SRC_WIDTH = 800;

/**
 * A height is only meaningful to the URL builder for the crop modes that
 * actually produce the box.
 *
 * `c_auto`/`c_fill` crop to `w × h`, so passing the ratio's height is exactly how
 * you get Cloudinary to pick a subject-preserving crop instead of letting
 * `object-fit` slice the front off a car. `c_limit` *fits inside* `w × h`
 * without cropping, so adding a height there would silently deliver a narrower
 * file than its `w` descriptor claims and make the browser choose wrongly.
 */
function cropHeight(cldFit: CldFit, naturalWidth: number, aspect: number | undefined): number | undefined {
  if (aspect === undefined || !Number.isFinite(aspect) || aspect <= 0) return undefined;
  if (cldFit !== 'auto' && cldFit !== 'fill') return undefined;
  return Math.max(1, Math.round(naturalWidth / aspect));
}

export default function CarImage({
  image,
  alt,
  sizes,
  className,
  priority = false,
  fit = 'cover',
  cldFit = 'limit',
  aspect,
  containerClassName,
}: CarImageProps): JSX.Element {
  /**
   * Keyed by `src` rather than a plain boolean, so navigating the gallery resets
   * the fade without an effect — and without a frame where the previous photo is
   * shown as "loaded" under the new one's URL.
   */
  const [status, setStatus] = useState<{ src: string; state: 'loaded' | 'error' } | null>(null);

  const naturalWidth = image && image.width > 0 ? image.width : 0;
  const naturalHeight = image && image.height > 0 ? image.height : 0;

  const ratio =
    aspect !== undefined && Number.isFinite(aspect) && aspect > 0
      ? aspect
      : naturalWidth > 0 && naturalHeight > 0
        ? naturalWidth / naturalHeight
        : FALLBACK_ASPECT;

  // Intrinsic attributes. When `aspect` is supplied the height is derived from it,
  // so a fixed-ratio card reserves the correct box even though the photo behind
  // it is a different shape.
  const intrinsicWidth = naturalWidth > 0 ? naturalWidth : undefined;
  const intrinsicHeight =
    intrinsicWidth !== undefined ? Math.max(1, Math.round(intrinsicWidth / ratio)) : undefined;

  const height = image ? cropHeight(cldFit, image.width, aspect) : undefined;

  const src = image
    ? cldUrl(image.publicId, {
        width: pickWidth(image.width, DEFAULT_SRC_WIDTH),
        height:
          height !== undefined
            ? Math.max(
                1,
                Math.round((height * pickWidth(image.width, DEFAULT_SRC_WIDTH)) / image.width),
              )
            : undefined,
        fit: cldFit,
      })
    : '';

  const srcSet = image ? cldSrcSet(image.publicId, image.width, { fit: cldFit, height }) : '';

  const isLoaded = status?.src === src && status.state === 'loaded';
  const hasFailed = status?.src === src && status.state === 'error';

  return (
    <div
      className={cn('relative overflow-hidden bg-surface-container-low', containerClassName)}
      // Inline because the ratio is data. An explicit height from
      // `containerClassName` (the fleet card's `h-28 md:h-64`) still wins — CSS
      // only applies `aspect-ratio` when a dimension is auto.
      style={{ aspectRatio: String(ratio) }}
    >
      {/*
        LQIP backdrop. Scaled slightly past the edges because a 16px source blurred
        by 16px otherwise shows translucent borders. Stays visible under a failed
        load, which is what replaces the broken-image icon.
      */}
      {image?.blurDataUrl ? (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${image.blurDataUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(16px)',
            transform: 'scale(1.1)',
          }}
        />
      ) : null}

      {image && src ? (
        // The fade lives on this wrapper, not on the <img>, so a caller's own
        // transition classes (the fleet card's `group-hover:scale-105
        // transition-transform`) are never clobbered by ours.
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{ opacity: isLoaded && !hasFailed ? 1 : 0 }}
        >
          <img
            src={src}
            srcSet={srcSet || undefined}
            sizes={sizes}
            alt={alt}
            width={intrinsicWidth}
            height={intrinsicHeight}
            decoding="async"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            onLoad={() => setStatus({ src, state: 'loaded' })}
            onError={() => setStatus({ src, state: 'error' })}
            // A cached image can finish decoding before React attaches onLoad;
            // without this the photo would sit at opacity 0 forever.
            ref={(node) => {
              if (node?.complete && node.naturalWidth > 0) {
                setStatus((prev) =>
                  prev?.src === src ? prev : { src, state: 'loaded' },
                );
              }
            }}
            className={cn(
              'w-full h-full',
              fit === 'contain' ? 'object-contain' : 'object-cover',
              className,
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Warms the browser cache for the next gallery frame. No-op when `image` is null.
 *
 * `width` is snapped to the same `CLD_WIDTHS` candidate `CarImage` would request,
 * so the prefetch lands on the identical cache entry. A prefetch at an
 * off-by-anything width is a whole extra download, not a speed-up — which is why
 * this shares `pickWidth` with the render path rather than trusting the caller's
 * number verbatim.
 */
export function prefetchCarImage(image: CarImageDTO | null, width: number): void {
  if (!image || typeof window === 'undefined') return;

  const url = cldUrl(image.publicId, { width: pickWidth(image.width, width), fit: 'limit' });
  if (!url) return;

  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}