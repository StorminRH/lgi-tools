// DATASET DECLARATION INDEX — Keep was selected over Combine. Combining would
// leave all three registry vocabularies in place and add a manifest plus its
// applicability matrix (5 concepts, none removed); the three consumers would
// each read only one section (P8). Keeping the 3 existing concepts preserves
// their separate privacy, retention, and placement owners while this test
// provides the one-stop checklist: sanctioned key shape -> purge claim/retain
// -> growth story -> ESI entry or infrastructure claim when externally fed.
// The membership overlap with sibling gates is deliberate: those gates own
// registry semantics, while this index owns the complete new-dataset checklist.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
} from '@/esi-datasets/__tests__/checks';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import {
  findIdentityFkLeaks,
  isUserDataTable,
} from '@/platform/purge/__tests__/coverage';
import { PURGE_CONTRIBUTORS } from '@/composition/purge/register-all';
import { tableGrowthKey } from '@/composition/__tests__/table-growth-census';
import { TABLE_GROWTH_STORIES } from '@/composition/__tests__/table-growth-registry';
import { describeDbInvariants } from '@/composition/__tests__/data-ownership-census';
import {
  DATA_CLASS_DECISIONS,
  DATA_OWNERSHIP,
} from '@/composition/__tests__/data-ownership-registry';
import {
  findUndeclaredCrossOwnerWrites,
  scanProductionWriteSites,
} from '@/esi-datasets/__tests__/write-sites';
import {
  reflectedSchemaExports,
  reflectedSchemaTables,
} from '@/db/__tests__/support/schema-reflection';

const GROWTH_DECLARATION =
  'growth story -> src/composition/__tests__/table-growth-registry.ts';
  const PURGE_DECLARATION =
  'purge claim or retained entry -> the owning slice purge.ts';
  const ESI_DECLARATION =
  'ESI mirror or infrastructure claim -> src/lib/esi-datasets/entries.ts or src/esi-datasets/__tests__/checks.ts';

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

  it('declares every SDE-derived client asset and its live route file', () => {
    const sde = ESI_DATASET_ENTRIES.find((entry) => entry.name === 'sde');
    expect(sde).toBeDefined();
    const assets = sde?.derivedClientAssets ?? [];
    const expectedRoutes = new Map([
      [
        'universe-system-directory',
        '/api/universe/assets/[version]/systems',
      ],
      [
        'universe-adjacency-graph',
        '/api/universe/assets/[version]/adjacency',
      ],
      ['wormhole-codex', '/api/universe/assets/[version]/wormholes'],
    ]);
    expect(assets.map((asset) => asset.name).sort()).toEqual([
      'universe-adjacency-graph',
      'universe-system-directory',
      'wormhole-codex',
    ]);
    for (const asset of assets) {
      expect(asset).toEqual({
        name: asset.name,
        route: expectedRoutes.get(asset.name),
        placement: 'versioned-immutable-route',
        refresh: 'sde-refresh-cron-tag-bust',
      });
      expect(
        existsSync(`src/app${asset.route}/route.ts`),
        `${asset.name} route file is missing`,
      ).toBe(true);
    }
  });
});

const OWNERSHIP_DECLARATION =
  'ownership, read contract, invariants, boundary, and data class -> src/composition/__tests__/data-ownership-registry.ts';

const declaredOwnership = new Map(
  DATA_OWNERSHIP.map((entry) => [tableName(entry.table), entry] as const),
);

