import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { emitIndustryRules, type IndustryRules } from './industry-rules';
import { industryTargetFilters } from './schema';

const schema = 'test_industry_rules_permissions';
const tables = [
  'industry_target_filters',
  'industry_modifiers',
  'industry_assembly_lines',
  'industry_installation_types',
] as const;

const harness = await createDbTestHarness({ schema, tables });

const rules: IndustryRules = {
  filters: [{ id: 4, name: 'Charges', categoryIds: [8], groupIds: [] }],
  modifiers: [{
    sourceTypeId: 37159,
    activity: 'manufacturing',
    kind: 'material',
    attributeId: 2540,
    filterId: 4,
    factorHigh: 0.976,
    factorLow: 0.9544,
    factorNull: 0.9496,
  }],
  assemblyLines: [{ id: 1, name: 'Manufacturing', activityId: 1, categoryIds: [8], groupIds: [], typeListIds: [] }],
  installationTypes: [{ typeId: 35825, assemblyLineIds: [1] }],
};

describe.skipIf(!harness.reachable)('industry rules runtime permissions', () => {
  it('grants TRUNCATE to each regenerable industry table and keeps account protected', async () => {
    for (const table of tables) {
      const [privilege] = await harness.sql<{ allowed: boolean }[]>`
        SELECT has_table_privilege('lgi_runtime', ${`public.${table}`}, 'TRUNCATE') AS allowed
      `;
      expect(privilege?.allowed, table).toBe(true);
    }
    const [accountPrivilege] = await harness.sql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('lgi_runtime', 'public.account', 'TRUNCATE') AS allowed
    `;
    expect(accountPrivilege?.allowed).toBe(false);
    await expect(harness.sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE lgi_runtime`;
      await tx`TRUNCATE TABLE public.account`;
    })).rejects.toMatchObject({ code: '42501' });
  });

  it('replaces industry rules as the runtime role inside the disposable schema', async () => {
    await harness.sql.unsafe(`GRANT USAGE ON SCHEMA "${schema}" TO lgi_runtime`);
    for (const table of tables) {
      await harness.sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON "${schema}"."${table}" TO lgi_runtime`);
    }
    await harness.db.insert(industryTargetFilters).values({
      id: 99, name: 'Old dataset', categoryIds: [], groupIds: [],
    });
    const summary = await harness.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE lgi_runtime`);
      return emitIndustryRules(tx, rules);
    });
    expect(summary).toEqual({
      targetFiltersWritten: 1,
      modifiersWritten: 1,
      assemblyLinesWritten: 1,
      installationTypesWritten: 1,
    });
    expect(await harness.db.select().from(industryTargetFilters)).toEqual(rules.filters);
  });
});
