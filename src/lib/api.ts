/**
 * Typed API client — the single place the SPA talks to the Hono API.
 *
 * Owned by P03, consumed by P04 (admin) and P05 (public pages).
 * The exported surface is frozen by CONTRACT.md §9.
 *
 * Two rules baked in here rather than left to callers:
 *
 * 1. **Same-origin `/api`, always.** No host, no base-URL env var. In dev the
 *    Vite proxy forwards `/api` to the Hono server on 3001; in production Vercel
 *    serves both from one domain (CONTRACT.md §13). Same-origin is also what
 *    makes the httpOnly `sv_session` cookie work identically in both.
 * 2. **Admin requests are never cached.** Every `/api/admin/*` call sends
 *    `cache: 'no-store'` and `credentials: 'same-origin'`. The no-store is a
 *    requirement from docs/admin-rules.md ("admin changes should affect customer
 *    pages immediately") fighting the 60s public cache — not an optimisation.
 *
 * There is deliberately no retry logic in this file. React Query owns retries.
 */

import type {
  AddImageInput,
  ApiError,
  AvailabilityBlockDTO,
  BlockInput,
  CarDTO,
  CarImageDTO,
  CarInput,
  HeroImageDTO,
  LocationDTO,
  LocationInput,
  SettingsDTO,
  UpdateImageInput,
  UploadSignature,
} from '@/src/types/api';

const BASE = '/api';

/**
 * Every failure from this module — HTTP, network, or a non-JSON body — arrives
 * as one of these, so callers only ever have to catch one type.
 *
 * `code` mirrors the server's `{ error: { code } }` (CONTRACT.md §3) so callers
 * can branch on `'conflict'`, `'not_found'`, `'unauthorized'`, … without string
 * matching a message. `status` is the HTTP status, or `0` when the request never
 * reached the server.
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  /** The parsed response body, when there was one. Useful for extra fields the server adds. */
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
    // Required for `instanceof` to survive the ES5-ish downlevel of built-ins.
    Object.setPrototypeOf(this, ApiRequestError.prototype);
  }
}

/** True for the `409` responses that `deleteLocation`, `addBlock` and `updateBlock` can return. */
export function isConflictError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.status === 409;
}

/** True for a missing session — a legitimate answer from `me()`, not a failure. */
export function isUnauthorizedError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.status === 401;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Serialised as JSON when present. `undefined` sends no body and no content-type. */
  body?: unknown;
  /** Adds `credentials: 'same-origin'` + `cache: 'no-store'`. True for every `/api/admin/*` call. */
  admin?: boolean;
  signal?: AbortSignal;
}

function looksLikeHtml(text: string): boolean {
  return text.trimStart().startsWith('<');
}

