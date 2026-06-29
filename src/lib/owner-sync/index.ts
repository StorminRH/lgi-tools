// The generic per-owner ESI→Neon sync engine (MIGRATE.D.2). Each per-owner slice
// imports this barrel, supplies an OwnerSyncDescriptor, and calls runOwnerSync from
// its refreshXForUser(port, userId). See types.ts for the seam.
export { runOwnerSync } from './engine';
export { planRead } from './plan';
export type {
  CorpOwnerAxis,
  EnumeratedOwner,
  OwnerAxis,
  OwnerSyncDescriptor,
  PersistVerdict,
} from './types';
