import { is } from 'drizzle-orm';
import { getTableConfig, integer, PgTable, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/composition/drizzle-schema';
import {
  NON_NEON_HOMES,
  findIdentityFkLeaks,
  findUnclaimed,
  isUserDataTable,
} from '@/platform/purge/__tests__/coverage';
import { PURGE_CONTRIBUTORS } from './register-all';

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
        'esi_refresh_jobs',
        'esi_snapshots',
        'map_access',
        'maps',
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

  it('the location-tracking Convex homes are explicitly accounted for', () => {
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:characterLocation')).toBe(true);
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:characterLocationCovered')).toBe(true);
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:characterLocationOnline')).toBe(true);
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:characterLocationAccess')).toBe(true);
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:mapTracking')).toBe(true);
    expect(NON_NEON_HOMES.some((h) => h.home === 'convex:mapJumpBookkeeping')).toBe(true);
    expect(
      PURGE_CONTRIBUTORS.some((contributor) => contributor.name === 'location-tracking'),
    ).toBe(true);
  });

  it('findUnclaimed surfaces an unclaimed table and clears claimed/retained ones', () => {
    expect(findUnclaimed(['synthetic_unclaimed'], new Set(), new Set())).toEqual([
      'synthetic_unclaimed',
    ]);
    expect(findUnclaimed(['account'], new Set(['account']), new Set())).toEqual([]);
    expect(findUnclaimed(['corp_access_audit'], new Set(), new Set(['corp_access_audit']))).toEqual(
      [],
    );
  });

  it('finds a novel-named foreign key to an identity table', () => {
    const identityUser = pgTable('user', {
      id: text('id').primaryKey(),
    });
    const novelIdentityKey = pgTable('synthetic_novel_identity_key', {
      createdBy: text('created_by').references(() => identityUser.id),
    });

    expect(findIdentityFkLeaks([novelIdentityKey])).toEqual([
      'synthetic_novel_identity_key.created_by references user through an unsanctioned identity column',
    ]);
  });

  it('accepts sanctioned identity keys and ignores non-identity foreign keys', () => {
    const identityUser = pgTable('user', {
      id: text('id').primaryKey(),
    });
    const identityCharacters = pgTable('characters', {
      id: integer('id').primaryKey(),
    });
    const referenceTable = pgTable('synthetic_reference', {
      id: integer('id').primaryKey(),
    });
    const sanctioned = pgTable('synthetic_sanctioned_identity_keys', {
      userId: text('user_id').references(() => identityUser.id),
      characterId: integer('character_id').references(() => identityCharacters.id),
      ownerId: integer('owner_id').references(() => identityCharacters.id),
      ownerType: text('owner_type'),
      referenceId: integer('reference_id').references(() => referenceTable.id),
    });

    expect(findIdentityFkLeaks([sanctioned])).toEqual([]);
  });
});
