// The purge coverage map — the gate's pure logic plus the declared accounting for
// data homes the schema-reflection gate can't see. DB-free: getTableConfig reads a
// pgTable's metadata (name + columns) with no database connection.
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

/**
 * The sanctioned identity columns. A personal / per-owner table MUST key on one of
 * these so it can't silently slip the purge gate (the house rule, mirrored in
 * CLAUDE.md and the gate test). `owner_id` is the polymorphic per-owner key, but
 * ONLY when paired with an `owner_type` discriminator (the owned_assets /
 * owned_blueprints char|corp pattern) — a bare `owner_id` is an SDE/reference
 * owner (e.g. eve_npc_stations' owning NPC corp), not user data. `corporation_id`
 * alone is deliberately out-of-scope: corp-shared tables (the corp-structures
 * catalogue) are not torn down by a personal purge.
 */
export const PURGE_DIRECT_IDENTITY_COLUMNS = ['user_id', 'character_id'] as const;

const IDENTITY_TABLE_NAMES = new Set(['user', 'characters']);

/**
 * True when the table is keyed by a user or character — the set the gate requires
 * a contributor (or a declared exemption) for.
 */
export function isUserDataTable(table: PgTable): boolean {
  const columns = getTableConfig(table).columns.map((c) => c.name);
  if (PURGE_DIRECT_IDENTITY_COLUMNS.some((id) => columns.includes(id))) return true;
  // Polymorphic per-owner: owner_id is identity only alongside owner_type.
  return columns.includes('owner_id') && columns.includes('owner_type');
}

/**
 * Scans the given tables' foreign keys and returns each identity-table reference whose column name
 * falls outside the sanctioned key shapes, closing the gap where a novel name would evade every
 * name-based purge check.
 */
export function findIdentityFkLeaks(tables: readonly PgTable[]): string[] {
  const findings: string[] = [];
  for (const table of tables) {
    const config = getTableConfig(table);
    const columnNames = new Set(config.columns.map((column) => column.name));
    for (const foreignKey of config.foreignKeys) {
      const reference = foreignKey.reference();
      const foreignTableName = getTableConfig(reference.foreignTable).name;
      if (!IDENTITY_TABLE_NAMES.has(foreignTableName)) continue;

      for (const column of reference.columns) {
        const isDirect = PURGE_DIRECT_IDENTITY_COLUMNS.some((name) => name === column.name);
        const isPolymorphic =
          column.name === 'owner_id' && columnNames.has('owner_type');
        if (isDirect || isPolymorphic) continue;
        findings.push(
          `${config.name}.${column.name} references ${foreignTableName} through an unsanctioned identity column`,
        );
      }
    }
  }
  return findings.sort();
}

/**
 * The gate's core assertion as a pure set difference, so it can be unit-tested for
 * the red path (an unclaimed user-data table must be returned) independent of the
 * live schema. Returns the flagged tables that are neither claimed nor retained.
 */
export function findUnclaimed(
  flagged: readonly string[],
  claimed: ReadonlySet<string>,
  retained: ReadonlySet<string>,
): string[] {
  return flagged.filter((name) => !claimed.has(name) && !retained.has(name));
}

/**
 * Data homes that hold user/character state but are NOT Neon tables, so the
 * schema-reflection gate cannot see them. Declared here so every home is accounted
 * for — the same discipline as a retained-table exemption: an explicit, audited
 * entry per home, never a silent omission. Each carries how it is torn down. The
 * gate test pins this list.
 */
export const NON_NEON_HOMES = [
  {
    home: 'convex:characterOnline',
    coveredBy:
      'explicit teardown via the online-status purge contributor (POST /purge-online → convex/onlineStatus.purgeForUser); lazy orphan-clean in convex/onlineStatus.applySyncResults is the backstop',
    explicitTeardown: 'src/data/online-status/purge.ts — shipped ACCOUNT.2',
    reason:
      'a Convex table is invisible to the schema-reflection gate, so this non-Neon home is accounted for here. Lazy orphan-clean alone cannot cover an account-nuke (no later sync re-enumerates a removed account), so the online-status contributor tears it down explicitly during runPurge.',
  },
  {
    home: 'convex:characterLocation',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocation.purgeForUser); engine orphan-clean in the location apply (OW3) is the backstop for linked-character drift',
    explicitTeardown: 'src/data/location-tracking/purge.ts — shipped 4.0.4.2.1',
    reason:
      'a Convex table is invisible to the schema-reflection gate, so this non-Neon home is accounted for here. Lazy orphan-clean alone cannot cover an account-nuke, so the location-tracking contributor tears it down explicitly during runPurge.',
  },
  {
    home: 'convex:characterLocationOnline',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocation.purgeForUser, which drains it beside characterLocation); the location apply orphan-cleans rows for unlinked characters as the backstop',
    explicitTeardown: 'src/data/location-tracking/purge.ts — same door as characterLocation',
    reason:
      'the location sync’s held online-probe state (is the pilot logged in, ETag, cache window) — its own unsubscribed table so per-probe expiry writes cannot invalidate mapTracking.forMap. User/character-keyed like characterLocation and torn down through the identical purge cascade.',
  },
  {
    home: 'convex:mapTracking',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocation.purgeForUser, which also deletes mapTracking); revocation and map teardown cascade inside convex/mapAccessProjection.reconcileMapClaims; the purge-map-access door additionally sweeps the user rows as an in-deployment backstop',
    explicitTeardown: 'src/data/location-tracking/purge.ts — shipped 4.0.4.2.1',
    reason:
      'a Convex table is invisible to the schema-reflection gate, so this non-Neon home is accounted for here. Access revocation and map deletion cascade-delete mapTracking inside the projection apply; account/character purge hits the same HTTP door as characterLocation.',
  },
  {
    home: 'convex:mapJumpBookkeeping',
    coveredBy:
      'full map teardown via POST /project-map-access drains bounded convex/mapJumpBookkeeping.purgeForMap batches; account/character purge (POST /purge-location-tracking → characterLocation.purgeForUser) drains the purged characterIds by_character; tracking revocation intentionally retains the stamps so untrack/retrack cannot double-count a jump',
    explicitTeardown: 'convex/mapJumpBookkeeping.ts — session 4.0.4.2.2 OW1',
    reason:
      'the table is (mapId, characterId)-keyed exactly-once state rather than account-owned payload: no userId column, and it survives tracking revocation by design so a retrack cannot double-count the odometer. Character identity leaves with the account/character purge drain; the map teardown door deletes the rest with the collaborative map whose jump history it protects.',
  },
] as const;