function isApiError(payload: unknown): payload is ApiError {
  if (typeof payload !== 'object' || payload === null) return false;
  const error = (payload as { error?: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, admin = false, signal } = opts;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers, signal };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (admin) {
    init.credentials = 'same-origin';
    init.cache = 'no-store';
  }

  const url = `${BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    // Offline, DNS, CORS, or — locally — `npm run dev:api` simply isn't running.
    throw new ApiRequestError(
      'network_error',
      0,
      `Could not reach the API at ${url}. Check your connection; in local dev make sure the API server is running (npm run dev:api on port 3001).`,
      cause,
    );
  }

  const text = await res.text();

  let payload: unknown;
  if (text.trim() !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      // The classic misconfiguration: the SPA rewrite swallowed /api and handed
      // back index.html. Say so, rather than letting `Unexpected token <` reach
      // the console and cost someone an afternoon.
      if (looksLikeHtml(text)) {
        throw new ApiRequestError(
          'invalid_response',
          res.status,
          `${method} ${url} returned HTML, not JSON. The /api route is being served by the SPA fallback instead of the API — check the Vite proxy (dev) or the Vercel rewrite order (production), and that the API server is up.`,
        );
      }
      throw new ApiRequestError(
        'invalid_response',
        res.status,
        `${method} ${url} returned a body that is not valid JSON.`,
      );
    }
  }

  if (!res.ok) {
    if (isApiError(payload)) {
      throw new ApiRequestError(
        payload.error.code,
        res.status,
        payload.error.message || `${method} ${url} failed with ${res.status}.`,
        payload,
      );
    }
    throw new ApiRequestError(
      `http_${res.status}`,
      res.status,
      `${method} ${url} failed with ${res.status} ${res.statusText}.`,
      payload,
    );
  }

  // 204 / empty body: the `void`-returning methods below never read the result.
  return payload as T;
}

export const api = {
  // ---------------------------------------------------------------- public --
  // These unwrap the server's envelope (CONTRACT.md §8): the wire format carries
  // `{ cars: [...] }`, callers get `CarDTO[]`.

  async getCars(): Promise<CarDTO[]> {
    const { cars } = await request<{ cars: CarDTO[] }>('/cars');
    return cars;
  },

  async getCar(id: string): Promise<CarDTO> {
    const { car } = await request<{ car: CarDTO }>(`/cars/${encodeURIComponent(id)}`);
    return car;
  },

  async getLocations(): Promise<LocationDTO[]> {
    const { locations } = await request<{ locations: LocationDTO[] }>('/locations');
    return locations;
  },

  async getSettings(): Promise<SettingsDTO> {
    const { settings } = await request<{ settings: SettingsDTO }>('/settings');
    return settings;
  },

  // ----------------------------------------------------------------- admin --
  // Every method below passes `admin: true` → `credentials: 'same-origin'` +
  // `cache: 'no-store'`.

  async login(email: string, password: string): Promise<void> {
    await request<{ ok: true }>('/admin/login', {
      method: 'POST',
      body: { email, password },
      admin: true,
    });
  },

  async logout(): Promise<void> {
    await request<{ ok: true }>('/admin/logout', { method: 'POST', admin: true });
  },

  me(): Promise<{ email: string }> {
    return request<{ email: string }>('/admin/me', { admin: true });
  },

  async createCar(input: CarInput): Promise<CarDTO> {
    const { car } = await request<{ car: CarDTO }>('/admin/cars', {
      method: 'POST',
      body: input,
      admin: true,
    });
    return car;
  },

  async updateCar(id: string, patch: Partial<CarInput>): Promise<CarDTO> {
    const { car } = await request<{ car: CarDTO }>(`/admin/cars/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      admin: true,
    });
    return car;
  },

  async deleteCar(id: string): Promise<void> {
    await request<{ ok: true }>(`/admin/cars/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      admin: true,
    });
  },

  /** `carId` null signs a site-level asset (the homepage hero) instead of a car photo. */
  signUpload(carId: string | null, filename: string): Promise<UploadSignature> {
    return request<UploadSignature>('/admin/uploads/sign', {
      method: 'POST',
      body: carId ? { carId, filename } : { filename },
      admin: true,
    });
  },

  async addImage(carId: string, meta: AddImageInput): Promise<CarImageDTO> {
    const { image } = await request<{ image: CarImageDTO }>(
      `/admin/cars/${encodeURIComponent(carId)}/images`,
      { method: 'POST', body: meta, admin: true },
    );
    return image;
  },

  async reorderImages(carId: string, order: string[]): Promise<CarImageDTO[]> {
    const { images } = await request<{ images: CarImageDTO[] }>(
      `/admin/cars/${encodeURIComponent(carId)}/images/reorder`,
      { method: 'PATCH', body: { order }, admin: true },
    );
    return images;
  },

  async updateImage(imageId: string, patch: UpdateImageInput): Promise<CarImageDTO> {
    const { image } = await request<{ image: CarImageDTO }>(
      `/admin/images/${encodeURIComponent(imageId)}`,
      { method: 'PATCH', body: patch, admin: true },
    );
    return image;
  },

  async deleteImage(imageId: string): Promise<void> {
    await request<{ ok: true }>(`/admin/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
      admin: true,
    });
  },

  async updateSettings(input: SettingsDTO): Promise<SettingsDTO> {
    const { settings } = await request<{ settings: SettingsDTO }>('/admin/settings', {
      method: 'PUT',
      body: input,
      admin: true,
    });
    return settings;
  },

  /** Set/replace the homepage hero image. Returns the updated settings. */
  async setHeroImage(input: HeroImageDTO): Promise<SettingsDTO> {
    const { settings } = await request<{ settings: SettingsDTO }>('/admin/settings/hero', {
      method: 'PUT',
      body: input,
      admin: true,
    });
    return settings;
  },

  /** Clear the homepage hero image (destroys the Cloudinary asset). */
  async deleteHeroImage(): Promise<SettingsDTO> {
    const { settings } = await request<{ settings: SettingsDTO }>('/admin/settings/hero', {
      method: 'DELETE',
      admin: true,
    });
    return settings;
  },

  // --- branches (CONTRACT.md §15) ---

  /** Admin list — includes inactive branches, unlike the public `getLocations()`. */
  async adminGetLocations(): Promise<LocationDTO[]> {
    const { locations } = await request<{ locations: LocationDTO[] }>('/admin/locations', {
      admin: true,
    });
    return locations;
  },

  async createLocation(input: LocationInput): Promise<LocationDTO> {
    const { location } = await request<{ location: LocationDTO }>('/admin/locations', {
      method: 'POST',
      body: input,
      admin: true,
    });
    return location;
  },

  async updateLocation(id: string, patch: Partial<LocationInput>): Promise<LocationDTO> {
    const { location } = await request<{ location: LocationDTO }>(
      `/admin/locations/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: patch, admin: true },
    );
    return location;
  },

  /**
   * Throws `ApiRequestError` with `status: 409` when cars still reference the
   * branch — the message carries the count. Pass `{ force: true }` to null those
   * cars' `locationId` instead (CONTRACT.md §8).
   */
  async deleteLocation(id: string, opts?: { force?: boolean }): Promise<void> {
    const query = opts?.force ? '?force=true' : '';
    await request<{ ok: true }>(`/admin/locations/${encodeURIComponent(id)}${query}`, {
      method: 'DELETE',
      admin: true,
    });
  },

  // --- availability (CONTRACT.md §16) ---

  /** The whole fleet's blocks in one window — one request feeds the month grid, never N. */
  async getFleetAvailability(from: string, to: string): Promise<AvailabilityBlockDTO[]> {
    const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const { blocks } = await request<{ blocks: AvailabilityBlockDTO[] }>(
      `/admin/availability${query}`,
      { admin: true },
    );
    return blocks;
  },

  async getCarAvailability(carId: string): Promise<AvailabilityBlockDTO[]> {
    const { blocks } = await request<{ blocks: AvailabilityBlockDTO[] }>(
      `/admin/cars/${encodeURIComponent(carId)}/availability`,
      { admin: true },
    );
    return blocks;
  },

  /** `409` when the range overlaps an existing block — surfaced, never swallowed. */
  async addBlock(carId: string, input: BlockInput): Promise<AvailabilityBlockDTO> {
    const { block } = await request<{ block: AvailabilityBlockDTO }>(
      `/admin/cars/${encodeURIComponent(carId)}/availability`,
      { method: 'POST', body: input, admin: true },
    );
    return block;
  },

  /** `409` on overlap, same as `addBlock`. */
  async updateBlock(blockId: string, patch: Partial<BlockInput>): Promise<AvailabilityBlockDTO> {
    const { block } = await request<{ block: AvailabilityBlockDTO }>(
      `/admin/availability/${encodeURIComponent(blockId)}`,
      { method: 'PATCH', body: patch, admin: true },
    );
    return block;
  },

  async deleteBlock(blockId: string): Promise<void> {
    await request<{ ok: true }>(`/admin/availability/${encodeURIComponent(blockId)}`, {
      method: 'DELETE',
      admin: true,
    });
  },
};