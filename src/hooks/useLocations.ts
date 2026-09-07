/**
 * Branch (location) queries and mutations — CONTRACT.md §10 and §15.
 *
 * Owned by P03. `useLocations()` is the customer-facing list (active branches
 * only, from the public endpoint); `useAdminLocations()` is P04's list, which
 * includes deactivated ones.
 *
 * Every mutation here invalidates **three** keys: `qk.locations`,
 * `qk.adminLocations` **and `qk.cars`**. The third is the one that is easy to
 * forget and impossible to miss in the UI: every `CarDTO` embeds its
 * `LocationDTO`, so renaming a city has to refresh every car card that displays
 * it, or the fleet keeps showing the old name until the 60s cache expires.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, ApiRequestError } from '@/src/lib/api';
import type { LocationDTO, LocationInput } from '@/src/types/api';
import { qk } from './queryKeys';

/** Cities change about as often as settings do. */
const LOCATIONS_STALE_TIME = 10 * 60 * 1000;

/**
 * The active branches a customer can filter by.
 *
 * An empty array is a **normal answer**, not an error: a fresh install has no
 * branches yet, and CONTRACT.md §15.4 says the city picker simply renders
 * nothing when there are fewer than two options. Consumers must key their
 * loading state off `isPending`, never off `data.length === 0`.
 */
export function useLocations(): UseQueryResult<LocationDTO[], ApiRequestError> {
  return useQuery<LocationDTO[], ApiRequestError>({
    queryKey: qk.locations,
    queryFn: () => api.getLocations(),
    staleTime: LOCATIONS_STALE_TIME,
  });
}

/** Admin list — includes `isActive: false` branches so the owner can re-enable them. */
export function useAdminLocations(): UseQueryResult<LocationDTO[], ApiRequestError> {
  return useQuery<LocationDTO[], ApiRequestError>({
    queryKey: qk.adminLocations,
    queryFn: () => api.adminGetLocations(),
    retry: false,
  });
}

function useLocationInvalidator() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: qk.locations });
    void client.invalidateQueries({ queryKey: qk.adminLocations });
    // Every car embeds its branch — see the file header.
    void client.invalidateQueries({ queryKey: qk.cars });
  };
}

export function useCreateLocation(): UseMutationResult<
  LocationDTO,
  ApiRequestError,
  LocationInput
> {
  const invalidate = useLocationInvalidator();
  return useMutation<LocationDTO, ApiRequestError, LocationInput>({
    mutationFn: (input) => api.createLocation(input),
    onSuccess: invalidate,
  });
}

export interface UpdateLocationVars {
  id: string;
  patch: Partial<LocationInput>;
}

export function useUpdateLocation(): UseMutationResult<
  LocationDTO,
  ApiRequestError,
  UpdateLocationVars
> {
  const invalidate = useLocationInvalidator();
  return useMutation<LocationDTO, ApiRequestError, UpdateLocationVars>({
    mutationFn: ({ id, patch }) => api.updateLocation(id, patch),
    onSuccess: invalidate,
  });
}

export interface DeleteLocationVars {
  id: string;
  /** Repeat the call with `force: true` to null out the referencing cars' `locationId`. */
  force?: boolean;
}

/**
 * Deleting a branch that still has cars fails with **`409 conflict`**, and that
 * error is deliberately **not swallowed** — it reaches the caller through
 * `mutation.error` with the server's message ("3 cars are still assigned to this
 * branch") intact, so P04 can offer the reassign / deactivate / force choice.
 * Use `isConflictError(error)` from `src/lib/api.ts` to detect it.
 */
export function useDeleteLocation(): UseMutationResult<void, ApiRequestError, DeleteLocationVars> {
  const invalidate = useLocationInvalidator();
  return useMutation<void, ApiRequestError, DeleteLocationVars>({
    mutationFn: ({ id, force }) => api.deleteLocation(id, { force }),
    onSuccess: invalidate,
  });
}