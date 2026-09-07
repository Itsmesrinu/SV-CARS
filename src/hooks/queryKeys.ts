/**
 * The frozen React Query key factory — CONTRACT.md §10.
 *
 * Owned by P03. These keys are a cross-session interface: P04's admin mutations
 * invalidate keys that P05's public pages read. Changing a key here silently
 * breaks invalidation in files this session does not own, so treat them as
 * frozen and always go through `qk` rather than writing an array literal.
 *
 * Note the deliberate prefix structure: `qk.car(id)` is `['cars', id]`, so
 * invalidating `qk.cars` (`['cars']`) invalidates every car detail query too.
 * Same for the admin keys under `['admin', …]`.
 */
export const qk = {
  cars: ['cars'] as const,
  car: (id: string) => ['cars', id] as const,
  locations: ['locations'] as const,
  adminLocations: ['admin', 'locations'] as const,
  fleetAvailability: (from: string, to: string) => ['admin', 'availability', from, to] as const,
  carAvailability: (carId: string) => ['admin', 'availability', 'car', carId] as const,
  settings: ['settings'] as const,
  me: ['admin', 'me'] as const,
};