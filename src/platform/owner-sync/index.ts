// The generic per-owner ESI→Neon sync engine (MIGRATE.D.2). Each per-owner slice
// imports this barrel, supplies an OwnerSyncDescriptor, and calls runOwnerSync from
// its refreshXForUser(port, userId). See types.ts for the seam.
/** Builds the shared descriptor for a character-scoped owner-sync dataset. */
export { makeCharacterDescriptor } from './character';
/** Character-scoped dataset and sync-base contracts consumed by owning slices. */
export type { CharacterDatasetSpec, CharacterSyncBase } from './character';
/** Builds the shared descriptor for a corporation-scoped owner-sync dataset. */
export { makeCorpDescriptor } from './corp';
/** Corporation-scoped dataset and sync-base contracts consumed by owning slices. */
export type { CorpDatasetSpec, CorpSyncBase } from './corp';
/** Runs one descriptor-driven owner synchronization through its supplied port. */
export { runOwnerSync } from './engine';
/** Builds the shared descriptor for a paginated owned-resource dataset. */
export { makeOwnedDescriptor } from './owned';
/** Paginated owned-resource contracts consumed by owning slices. */
export type { OwnedDatasetPort, OwnedDatasetSpec, PagedOwnerReadResult } from './owned';
/** Plans the next conditional owner read from cached synchronization state. */
export { planRead } from './plan';
// The slices consume the descriptor type + the shared owned-owner types from the
// barrel; the remaining component types (OwnerAxis, CorpOwnerAxis, PersistVerdict) stay
// in ./types for the engine's own use — re-export them here when a consumer needs them.
/** Public owner-sync descriptor, result, target, and state contracts. */
export type {
  EnumeratedOwner,
  OwnerKey,
  OwnerSyncDescriptor,
  OwnerSyncResult,
  OwnerSyncRunOptions,
  OwnerSyncTarget,
  PagedOwnerSyncState,
} from './types';
