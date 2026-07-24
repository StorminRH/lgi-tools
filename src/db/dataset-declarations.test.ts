// DATASET DECLARATION INDEX — Keep was selected over Combine. Combining would
// leave all three registry vocabularies in place and add a manifest plus its
// applicability matrix (5 concepts, none removed); the three consumers would
// each read only one section (P8). Keeping the 3 existing concepts preserves
// their separate privacy, retention, and placement owners while this test
// provides the one-stop checklist: sanctioned key shape -> purge claim/retain
// -> growth story -> ESI entry or infrastructure claim when externally fed.
// The membership overlap with sibling gates is deliberate: those gates own
// registry semantics, while this index owns the complete new-dataset checklist.
import {
  getTableConfig,
  integer,
  pgTable,
  text,
  timestamp,
  type PgTable,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  ESI_INFRASTRUCTURE_TABLES,
  isEsiMirrorTable,
} from '@/esi-datasets/checks';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import {
  findIdentityFkLeaks,
  isUserDataTable,
} from '@/platform/purge/coverage';
import { PURGE_CONTRIBUTORS } from '@/composition/purge/register-all';
import {
  TABLE_GROWTH_STORIES,
  tableGrowthKey,
} from './table-growth-registry';
import { reflectedSchemaTables } from './test-support/schema-reflection';

const GROWTH_DECLARATION =
  'growth story -> src/db/table-growth-registry.ts';
const PURGE_DECLARATION =
  'purge claim or retained entry -> the owning slice purge.ts';
const ESI_DECLARATION =
  'ESI mirror or infrastructure claim -> src/lib/esi-datasets/entries.ts or src/esi-datasets/checks.ts';

type DatasetDeclarationIndex = {
  growth: ReadonlySet<string>;
  purge: ReadonlySet<string>;
  esi: ReadonlySet<string>;
};

function tableName(table: PgTable): string {
  return getTableConfig(table).name;
}

function missingDeclarations(
  table: PgTable,
  declarations: DatasetDeclarationIndex,
): string[] {
  const name = tableName(table);
  const missing: string[] = [];
  if (!declarations.growth.has(name)) missing.push(GROWTH_DECLARATION);
  if (isUserDataTable(table) && !declarations.purge.has(name)) {
    missing.push(PURGE_DECLARATION);
  }
  if (isEsiMirrorTable(table) && !declarations.esi.has(name)) {
    missing.push(ESI_DECLARATION);
  }
  return missing;
}

function checklistFindings(
  tables: readonly PgTable[],
  declarations: DatasetDeclarationIndex,
): string[] {
  return tables.flatMap((table) => {
    const missing = missingDeclarations(table, declarations);
    if (missing.length === 0) return [];
    return [
      `${tableName(table)} is missing:\n${missing.map((item) => `- ${item}`).join('\n')}`,
    ];
  });
}

const tables = await reflectedSchemaTables();
const liveDeclarations: DatasetDeclarationIndex = {
  growth: new Set(
    TABLE_GROWTH_STORIES.map((story) => tableGrowthKey(story.table)),
  ),
  purge: new Set(
    PURGE_CONTRIBUTORS.flatMap((contributor) => [
      ...contributor.claims.map(tableName),
      ...(contributor.retained ?? []).map((entry) => tableName(entry.table)),
    ]),
  ),
  esi: new Set([
    ...ESI_DATASET_ENTRIES.flatMap((entry) => entry.mirrorTables),
    ...ESI_INFRASTRUCTURE_TABLES.map((entry) => entry.table),
  ]),
};

describe('dataset declaration index', () => {
  it('keeps every identity-table foreign key inside the sanctioned key shapes', () => {
    const findings = findIdentityFkLeaks(tables);
    expect(
      findings,
      `Unsanctioned identity foreign key(s): ${findings.join(', ')}`,
    ).toEqual([]);
  });

  it('declares every applicable dataset concern in its owning registry', () => {
    const findings = checklistFindings(tables, liveDeclarations);
    expect(findings, findings.join('\n\n')).toEqual([]);
  });

  it('names every missing declaration for one seeded dataset in one finding', () => {
    const undeclaredDataset = pgTable('synthetic_undeclared_dataset', {
      id: integer('id').primaryKey(),
      userId: text('user_id'),
      fetchedAt: timestamp('fetched_at'),
    });
    const findings = checklistFindings([undeclaredDataset], {
      growth: new Set(),
      purge: new Set(),
      esi: new Set(),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(GROWTH_DECLARATION);
    expect(findings[0]).toContain(PURGE_DECLARATION);
    expect(findings[0]).toContain(ESI_DECLARATION);
  });

  it('rejects a seeded novel identity foreign-key name', () => {
    const identityUser = pgTable('user', {
      id: text('id').primaryKey(),
    });
    const undeclaredIdentityKey = pgTable('synthetic_identity_leak', {
      createdBy: text('created_by').references(() => identityUser.id),
    });

    expect(findIdentityFkLeaks([undeclaredIdentityKey])).toEqual([
      'synthetic_identity_leak.created_by references user through an unsanctioned identity column',
    ]);
  });
});
