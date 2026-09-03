import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

const PURGE_DIRECT_IDENTITY_COLUMNS = ['user_id', 'character_id'] as const;

const IDENTITY_TABLE_NAMES = new Set(['user', 'characters']);

export function isUserDataTable(table: PgTable): boolean {
  const columns = getTableConfig(table).columns.map((c) => c.name);
  if (PURGE_DIRECT_IDENTITY_COLUMNS.some((id) => columns.includes(id))) return true;
  return columns.includes('owner_id') && columns.includes('owner_type');
}

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

export function findUnclaimed(
  flagged: readonly string[],
  claimed: ReadonlySet<string>,
  retained: ReadonlySet<string>,
): string[] {
  return flagged.filter((name) => !claimed.has(name) && !retained.has(name));
}

export const NON_NEON_HOMES = [
  {
    home: 'convex:characterOnline',
    coveredBy:
      'explicit teardown via the online-status purge contributor (POST /purge-online → convex/onlineStatus.purgeForUser); the retired dataset has no syncer, so the sweep drain GC (convex/onlineStatus.drainCharacterOnline via engine Pass D) empties the rest ahead of the wipe deploy',
    explicitTeardown: 'src/data/online-status/purge.ts — shipped ACCOUNT.2; table dropped at the wipe deploy',
    reason:
      'a Convex table is invisible to the schema-reflection gate, so this non-Neon home is accounted for here. The dataset is retired: nothing writes the table anymore, and both teardown paths live in its keeper module until the wipe removes home and table together.',
  },
  {
    home: 'convex:characterLocation',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocationPurge.purgeForUser); identity hooks (unlink / reassign / user-delete) hit the same door so Convex is not polled for roster drift',
    explicitTeardown: 'src/data/location-tracking/purge.ts — shipped 4.0.4.2.1',
    reason:
      'a Convex table is invisible to the schema-reflection gate, so this non-Neon home is accounted for here. Apply no longer orphan-cleans against a Neon enum; identity teardown and account purge are the only deletes.',
  },
  {
    home: 'convex:characterLocationCovered',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocationPurge.purgeForUser, which drains it beside characterLocation); identity hooks hit the same door',
    explicitTeardown: 'src/data/location-tracking/purge.ts — same door as characterLocation',
    reason:
      'flip-only present+online rows the map pin reads. Written only when coverage changes, never on location or probe expiry. User/character-keyed like characterLocation and torn down through the identical purge cascade.',
  },
  {
    home: 'convex:characterLocationOnline',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocationPurge.purgeForUser, which drains it beside characterLocation); identity hooks hit the same door',
    explicitTeardown: 'src/data/location-tracking/purge.ts — same door as characterLocation',
    reason:
      'the location sync’s held online-probe state (is the pilot logged in, ETag, cache window) — its own unsubscribed table so per-probe expiry writes cannot invalidate mapTrackingLive.forMap. User/character-keyed like characterLocation and torn down through the identical purge cascade.',
  },
  {
    home: 'convex:characterLocationAccess',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocationPurge.purgeForUser, which drains access leases beside location and tracking); identity hooks hit the same door',
    explicitTeardown: 'src/data/location-tracking/purge.ts — same door as characterLocation',
    reason:
      'short-lived EVE access-token lease for the location sync. Unsubscribed — public queries never read it. Refresh tokens stay Neon-only. Torn down with the character so an unlink cannot leave a usable ESI token in Convex.',
  },
  {
    home: 'convex:mapTracking',
    coveredBy:
      'explicit teardown via the location-tracking purge contributor (POST /purge-location-tracking → convex/characterLocationPurge.purgeForUser, which also deletes mapTracking); revocation and map teardown cascade inside convex/mapAccessProjection.reconcileMapClaims; the purge-map-access door additionally sweeps the user rows as an in-deployment backstop',
    explicitTeardown: 'src/data/location-tracking/purge.ts — shipped 4.0.4.2.1',
    reason:
      'a Convex table is invisible to the schema-reflection gate, so this non-Neon home is accounted for here. Access revocation and map deletion cascade-delete mapTracking inside the projection apply; account/character purge hits the same HTTP door as characterLocation.',
  },
  {
    home: 'convex:mapJumpBookkeeping',
    coveredBy:
      'full map teardown via POST /project-map-access drains bounded convex/mapJumpBookkeeping.purgeForMap batches; account/character purge (POST /purge-location-tracking → characterLocationPurge.purgeForUser) drains the purged characterIds by_character; tracking revocation intentionally retains the stamps so untrack/retrack cannot double-count a jump',
    explicitTeardown: 'convex/mapJumpBookkeeping.ts — session 4.0.4.2.2 OW1',
    reason:
      'the table is (mapId, characterId)-keyed exactly-once state rather than account-owned payload: no userId column, and it survives tracking revocation by design so a retrack cannot double-count the odometer. Character identity leaves with the account/character purge drain; the map teardown door deletes the rest with the collaborative map whose jump history it protects.',
  },
] as const;
