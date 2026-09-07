/**
 * Availability blocks — CONTRACT.md §10 and §16.
 *
 * Owned by P03, consumed by P09 (the fleet month grid) and P04 (a single car's
 * blocks in the car form).
 *
 * Two rules that are load-bearing here:
 *
 * 1. **Every mutation invalidates `qk.cars`.** A car's public `blocks` array is
 *    part of `CarDTO`, so blocking dates in admin must immediately change the
 *    fleet card's badge from "Available" to "Available from 12 Sep". Miss this
 *    and the owner blocks a car, sees nothing change, and concludes the save is
 *    broken.
 * 2. **`409 conflict` reaches the caller.** An overlapping block is rejected by
 *    the server and the error is surfaced with its dates intact so P09 can render
 *    it inline on the grid. Swallowing it means the owner drags a range, nothing
 *    happens, and there is no explanation anywhere.
 *
 * Dates are `'YYYY-MM-DD'` strings, `startDate` inclusive and `endDate`
 * exclusive, throughout (CONTRACT.md §16.1).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, ApiRequestError } from '@/src/lib/api';
import type { AvailabilityBlockDTO, BlockInput } from '@/src/types/api';
import { qk } from './queryKeys';

/**
 * The whole fleet's blocks in one window — the month grid is a single request,
 * never one per car. Disabled until both bounds are present.
 */
export function useFleetAvailability(
  from: string,
  to: string,
): UseQueryResult<AvailabilityBlockDTO[], ApiRequestError> {
  return useQuery<AvailabilityBlockDTO[], ApiRequestError>({
    queryKey: qk.fleetAvailability(from, to),
    queryFn: () => api.getFleetAvailability(from, to),
    enabled: !!from && !!to,
  });
}

/** One car's blocks, including the owner's private notes. */
export function useCarAvailability(
  carId: string | undefined,
): UseQueryResult<AvailabilityBlockDTO[], ApiRequestError> {
  return useQuery<AvailabilityBlockDTO[], ApiRequestError>({
    queryKey: qk.carAvailability(carId ?? ''),
    queryFn: () => api.getCarAvailability(carId as string),
    enabled: !!carId,
  });
}

/**
 * Shared invalidation: this car's blocks, every fleet-window query (the owner may
 * have several months cached), and the public car data whose badge depends on it.
 */
function useAvailabilityInvalidator() {
  const client = useQueryClient();
  return (carId?: string) => {
    if (carId) {
      void client.invalidateQueries({ queryKey: qk.carAvailability(carId) });
      void client.invalidateQueries({ queryKey: qk.car(carId) });
    }
    // Prefix match: ['admin','availability'] covers every from/to window.
    void client.invalidateQueries({ queryKey: ['admin', 'availability'] });
    void client.invalidateQueries({ queryKey: qk.cars });
  };
}

/**
 * Flattened rather than `{ carId, input }`, following the convention CONTRACT.md
 * §10 sets with `useDeleteLocation({ id, force? })`: the id and the payload sit
 * side by side.
 */
export type AddBlockVars = BlockInput & { carId: string };

/** Throws `ApiRequestError` with `status: 409` when the range overlaps an existing block. */
export function useAddBlock(): UseMutationResult<
  AvailabilityBlockDTO,
  ApiRequestError,
  AddBlockVars
> {
  const invalidate = useAvailabilityInvalidator();
  return useMutation<AvailabilityBlockDTO, ApiRequestError, AddBlockVars>({
    mutationFn: ({ carId, ...input }) => api.addBlock(carId, input),
    onSuccess: (block, { carId }) => invalidate(block.carId ?? carId),
  });
}

export type UpdateBlockVars = Partial<BlockInput> & {
  blockId: string;
  /**
   * Optional: lets the invalidation reach `qk.car(carId)` even when the server's
   * response is unusable. On success the car id comes back on the block itself.
   */
  carId?: string;
};

/** Same `409 conflict` behaviour as `useAddBlock`. */
export function useUpdateBlock(): UseMutationResult<
  AvailabilityBlockDTO,
  ApiRequestError,
  UpdateBlockVars
> {
  const invalidate = useAvailabilityInvalidator();
  return useMutation<AvailabilityBlockDTO, ApiRequestError, UpdateBlockVars>({
    mutationFn: ({ blockId, carId: _carId, ...patch }) => api.updateBlock(blockId, patch),
    onSuccess: (block, { carId }) => invalidate(block.carId ?? carId),
  });
}

export interface DeleteBlockVars {
  blockId: string;
  /** The car the block belonged to — the DELETE response carries no body to read it from. */
  carId?: string;
}

export function useDeleteBlock(): UseMutationResult<void, ApiRequestError, DeleteBlockVars> {
  const invalidate = useAvailabilityInvalidator();
  return useMutation<void, ApiRequestError, DeleteBlockVars>({
    mutationFn: ({ blockId }) => api.deleteBlock(blockId),
    onSuccess: (_result, { carId }) => invalidate(carId),
  });
}