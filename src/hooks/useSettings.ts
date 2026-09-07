/**
 * Settings query + the admin write — CONTRACT.md §10.
 *
 * Owned by P03. `SettingsDTO` is the fallback layer under every car: the driver
 * rate, km limit, extra-km charge, WhatsApp number and pickup address that a car
 * uses when it has no per-car override (CONTRACT.md §4). Almost every public
 * surface reads it, and it changes about twice a year — hence the long
 * `staleTime`.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, ApiRequestError } from '@/src/lib/api';
import type { HeroImageDTO, SettingsDTO } from '@/src/types/api';
import { qk } from './queryKeys';

/** 10 minutes — settings change almost never, and this is read on every page. */
const SETTINGS_STALE_TIME = 10 * 60 * 1000;

export function useSettings(): UseQueryResult<SettingsDTO, ApiRequestError> {
  return useQuery<SettingsDTO, ApiRequestError>({
    queryKey: qk.settings,
    queryFn: () => api.getSettings(),
    staleTime: SETTINGS_STALE_TIME,
  });
}

/**
 * Also invalidates `qk.cars`: a changed default driver rate or km limit changes
 * the numbers rendered on every car that has no override.
 */
export function useUpdateSettings(): UseMutationResult<SettingsDTO, ApiRequestError, SettingsDTO> {
  const client = useQueryClient();
  return useMutation<SettingsDTO, ApiRequestError, SettingsDTO>({
    mutationFn: (input) => api.updateSettings(input),
    onSuccess: (settings) => {
      client.setQueryData(qk.settings, settings);
      void client.invalidateQueries({ queryKey: qk.settings });
      void client.invalidateQueries({ queryKey: qk.cars });
    },
  });
}

/** Set/replace the homepage hero image. Refreshes settings so the home page updates. */
export function useSetHeroImage(): UseMutationResult<SettingsDTO, ApiRequestError, HeroImageDTO> {
  const client = useQueryClient();
  return useMutation<SettingsDTO, ApiRequestError, HeroImageDTO>({
    mutationFn: (input) => api.setHeroImage(input),
    onSuccess: (settings) => {
      client.setQueryData(qk.settings, settings);
      void client.invalidateQueries({ queryKey: qk.settings });
    },
  });
}

/** Clear the homepage hero image. */
export function useDeleteHeroImage(): UseMutationResult<SettingsDTO, ApiRequestError, void> {
  const client = useQueryClient();
  return useMutation<SettingsDTO, ApiRequestError, void>({
    mutationFn: () => api.deleteHeroImage(),
    onSuccess: (settings) => {
      client.setQueryData(qk.settings, settings);
      void client.invalidateQueries({ queryKey: qk.settings });
    },
  });
}