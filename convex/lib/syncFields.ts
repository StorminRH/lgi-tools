// Validator shapes with two real owners each, kept in a convex/values-only
// leaf so schema.ts can import them without widening its bundle:
// purgeScopeArgs (both Neon→Convex purge doors) and runObservabilityFields
// (the syncSubjects schema + the shared apply-args validator). Single-owner
// seam shapes live with their one consumer, not here.
import { v } from 'convex/values';

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
