/**
 * The single point where P04 touches P03's admin mutation hooks.
 *
 * CONTRACT.md §10 freezes only the four read hooks and the `qk` factory; the
 * admin mutation hooks are named in P03's prompt but their mutation-variable
 * shapes never were. Routing every call through here means a future change on
 * P03's side is a one-file fix rather than twenty call sites across five
 * components.
 *
 * Each wrapper exposes `{ run, isPending, error, reset }` so components get
 * pending state and typed errors without knowing React Query's variable shape.
 * The wrappers are deliberately **uncast** — P03's real generics flow straight
 * through, so `tsc` verifies every assumption here instead of hiding it.
 */

import { useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  useAdminAuth,
  useCreateCar,
  useUpdateCar,
  useDeleteCar,
  useAddImage,
  useReorderImages,
  useUpdateImage,
  useDeleteImage,
  useAdminLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useSetHeroImage,
  useDeleteHeroImage,
} from '@/src/hooks';
import { ApiRequestError, isConflictError } from '@/src/lib/api';

/** Re-exported so admin components have one import for P03's data layer. */
export { isConflictError };

/** What every wrapper below returns. `run` rejects on failure, so callers can `await` in a try/catch. */
export interface AdminAction<TVars, TResult> {
  run: (vars: TVars) => Promise<TResult>;
  isPending: boolean;
  error: ApiRequestError | null;
  reset: () => void;
}

function wrap<TResult, TVars>(
  m: UseMutationResult<TResult, ApiRequestError, TVars>,
): AdminAction<TVars, TResult> {
  return { run: m.mutateAsync, isPending: m.isPending, error: m.error, reset: m.reset };
}

// --- session ------------------------------------------------------------

/**
 * The owner's session. `email` is whatever the server says it is — the sidebar
 * must never display a hardcoded identity.
 */
export function useAdminSession() {
  const auth = useAdminAuth();
  const login = wrap(auth.login);
  const logout = wrap(auth.logout);
  const runLogin = login.run;

  return {
    email: auth.me.data?.email ?? null,
    isAuthenticated: auth.isAuthenticated,
    login: useCallback(
      (email: string, password: string) => runLogin({ email, password }),
      [runLogin],
    ),
    logout: logout.run,
    isLoggingIn: login.isPending,
    isLoggingOut: logout.isPending,
    loginError: login.error,
    resetLoginError: login.reset,
  };
}

// --- cars ---------------------------------------------------------------

export function useCarCreate() {
  return wrap(useCreateCar());
}

export function useCarUpdate() {
  return wrap(useUpdateCar());
}

export function useCarDelete() {
  return wrap(useDeleteCar());
}

// --- images -------------------------------------------------------------

export function useImageAdd() {
  return wrap(useAddImage());
}

export function useImageReorder() {
  return wrap(useReorderImages());
}

export function useImageUpdate() {
  return wrap(useUpdateImage());
}

export function useImageDelete() {
  return wrap(useDeleteImage());
}

// --- branches (CONTRACT.md §15) -----------------------------------------

/** Every branch the owner has, **including inactive ones** — unlike `useLocations()`. */
export function useAllLocations() {
  return useAdminLocations();
}

export function useLocationCreate() {
  return wrap(useCreateLocation());
}

export function useLocationUpdate() {
  return wrap(useUpdateLocation());
}

/**
 * Deleting a branch that still has cars answers `409` on purpose (CONTRACT.md
 * §8). P03 lets that error through untouched, and `LocationManagerDialog` turns
 * it into the "Deactivate instead / Delete anyway" choice.
 */
export function useLocationDelete() {
  return wrap(useDeleteLocation());
}

// --- homepage hero image ------------------------------------------------

export function useHeroImageSet() {
  return wrap(useSetHeroImage());
}

export function useHeroImageDelete() {
  return wrap(useDeleteHeroImage());
}

/** A message safe to show the owner, preferring the server's own wording. */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { message?: string } | null;
  return e?.message?.trim() || fallback;
}