// The generic per-owner ESI→Neon sync engine (MIGRATE.D.2). Each per-owner slice
// imports this barrel, supplies an OwnerSyncDescriptor, and calls runOwnerSync from
// its refreshXForUser(port, userId). See types.ts for the seam.
export { runOwnerSync } from './engine';
export { planRead } from './plan';
// The slices consume only the descriptor type from the barrel; the component types
// (OwnerAxis, CorpOwnerAxis, EnumeratedOwner, PersistVerdict) stay in ./types for the
// engine's own use — re-export them here when a consumer actually needs them.
export type { OwnerSyncDescriptor } from './types';
