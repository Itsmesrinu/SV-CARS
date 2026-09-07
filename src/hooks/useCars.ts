/**
 * Car queries and the admin car/image mutations — CONTRACT.md §10.
 *
 * Owned by P03. `useCars`/`useCar` are the public reads; everything below them
 * is for P04's admin panel.
 *
 * The invalidation rule every mutation here follows: **`qk.cars` AND
 * `qk.car(id)`**. Invalidating only the list leaves the detail page rendering
 * the pre-edit car, which reads to the owner as a save that didn't happen — and
 * docs/admin-rules.md says his changes must show up immediately.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, ApiRequestError } from '@/src/lib/api';
import type {
  AddImageInput,
  CarDTO,
  CarImageDTO,
  CarInput,
  UpdateImageInput,
} from '@/src/types/api';
import { qk } from './queryKeys';

/** The whole fleet, one cached payload. Every car embeds its `location` and `blocks`. */
export function useCars(): UseQueryResult<CarDTO[], ApiRequestError> {
  return useQuery<CarDTO[], ApiRequestError>({
    queryKey: qk.cars,
    queryFn: () => api.getCars(),
  });
}

/** One car. Disabled while `id` is undefined so it never fires on a half-resolved route param. */
export function useCar(id: string | undefined): UseQueryResult<CarDTO, ApiRequestError> {
  return useQuery<CarDTO, ApiRequestError>({
    queryKey: qk.car(id ?? ''),
    queryFn: () => api.getCar(id as string),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

/** Shared: refresh the fleet list and, when we know which car changed, its detail entry. */
function useCarInvalidator() {
  const client = useQueryClient();
  return (carId?: string) => {
    void client.invalidateQueries({ queryKey: qk.cars });
    if (carId) void client.invalidateQueries({ queryKey: qk.car(carId) });
  };
}

export function useCreateCar(): UseMutationResult<CarDTO, ApiRequestError, CarInput> {
  const invalidate = useCarInvalidator();
  return useMutation<CarDTO, ApiRequestError, CarInput>({
    mutationFn: (input) => api.createCar(input),
    onSuccess: (car) => invalidate(car.id),
  });
}

export interface UpdateCarVars {
  id: string;
  patch: Partial<CarInput>;
}

export function useUpdateCar(): UseMutationResult<CarDTO, ApiRequestError, UpdateCarVars> {
  const invalidate = useCarInvalidator();
  return useMutation<CarDTO, ApiRequestError, UpdateCarVars>({
    mutationFn: ({ id, patch }) => api.updateCar(id, patch),
    // The server may re-slugify on rename, so invalidate both the requested id
    // and the id that came back.
    onSuccess: (car, { id }) => {
      invalidate(id);
      if (car.id !== id) invalidate(car.id);
    },
  });
}

export function useDeleteCar(): UseMutationResult<void, ApiRequestError, string> {
  const client = useQueryClient();
  return useMutation<void, ApiRequestError, string>({
    mutationFn: (id) => api.deleteCar(id),
    onSuccess: (_result, id) => {
      client.removeQueries({ queryKey: qk.car(id) });
      void client.invalidateQueries({ queryKey: qk.cars });
    },
  });
}

export interface AddImageVars {
  carId: string;
  meta: AddImageInput;
}

export function useAddImage(): UseMutationResult<CarImageDTO, ApiRequestError, AddImageVars> {
  const invalidate = useCarInvalidator();
  return useMutation<CarImageDTO, ApiRequestError, AddImageVars>({
    mutationFn: ({ carId, meta }) => api.addImage(carId, meta),
    onSuccess: (_image, { carId }) => invalidate(carId),
  });
}

export interface ReorderImagesVars {
  carId: string;
  /** Image ids in their new order. */
  order: string[];
}

/**
 * Drag-and-drop reorder, optimistic with rollback.
 *
 * This is the one mutation worth the extra code: without it the dragged
 * thumbnail visibly snaps back to its old slot for the duration of the round
 * trip and then jumps into place, which reads as a broken drag rather than a
 * slow one. The cached `CarDTO.images` array is reordered immediately and only
 * reverted if the server refuses.
 */
export function useReorderImages(): UseMutationResult<
  CarImageDTO[],
  ApiRequestError,
  ReorderImagesVars,
  { previous: CarDTO | undefined }
> {
  const client = useQueryClient();

  return useMutation<
    CarImageDTO[],
    ApiRequestError,
    ReorderImagesVars,
    { previous: CarDTO | undefined }
  >({
    mutationFn: ({ carId, order }) => api.reorderImages(carId, order),

    onMutate: async ({ carId, order }) => {
      // Stop an in-flight refetch from landing on top of the optimistic value.
      await client.cancelQueries({ queryKey: qk.car(carId) });
      const previous = client.getQueryData<CarDTO>(qk.car(carId));

      if (previous) {
        const byId = new Map(previous.images.map((img) => [img.id, img]));
        const reordered = order
          .map((id) => byId.get(id))
          .filter((img): img is CarImageDTO => img !== undefined)
          .map((img, index) => ({ ...img, sortOrder: index }));

        // Anything the caller didn't mention keeps its relative position at the end.
        const untouched = previous.images.filter((img) => !order.includes(img.id));

        client.setQueryData<CarDTO>(qk.car(carId), {
          ...previous,
          images: [...reordered, ...untouched],
        });
      }

      return { previous };
    },

    onError: (_err, { carId }, context) => {
      if (context?.previous) client.setQueryData(qk.car(carId), context.previous);
    },

    // Settled, not success: re-sync with the server whichever way it went.
    onSettled: (_data, _err, { carId }) => {
      void client.invalidateQueries({ queryKey: qk.car(carId) });
      void client.invalidateQueries({ queryKey: qk.cars });
    },
  });
}

export interface UpdateImageVars {
  imageId: string;
  patch: UpdateImageInput;
}

/**
 * Keyed by `imageId` alone, like the endpoint — the car id is not needed to keep
 * the detail page fresh. `qk.car(id)` is `['cars', id]`, so invalidating
 * `qk.cars` (`['cars']`) matches it by prefix and refreshes every car detail
 * query along with the list.
 */
export function useUpdateImage(): UseMutationResult<CarImageDTO, ApiRequestError, UpdateImageVars> {
  const invalidate = useCarInvalidator();
  return useMutation<CarImageDTO, ApiRequestError, UpdateImageVars>({
    mutationFn: ({ imageId, patch }) => api.updateImage(imageId, patch),
    onSuccess: () => invalidate(),
  });
}

/** Also destroys the Cloudinary asset, server-side. Same prefix invalidation as above. */
export function useDeleteImage(): UseMutationResult<void, ApiRequestError, string> {
  const invalidate = useCarInvalidator();
  return useMutation<void, ApiRequestError, string>({
    mutationFn: (imageId) => api.deleteImage(imageId),
    onSuccess: () => invalidate(),
  });
}