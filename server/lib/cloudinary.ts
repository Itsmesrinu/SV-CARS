/**
 * Server-side Cloudinary — signing browser uploads and destroying assets.
 *
 * CONTRACT.md §5.2. This module is the ONLY place the API secret is read, and
 * nothing under `src/` may ever import it: a secret pulled into the Vite module
 * graph is a secret shipped in the browser bundle, and P08 greps `dist/` for
 * exactly that.
 *
 * The browser never sends a file through this API. Vercel caps function request
 * bodies at ~4.5 MB and a modern phone photo clears that on its own, so the
 * browser uploads straight to Cloudinary and the server only signs the request.
 *
 * Owned by P01.
 */

import { v2 as cloudinary } from 'cloudinary';
import { internal } from './errors.js';

const REQUIRED_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

/** Names of the vars that are missing, computed once at module load. */
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  // Loud at startup, named, and actionable. Deliberately a log rather than a
  // throw: a missing image credential must not take down /api/health and every
  // public route for a session that is only working on the fleet pages. The
  // throw happens at the point of use instead — see `assertConfigured()`.
  console.error(
    `[cloudinary] not configured — missing ${missingEnv.join(', ')}. ` +
      'Image upload signing and asset deletion will fail until these are set. See .env.example.',
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  // Without this the SDK emits http:// URLs, which a deployed HTTPS site blocks
  // as mixed content.
  secure: true,
});

/**
 * Fails with the name of the missing variable rather than letting Cloudinary
 * answer `401 Unknown API key`, which reads like a revoked credential and sends
 * you looking in the dashboard instead of at your `.env.local`.
 */
function assertConfigured(): void {
  if (missingEnv.length > 0) {
    throw internal(`Cloudinary is not configured: ${missingEnv.join(', ')} missing.`);
  }
}

export const CLOUDINARY_FOLDER_ROOT = 'sv-cars';

export interface SignedUploadParams {
  timestamp: number;
  folder: string;
  public_id: string;
}

export interface SignedUpload extends SignedUploadParams {
  cloudName: string;
  apiKey: string;
  signature: string;
}

/**
 * Signs exactly the parameters the browser will send — `timestamp`, `folder`
 * and `public_id`, no more and no fewer.
 *
 * That symmetry is the security property: Cloudinary verifies the signature over
 * the parameters it receives, so signing a subset would leave the unsigned ones
 * free for the caller to change, and signing a superset simply fails to verify.
 */
export function signUpload(params: SignedUploadParams): SignedUpload {
  assertConfigured();

  const signature = cloudinary.utils.api_sign_request(
    { timestamp: params.timestamp, folder: params.folder, public_id: params.public_id },
    process.env.CLOUDINARY_API_SECRET as string,
  );

  return {
    ...params,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: process.env.CLOUDINARY_API_KEY as string,
    signature,
  };
}

/**
 * Best-effort asset deletion. Never throws.
 *
 * Cleanup must not be able to fail a delete the owner asked for: if Cloudinary
 * is down, the DB row still goes and the orphaned asset is logged. The
 * alternative — a 500 on `DELETE /admin/cars/:id` — leaves the owner with a car
 * he cannot remove.
 */
export async function destroyAsset(publicId: string): Promise<boolean> {
  if (missingEnv.length > 0) {
    console.error(`[cloudinary] cannot destroy ${publicId}: ${missingEnv.join(', ')} missing.`);
    return false;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    if (result.result !== 'ok' && result.result !== 'not found') {
      console.error(`[cloudinary] destroy ${publicId} returned "${result.result}" — orphaned.`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[cloudinary] destroy ${publicId} failed — asset orphaned:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Destroys several assets, reporting how many survived. Never throws. */
export async function destroyAssets(publicIds: string[]): Promise<void> {
  if (publicIds.length === 0) return;
  const results = await Promise.all(publicIds.map((id) => destroyAsset(id)));
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`[cloudinary] ${failed}/${publicIds.length} assets could not be destroyed.`);
  }
}

export { cloudinary };