describe('data ownership registry', () => {
  it('declares exactly the reflected table set, with no missing, stale, or duplicate entry', () => {
    const reflected = tables.map(tableName).sort();
    const declared = DATA_OWNERSHIP.map((entry) => tableName(entry.table)).sort();
    const duplicates = declared.filter((name, index) => declared.indexOf(name) !== index);
    const missing = reflected.filter((name) => !declaredOwnership.has(name));
    const stale = declared.filter((name) => !reflected.includes(name));

    expect(duplicates, `Duplicate ownership entries: ${duplicates.join(', ')}`).toEqual([]);
    expect(
      missing,
      `Table(s) missing a declaration:\n${missing.map((name) => `- ${name} needs ${OWNERSHIP_DECLARATION}`).join('\n')}`,
    ).toEqual([]);
    expect(stale, `Ownership entries for tables that no longer exist: ${stale.join(', ')}`).toEqual(
      [],
    );
  });

  it('matches every declared invariant against live schema metadata in both directions', () => {
    const findings = tables.flatMap((table) => {
      const entry = declaredOwnership.get(tableName(table));
      if (entry === undefined) return [];
      const live: string[] = describeDbInvariants(table);
      const declared: string[] = [...entry.invariants].sort();
      const missing = live.filter((invariant) => !declared.includes(invariant));
      const stale = declared.filter((invariant) => !live.includes(invariant));
      if (missing.length === 0 && stale.length === 0) return [];
      return [
        `${tableName(table)}: undeclared in the registry [${missing.join(', ')}]; declared but absent from the schema [${stale.join(', ')}]`,
      ];
    });

    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('carries a non-empty boundary note, read contract, and known data class on every entry', () => {
    const findings = DATA_OWNERSHIP.flatMap((entry) => {
      const name = tableName(entry.table);
      const problems: string[] = [];
      if (entry.boundary.note.trim() === '') problems.push('an empty transaction-boundary note');
      if (entry.reads !== 'open' && !Array.isArray(entry.reads)) {
        problems.push('no cross-owner read contract');
      }
      if (!(entry.dataClass in DATA_CLASS_DECISIONS)) {
        problems.push(`the unknown data class ${entry.dataClass}`);
      }
      return problems.length === 0 ? [] : [`${name} has ${problems.join(' and ')}`];
    });

    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('records an authorization decision for every data class in use', () => {
    const used = new Set(DATA_OWNERSHIP.map((entry) => entry.dataClass));
    const undecided = [...used].filter((dataClass) => !(dataClass in DATA_CLASS_DECISIONS));
    const unused = Object.keys(DATA_CLASS_DECISIONS).filter(
      (dataClass) => !used.has(dataClass as (typeof DATA_OWNERSHIP)[number]['dataClass']),
    );

    expect(undecided, `Data class(es) without a decision: ${undecided.join(', ')}`).toEqual([]);
    expect(unused, `Data class(es) declared but unused: ${unused.join(', ')}`).toEqual([]);
  });
});

describe('row-level security absence', () => {
  it('enables row-level security on no reflected table', () => {
    const enabled = tables.filter((table) => {
      const config = getTableConfig(table);
      return config.enableRLS || config.policies.length > 0;
    });

    expect(
      enabled.map(tableName),
      'Row-level security is enabled in the schema, but every data class records application-authorization-only.',
    ).toEqual([]);
  });

  it('creates no policy in any committed migration', () => {
    const offenders = readdirSync('drizzle')
      .filter((file) => file.endsWith('.sql'))
      .filter((file) =>
        /create\s+policy|row\s+level\s+security/i.test(readFileSync(`drizzle/${file}`, 'utf8')),
      );

    expect(offenders, `Migration(s) introducing row-level security: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('keeps the recorded decision application-authorization-only while no policy exists', () => {
    const withRls = Object.entries(DATA_CLASS_DECISIONS).filter(
      ([, decision]) => decision.decision === 'application-plus-rls',
    );

    expect(
      withRls.map(([dataClass]) => dataClass),
      'A data class claims application-plus-rls, but no migration creates a policy for it to rely on.',
    ).toEqual([]);
  });
});

// The four cross-owner writes that exist today, pinned by file and table. Without
// this positive assertion a scanner that silently stopped resolving symbols would
// report zero undeclared writes and pass.
const KNOWN_CROSS_OWNER_WRITES = [
  'src/composition/account-lifecycle/account-purge.ts::user',
  'src/composition/account-lifecycle/owner-transfer.ts::account',
  'src/composition/pipelines/esi-snapshot-retention.ts::esi_snapshots',
  'src/composition/pipelines/sde-pipeline.ts::market_prices',
];
// A floor, not a target: the live scan finds 81 sites, so a collapse to a handful
// fails here even when nothing is undeclared.
const MINIMUM_DETECTED_WRITE_SITES = 70;

const sites = scanProductionWriteSites('src', await reflectedSchemaExports());

describe('cross-owner writes', () => {
  it('attributes every known cross-owner write and keeps finding the bulk of the write sites', () => {
    const keys = new Set(sites.map((site) => `${site.file}::${site.table}`));
    const undetected = KNOWN_CROSS_OWNER_WRITES.filter((key) => !keys.has(key));

    expect(
      undetected,
      `The scanner no longer detects known write site(s): ${undetected.join(', ')}. Fix the scanner rather than the expectation.`,
    ).toEqual([]);
    expect(sites.length).toBeGreaterThanOrEqual(MINIMUM_DETECTED_WRITE_SITES);
  });

  it('sanctions every production write through an ownership declaration', () => {
    const findings = findUndeclaredCrossOwnerWrites(sites, DATA_OWNERSHIP);

    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('fails a seeded undeclared cross-owner write, naming the file, table, and declaration', () => {
    const seeded = {
      file: 'src/features/industry-planner/census-probe.ts',
      slice: 'features/industry-planner',
      table: 'market_prices',
    };

    const findings = findUndeclaredCrossOwnerWrites([seeded], DATA_OWNERSHIP);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(seeded.file);
    expect(findings[0]).toContain('market_prices');
    expect(findings[0]).toContain('data/market-prices');
    expect(findings[0]).toContain('src/composition/__tests__/data-ownership-registry.ts');
  });
});
