// THE PURGE GATE (ACCOUNT.1) — DB-free, fail-closed. Reflects the Drizzle schema
// with getTableConfig (pure metadata, no DB connection), finds every user/character/
// owner-keyed table, and asserts each is claimed by a purge contributor OR declared
// retained. A new user-data table that ships without a contributor fails this test.
//
// HOUSE RULE (tracked home; mirrored in CLAUDE.md): a personal / per-owner table
// MUST key on one of {user_id, character_id, owner_id+owner_type}. A bare owner_id
// is an SDE/reference owner (e.g. eve_npc_stations) and is NOT user data;
// corporation_id-only corp-shared tables are deliberately out-of-scope (a personal
// purge must not delete the shared corp catalogue). Keep the scan set in sync with
// this rule so a future novel identity column can't silently slip the gate.
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { NON_NEON_HOMES, findUnclaimed, isUserDataTable } from './coverage';
import { PURGE_CONTRIBUTORS } from './register-all';

// The schema barrel re-exports pgTable objects alongside enums + const arrays;
// narrow to PgTable so getTableConfig (which the gate's reflection needs) is sound.
const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable =>
  is(v, PgTable),
);
const tableName = (t: PgTable): string => getTableConfig(t).name;

const flagged = tables.filter(isUserDataTable).map(tableName);
const claimed = new Set(PURGE_CONTRIBUTORS.flatMap((c) => c.claims.map(tableName)));
const retained = new Set(
  PURGE_CONTRIBUTORS.flatMap((c) => (c.retained ?? []).map((r) => tableName(r.table))),
);

describe('purge registry gate', () => {
  it('flags the expected user/character/owner-keyed tables (sanity on the scan)', () => {
    // Catches a scan regression in either direction: a renamed identity column that
    // stops flagging a user-data table, or an SDE owner_id false-positive.
    expect([...flagged].sort()).toEqual(
      [
        'account',
        'character_industry_job_syncs',
        'character_industry_jobs',
        'character_skill_syncs',
        'character_skills',
        'characters',
        'corp_access_audit',
        'corp_industry_job_syncs',
        'corp_industry_jobs',
        'custom_structures',
        'esi_snapshots',
        'owned_asset_syncs',
        'owned_assets',
        'owned_blueprint_syncs',
        'owned_blueprints',
        'saved_plans',
        'session',
        'usage_logs',
        'user_preferences',
      ].sort(),
    );
  });

  it('every user/character/owner-keyed table is claimed or declared-retained', () => {
    const unclaimed = findUnclaimed(flagged, claimed, retained);
    expect(
      unclaimed,
      `Unclaimed user-data table(s): ${unclaimed.join(', ')}. Declare a purge contributor ` +
        `in the owning slice (claim the table), or a retained entry with a reason.`,
    ).toEqual([]);
  });

  it('no contributor claims/retains a table that is not user-data (no stale claims)', () => {
    const flaggedSet = new Set(flagged);
    const stale = [...claimed, ...retained].filter((n) => !flaggedSet.has(n));
    expect(stale, `Stale claim(s) on non-user-data tables: ${stale.join(', ')}`).toEqual([]);
  });

  it('corp_access_audit is declared-retained (the FK-less authz trail outlives the user)', () => {
    expect(retained.has('corp_access_audit')).toBe(true);
  });

  it('the deferred Convex characterOnline home is explicitly accounted for', () => {
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:characterOnline')).toBe(true);
  });

  // The gate's red path, proven on a synthetic schema so it stands independent of
  // the live tables: an unclaimed user-data table MUST surface; claimed/retained
  // tables MUST NOT.
  it('findUnclaimed surfaces an unclaimed table and clears claimed/retained ones', () => {
    expect(findUnclaimed(['synthetic_unclaimed'], new Set(), new Set())).toEqual([
      'synthetic_unclaimed',
    ]);
    expect(findUnclaimed(['account'], new Set(['account']), new Set())).toEqual([]);
    expect(findUnclaimed(['corp_access_audit'], new Set(), new Set(['corp_access_audit']))).toEqual(
      [],
    );
  });
});
