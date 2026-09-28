import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { is } from 'drizzle-orm';
import {
  getTableConfig,
  integer,
  PgTable,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/composition/drizzle-schema';
import { convexUserKeyedTables } from '@/platform/purge/__tests__/convex-user-homes';
import {
  NON_NEON_HOMES,
  findIdentityFkLeaks,
  findMergeRuleGaps,
  findUnclaimed,
  isUserDataTable,
} from '@/platform/purge/__tests__/coverage';
import type { TableMergeRule } from '@/platform/purge/types';
import { PURGE_CONTRIBUTORS } from './register-all';

const CONVEX_SCHEMA_PATH = join(process.cwd(), 'convex', 'schema.ts');

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
        'character_sheets',
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
        'net_worth_days',
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

  it('every claimed or retained table has exactly one schema-consistent merge rule', () => {
    expect(findMergeRuleGaps(PURGE_CONTRIBUTORS)).toEqual([]);
  });

  it('goes red when a real contributor drops its merge rule', () => {
    const withoutPreferences = PURGE_CONTRIBUTORS.map((contributor) =>
      contributor.name === 'preferences' ? { ...contributor, merge: [] } : contributor,
    );
    expect(findMergeRuleGaps(withoutPreferences)).toEqual(['user_preferences: no merge rule']);
  });

  it('flags missing, duplicated, stale, and schema-inconsistent merge rules', () => {
    const owner = pgTable('user', { id: text('id').primaryKey() });
    const orphan = pgTable('synthetic_orphan', { userId: text('user_id').references(() => owner.id) });
    const twice = pgTable('synthetic_twice', { userId: text('user_id') });
    const characterKeyed = pgTable('synthetic_character_keyed', {
      characterId: integer('character_id').primaryKey(),
    });
    const userKeyed = pgTable('synthetic_user_keyed', { userId: text('user_id') });
    const perUserUnique = pgTable(
      'synthetic_per_user_unique',
      { userId: text('user_id'), key: text('key'), day: text('day') },
      (t) => [primaryKey({ columns: [t.userId, t.key] }), uniqueIndex('synthetic_day').on(t.day)],
    );
    const unclaimed = pgTable('synthetic_unclaimed', { userId: text('user_id') });
    const rules: TableMergeRule[] = [
      { table: twice, rule: 'rekey' },
      { table: twice, rule: 'discard', reason: 'twice' },
      { table: characterKeyed, rule: 'rekey' },
      { table: userKeyed, rule: 'follows-character' },
      { table: perUserUnique, rule: 'rekey' },
      { table: perUserUnique, rule: 'survivor-wins', key: [perUserUnique.day] },
      { table: unclaimed, rule: 'rekey' },
    ];
    expect(
      findMergeRuleGaps([
        { claims: [orphan, twice, characterKeyed, userKeyed, perUserUnique], merge: rules },
      ]),
    ).toEqual([
      "synthetic_character_keyed: 'rekey' needs a user_id column",
      'synthetic_orphan: no merge rule',
      "synthetic_per_user_unique: 'rekey' would collide on the unique key (user_id, key)",
      "synthetic_per_user_unique: 'survivor-wins' key (day, user_id) is not a declared primary key or unique constraint",
      'synthetic_per_user_unique: 2 merge rules',
      'synthetic_twice: 2 merge rules',
      'synthetic_unclaimed: merge rule on a table no contributor claims or retains',
      "synthetic_user_keyed: 'follows-character' on a table with a user_id column",
    ]);
    expect(
      findMergeRuleGaps([
        {
          claims: [perUserUnique, characterKeyed],
          merge: [
            { table: perUserUnique, rule: 'survivor-wins', key: [perUserUnique.key] },
            { table: characterKeyed, rule: 'follows-character' },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('every Convex table with a userId field is a declared non-Neon home with a merge statement', () => {
    const userKeyed = convexUserKeyedTables(readFileSync(CONVEX_SCHEMA_PATH, 'utf8'));
    expect(userKeyed).toEqual([
      'characterLocation',
      'characterLocationAccess',
      'characterLocationCovered',
      'characterLocationOnline',
      'characterOnline',
      'mapAccess',
      'mapTracking',
      'syncPresence',
      'syncSubjects',
    ]);
    const homes = new Map(NON_NEON_HOMES.map((home) => [home.home, home.merge]));
    const missing = userKeyed.filter((name) => !homes.has(`convex:${name}`));
    expect(missing, `Convex table(s) without a NON_NEON_HOMES entry: ${missing.join(', ')}`).toEqual([]);
    expect(homes.get('convex:mapTracking')).toContain('BEFORE reprojection');
  });

  it('the Convex census reads defineTable fields and ignores tables without userId', () => {
    expect(
      convexUserKeyedTables(`
        export default defineSchema({
          withUser: defineTable({ mapId: v.string(), userId: v.string() }).index('by_user', ['userId']),
          withoutUser: defineTable({ mapId: v.string(), characterId: v.number() }),
        });
      `),
    ).toEqual(['withUser']);
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
