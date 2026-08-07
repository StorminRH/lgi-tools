// The canonical per-tracker seam shapes shared by every engine sync consumer
// (onlineStatus, characterLocation): the engine-dispatched action signature,
// the per-character loop outcome, the Neon-purge door scope, and the run
// observability stamp. A validator-only leaf (convex/values), importable from
// schema.ts and the tracker modules without widening the schema bundle.
import { v } from 'convex/values';

/** Args every engine-dispatched sync action takes (dispatch() supplies them). */
export const syncRunArgs = {
  userId: v.string(),
  generation: v.number(),
};

/**
 * Args every Neon→Convex purge door takes: characterId null tears down the
 * whole user (account-nuke); a number tears down one character.
 */
export const purgeScopeArgs = {
  userId: v.string(),
  characterId: v.union(v.number(), v.null()),
};

/**
 * The run-level error + rate-limit observability fields stamped onto the
 * subject row by every apply — one authoritative shape for the schema and
 * the apply-args validator.
 */
export const runObservabilityFields = {
  lastError: v.union(v.string(), v.null()),
  rlGroup: v.union(v.string(), v.null()),
  rlLimit: v.union(v.number(), v.null()),
  rlRemaining: v.union(v.number(), v.null()),
  rlUsed: v.union(v.number(), v.null()),
};

/**
 * What one character's processing resolves to inside a sync action's loop:
 * skipped silently (unlinked mid-run), a recorded result, or a run-stopping
 * protective state (budget exhaustion) carrying its own result row.
 */
export type SyncOutcome<Result> =
  | { kind: 'skip' }
  | { kind: 'result'; result: Result }
  | { kind: 'stop'; runError: string; result: Result };
