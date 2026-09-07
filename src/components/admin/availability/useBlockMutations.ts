/**
 * The one place this screen touches P03's mutation hooks.
 *
 * Everything above it — the page, the grid, the editor — sees only the three
 * promise-returning methods of `BlockMutations` and knows nothing about React
 * Query. If the hook layer ever changes shape, this file is the only edit.
 *
 * `carId` is passed on update and delete even though the API doesn't need it:
 * P03's invalidator uses it to reach `qk.car(carId)` (the DELETE response has no
 * body to read it from). Every mutation also invalidates `qk.cars`, which is
 * what carries a block set here through to the customer's fleet card (§16.2).
 *
 * Owned by P09.
 */

import { useAddBlock, useDeleteBlock, useUpdateBlock } from '@/src/hooks';
import type { BlockInput } from '@/src/types/api';

export interface BlockMutations {
  create(carId: string, input: BlockInput): Promise<void>;
  update(blockId: string, carId: string, patch: BlockInput): Promise<void>;
  remove(blockId: string, carId: string): Promise<void>;
}

export function useBlockMutations(): BlockMutations {
  const addBlock = useAddBlock();
  const updateBlock = useUpdateBlock();
  const deleteBlock = useDeleteBlock();

  return {
    async create(carId, input) {
      await addBlock.mutateAsync({ carId, ...input });
    },
    async update(blockId, carId, patch) {
      await updateBlock.mutateAsync({ blockId, carId, ...patch });
    },
    async remove(blockId, carId) {
      await deleteBlock.mutateAsync({ blockId, carId });
    },
  };
}

/** The message an `ApiRequestError` (or anything else thrown) carries, if any. */
export function errorMessageOf(error: unknown): string | null {
  const err = error as { message?: string } | null | undefined;
  return typeof err?.message === 'string' && err.message ? err.message : null;
}