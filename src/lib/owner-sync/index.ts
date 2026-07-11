// The generic per-owner ESI→Neon sync engine (MIGRATE.D.2). Each per-owner slice
// imports this barrel, supplies an OwnerSyncDescriptor, and calls runOwnerSync from
// its refreshXForUser(port, userId). See types.ts for the seam.
export { makeCharacterDescriptor } from './character';
export type { CharacterDatasetSpec, CharacterSyncBase } from './character';
export { runOwnerSync } from './engine';
export { makeOwnedDescriptor } from './owned';
export type { OwnedDatasetPort, OwnedDatasetSpec, PagedOwnerReadResult } from './owned';
export { planRead } from './plan';
// The slices consume the descriptor type + the shared owned-owner types from the
// barrel; the remaining component types (OwnerAxis, CorpOwnerAxis, PersistVerdict) stay
// in ./types for the engine's own use — re-export them here when a consumer needs them.
export type { EnumeratedOwner, OwnerKey, OwnerSyncDescriptor, PagedOwnerSyncState } from './types';
