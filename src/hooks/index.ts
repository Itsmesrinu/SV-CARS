/**
 * One import path for every data hook: `import { useCars, qk } from '@/src/hooks'`.
 *
 * Owned by P03. CONTRACT.md §10 is the specification for what lives here.
 */

export { qk } from './queryKeys';

export {
  useCars,
  useCar,
  useCreateCar,
  useUpdateCar,
  useDeleteCar,
  useAddImage,
  useReorderImages,
  useUpdateImage,
  useDeleteImage,
  type UpdateCarVars,
  type AddImageVars,
  type ReorderImagesVars,
  type UpdateImageVars,
} from './useCars';

export {
  useSettings,
  useUpdateSettings,
  useSetHeroImage,
  useDeleteHeroImage,
} from './useSettings';

export {
  useLocations,
  useAdminLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  type UpdateLocationVars,
  type DeleteLocationVars,
} from './useLocations';

export {
  useFleetAvailability,
  useCarAvailability,
  useAddBlock,
  useUpdateBlock,
  useDeleteBlock,
  type AddBlockVars,
  type UpdateBlockVars,
  type DeleteBlockVars,
} from './useAvailability';

export { useAdminAuth, type AdminAuth, type LoginVars } from './useAdminAuth';

// Re-exported for convenience: consumers branching on a 409 (branch delete, block
// overlap) or a 401 shouldn't need a second import to do it.
export { ApiRequestError, isConflictError, isUnauthorizedError, api } from '@/src/lib/api';