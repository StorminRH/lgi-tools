// Shared types for the owned-blueprints Neon slice (MIGRATE.0). The paged-owned port,
// owner key, sync-state, and read-result shapes are the shared owner-sync platform's
// (src/platform/owner-sync, Family-2 generalization); this slice supplies only its projected
// row (OwnedBlueprint). Kept I/O-free so the refresh orchestration (refresh.ts) can
// depend on the port abstraction WITHOUT importing the DB layer (queries.ts) or the auth
// slice — which it may not (feature→feature is boundary-banned). The non-zone wrapper
// (src/db) builds the real port; the orchestration is unit-tested against a fake one.
import type { OwnedDatasetPort } from '@/platform/owner-sync';
import type { OwnedBlueprint } from './esi-projection';

/**
 * The injected I/O the refresh runs over — the shared paged-owned port over this
 * slice's row. The real implementation is wired in src/composition/sync/owned-blueprints-sync.ts.
 */
export type OwnedBlueprintsPort = OwnedDatasetPort<OwnedBlueprint>;
