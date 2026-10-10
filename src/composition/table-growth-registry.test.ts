import { getTableConfig, integer, pgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { PURGE_CONTRIBUTORS } from '@/composition/purge/register-all';
import {
  reflectedSchemaTables,
  registryCoverageDiff,
} from '@/db/__tests__/support/schema-reflection';
import { tableGrowthKey } from './__tests__/table-growth-census';
import {
  DRIZZLE_MIGRATIONS_TABLE,
  TABLE_GROWTH_STORIES,
} from './__tests__/table-growth-registry';

function missingMessage(missing: readonly string[]): string {
  return `Undeclared table(s): ${missing.join(', ')}. Add a pruned, bounded, purge-managed, or retained growth story.`;
}

const tables = await reflectedSchemaTables();
const expectedKeys = [...tables.map(tableGrowthKey), tableGrowthKey(DRIZZLE_MIGRATIONS_TABLE)];
const declarationKeys = TABLE_GROWTH_STORIES.map((story) => tableGrowthKey(story.table));

describe('table growth-story gate', () => {
  it('declares every schema table and Drizzle bookkeeping exactly once', () => {
    const diff = registryCoverageDiff(expectedKeys, declarationKeys);
    expect(diff.missing, missingMessage(diff.missing)).toEqual([]);
    expect(diff.stale, `Stale declaration(s): ${diff.stale.join(', ')}`).toEqual([]);
    expect(diff.duplicate, `Duplicate declaration(s): ${diff.duplicate.join(', ')}`).toEqual([]);
  });

  it('requires complete metadata for each declaration kind', () => {
    for (const story of TABLE_GROWTH_STORIES) {
      if (story.kind === 'pruned') {
        expect(story.retentionDays, tableGrowthKey(story.table)).toBeGreaterThan(0);
        expect(story.retentionConstant, tableGrowthKey(story.table)).not.toBe('');
        expect(story.prunedBy, tableGrowthKey(story.table)).not.toBe('');
      } else if (story.kind === 'bounded') {
        expect(story.reason, tableGrowthKey(story.table)).not.toBe('');
      } else if (story.kind === 'retained') {
        expect(story.reason, tableGrowthKey(story.table)).not.toBe('');
        expect(story.authority, tableGrowthKey(story.table)).not.toBe('');
      }
    }
  });

  it('resolves purge-managed declarations to real purge claims', () => {
    const contributors = new Map(PURGE_CONTRIBUTORS.map((contributor) => [contributor.name, contributor]));
    for (const story of TABLE_GROWTH_STORIES) {
      const contributorName =
        story.kind === 'purge-managed'
          ? story.purgeContributor
          : story.kind === 'pruned' && 'alsoPurgeManagedBy' in story
            ? story.alsoPurgeManagedBy
            : undefined;
      if (contributorName === undefined) continue;

      const contributor = contributors.get(contributorName);
      expect(contributor, `Unknown purge contributor: ${contributorName}`).toBeDefined();
      const claims = new Set(contributor?.claims.map((table) => getTableConfig(table).name));
      expect(
        claims.has(tableGrowthKey(story.table)),
        `${contributorName} does not claim ${tableGrowthKey(story.table)}`,
      ).toBe(true);
    }
  });

  it('names a newly discovered undeclared table in the failure', () => {
    const syntheticUndeclared = pgTable('synthetic_undeclared', {
      id: integer('id').primaryKey(),
    });
    const diff = registryCoverageDiff(
      [...expectedKeys, tableGrowthKey(syntheticUndeclared)],
      declarationKeys,
    );
    expect(diff.missing).toEqual(['synthetic_undeclared']);
    expect(missingMessage(diff.missing)).toContain('synthetic_undeclared');
  });
});
