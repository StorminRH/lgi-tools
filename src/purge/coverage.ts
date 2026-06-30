// The purge coverage map — the gate's pure logic plus the declared accounting for
// data homes the schema-reflection gate can't see. DB-free: getTableConfig reads a
// pgTable's metadata (name + columns) with no database connection.
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

// The sanctioned identity columns. A personal / per-owner table MUST key on one of
// these so it can't silently slip the purge gate (the house rule, mirrored in
// CLAUDE.md and the gate test). `owner_id` is the polymorphic per-owner key, but
// ONLY when paired with an `owner_type` discriminator (the owned_assets /
// owned_blueprints char|corp pattern) — a bare `owner_id` is an SDE/reference
// owner (e.g. eve_npc_stations' owning NPC corp), not user data. `corporation_id`
// alone is deliberately out-of-scope: corp-shared tables (the corp-structures
// catalogue) are not torn down by a personal purge.
export const PURGE_DIRECT_IDENTITY_COLUMNS = ['user_id', 'character_id'] as const;

// True when the table is keyed by a user or character — the set the gate requires
// a contributor (or a declared exemption) for.
export function isUserDataTable(table: PgTable): boolean {
  const columns = getTableConfig(table).columns.map((c) => c.name);
  if (PURGE_DIRECT_IDENTITY_COLUMNS.some((id) => columns.includes(id))) return true;
  // Polymorphic per-owner: owner_id is identity only alongside owner_type.
  return columns.includes('owner_id') && columns.includes('owner_type');
}

// The gate's core assertion as a pure set difference, so it can be unit-tested for
// the red path (an unclaimed user-data table must be returned) independent of the
// live schema. Returns the flagged tables that are neither claimed nor retained.
export function findUnclaimed(
  flagged: readonly string[],
  claimed: ReadonlySet<string>,
  retained: ReadonlySet<string>,
): string[] {
  return flagged.filter((name) => !claimed.has(name) && !retained.has(name));
}

// Data homes that hold user/character state but are NOT Neon tables, so the
// schema-reflection gate cannot see them. Declared here so every home is accounted
// for — the same discipline as a retained-table exemption: a deferral is an
// explicit, audited entry, never a silent omission. The gate test pins this list.
export const DEFERRED_HOMES = [
  {
    home: 'convex:characterOnline',
    coveredByToday: 'lazy orphan-clean in convex/onlineStatus.applySyncResults',
    explicitTeardownOwedBy: 'ACCOUNT.2',
    reason:
      'lazy orphan-clean cannot cover an account-nuke (no subsequent sync re-enumerates the removed user), so explicit Convex teardown lands with the nuke that needs it.',
  },
] as const;
