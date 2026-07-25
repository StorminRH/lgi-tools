import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  DATA_CLASS_DECISIONS,
  describeDbInvariants,
  sliceOfPath,
} from './data-ownership-registry';
import { user } from '@/db/auth-schema';
import { esiRefreshJobs } from '@/data/esi-refresh-jobs/schema';
import { ownedAssets } from '@/features/owned-assets/schema';

describe('sliceOfPath', () => {
  it('derives the slice from the two zoned path segments', () => {
    expect(sliceOfPath('src/features/owned-assets/queries.ts')).toBe('features/owned-assets');
    expect(sliceOfPath('src/data/market-prices/ingest.ts')).toBe('data/market-prices');
    expect(sliceOfPath('src/composition/pipelines/sde-pipeline.ts')).toBe('composition/pipelines');
    expect(sliceOfPath('src/platform/auth/admin-users.ts')).toBe('platform/auth');
  });

  it('aliases the shared auth schema to its semantic owner', () => {
    expect(sliceOfPath('src/db/auth-schema.ts')).toBe('platform/auth');
  });

  it('falls back to the bare root outside the zoned roots', () => {
    expect(sliceOfPath('src/lib/db-columns.ts')).toBe('lib');
    expect(sliceOfPath('src/app/api/sites/route.ts')).toBe('app');
  });

  it('normalizes leading and separator forms so a scan path matches an authored slice', () => {
    expect(sliceOfPath('./src/features/skill-queue/queries.ts')).toBe('features/skill-queue');
    expect(sliceOfPath('src\\features\\skill-queue\\queries.ts')).toBe('features/skill-queue');
  });
});

describe('describeDbInvariants', () => {
  it('reports a column-level primary key that never reaches primaryKeys', () => {
    expect(describeDbInvariants(ownedAssets)).toContain('pk(id)');
  });

  it('reports a column-level unique flag that never reaches uniqueConstraints', () => {
    expect(describeDbInvariants(user)).toContain('unique(email)');
  });

  it('renders a partial unique index with its normalized predicate', () => {
    expect(describeDbInvariants(esiRefreshJobs)).toContain(
      'partial-unique(idempotency_key) where("status" in (\'queued\', \'running\', \'deferred_for_budget\', \'failed_retryable\'))',
    );
  });

  it('renders a foreign key as a column-to-target pair', () => {
    expect(describeDbInvariants(ownedAssets)).toContain('fk(snapshot_id→esi_snapshots.id)');
  });

  // No live table declares a CHECK, a table-level unique(), or a composite
  // primary key through `primaryKey({...})` alongside these forms, so a synthetic
  // table is the only way to prove those metadata kinds are reported. They matter:
  // a kind this function silently ignored would pass the census's two-way diff
  // while a real database-enforced invariant went undeclared.
  it('reports check constraints, table-level unique constraints, and composite keys', () => {
    const synthetic = pgTable(
      'synthetic_invariants',
      {
        left: integer('left').notNull(),
        right: integer('right').notNull(),
        label: text('label').notNull(),
        amount: integer('amount').notNull(),
      },
      (t) => [
        primaryKey({ columns: [t.left, t.right] }),
        unique('synthetic_label_unique').on(t.label, t.amount),
        check('synthetic_amount_positive', sql`${t.amount} > 0`),
      ],
    );

    expect(describeDbInvariants(synthetic)).toEqual([
      'check(synthetic_amount_positive)',
      'pk(left,right)',
      'unique(label,amount)',
    ]);
  });
});

describe('DATA_CLASS_DECISIONS', () => {
  it('records application-authorization-only for every class while no database identity exists', () => {
    for (const [dataClass, decision] of Object.entries(DATA_CLASS_DECISIONS)) {
      expect(decision.decision, dataClass).toBe('application-authorization-only');
      expect(decision.justification.length, dataClass).toBeGreaterThan(0);
      expect(decision.reviewTrigger.length, dataClass).toBeGreaterThan(0);
    }
  });
});
