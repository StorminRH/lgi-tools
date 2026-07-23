// The purge contributor contract (ACCOUNT.1). Each user/character-keyed slice
// declares ONE contributor, co-located beside its OwnerSyncDescriptor, that owns
// the teardown of its own tables. The contributor is the single place a slice's
// teardown knowledge lives: it CLAIMS its tables (by pgTable object, never by
// name string — the gate reads the SQL name off the object) and provides the
// teardown(s) the orchestrator runs.
//
// Leaf purge socket: slices import only this platform contract, never a
// registry or orchestrator. Composition pulls their exported contributors
// together above them.
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Teardown order — the orchestrator runs tiers in this sequence:
 *   credential → the EVE link + tokens (kill access first, so nothing can ESI-fetch
 *                during the rest of the purge)
 *   cache      → regenerable ESI mirrors (skills, jobs, assets, blueprints, telemetry)
 *   durable    → app-authored, non-regenerable per-user data (preferences, custom structures)
 */
export type PurgeTier = 'credential' | 'cache' | 'durable';

/**
 * What is being purged: one character (its per-character rows) or one user (its
 * per-user rows). A full account-nuke (ACCOUNT.2) is N character purges + 1 user
 * purge; this layer provides the building blocks, not that orchestration.
 */
export type PurgeSubject =
  | { readonly kind: 'character'; readonly userId: string; readonly characterId: number }
  | { readonly kind: 'user'; readonly userId: string };

/**
 * Character purge subject containing the human user ID and finite EVE character ID required by
 * per-slice contributors.
 */
export type PurgeCharacterSubject = Extract<PurgeSubject, { kind: 'character' }>;
/** Whole-user purge subject used when every character and user-keyed row must be removed. */
export type PurgeUserSubject = Extract<PurgeSubject, { kind: 'user' }>;

/**
 * A user/character-keyed table this slice deliberately RETAINS (never purges),
 * declared with a reason — the same explicit discipline as a claim, so a retained
 * table is an audited decision the gate can see, never a silent omission.
 */
export interface RetainedTable {
  readonly table: PgTable;
  readonly reason: string;
}

/**
 * Per-slice personal-data purge contract; implementations own their tables while the registry owns
 * cross-slice ordering.
 */
export interface PurgeContributor {
  readonly name: string;
  readonly tier: PurgeTier;
  // Every user/character-keyed table this slice owns the teardown of. The gate
  // requires each flagged table to be claimed here (or declared in `retained`).
  readonly claims: readonly PgTable[];
  readonly retained?: readonly RetainedTable[];
  // Per-character / per-user teardown. A contributor implements whichever axis it
  // has rows on (skills are character-only; preferences are user-only; the corp
  // tables are user-keyed). The orchestrator skips the absent axis.
  purgeCharacter?(subject: PurgeCharacterSubject): Promise<void>;
  purgeUser?(subject: PurgeUserSubject): Promise<void>;
}
