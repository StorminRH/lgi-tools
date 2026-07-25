import { pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  buildSymbolTable,
  findUndeclaredCrossOwnerWrites,
  findWrittenTables,
  resolveImportPath,
  type WriteSite,
} from './write-sites';
import type { DataOwnershipEntry } from '@/composition/data-ownership-registry';

const ownedAssetsTable = pgTable('owned_assets', { id: text('id').primaryKey() });
const marketPricesTable = pgTable('market_prices', { id: text('id').primaryKey() });

const EXPORTS = new Map([
  ['src/features/owned-assets/schema.ts', new Map([['ownedAssets', 'owned_assets']])],
  ['src/data/market-prices/schema.ts', new Map([['marketPrices', 'market_prices']])],
  [
    'src/composition/drizzle-schema.ts',
    new Map([
      ['ownedAssets', 'owned_assets'],
      ['marketPrices', 'market_prices'],
    ]),
  ],
]);

const CALLER = 'src/features/owned-assets/queries.ts';

const REGISTRY: DataOwnershipEntry[] = [
  {
    table: ownedAssetsTable,
    owner: 'features/owned-assets',
    reads: [],
    invariants: [],
    boundary: { kind: 'ordered-sequence', note: 'replace-all' },
    dataClass: 'personal',
  },
  {
    table: marketPricesTable,
    owner: 'data/market-prices',
    reads: 'open',
    writers: [{ by: 'composition/pipelines', reason: 'seeds a baseline price row' }],
    invariants: [],
    boundary: { kind: 'single-statement', note: 'keyed upsert' },
    dataClass: 'global-reference',
  },
];

describe('resolveImportPath', () => {
  it('resolves the source alias and relative specifiers to module paths', () => {
    expect(resolveImportPath(CALLER, '@/data/market-prices/schema')).toBe(
      'src/data/market-prices/schema.ts',
    );
    expect(resolveImportPath(CALLER, './schema')).toBe('src/features/owned-assets/schema.ts');
    expect(resolveImportPath(CALLER, '../../data/market-prices/schema')).toBe(
      'src/data/market-prices/schema.ts',
    );
  });

  it('ignores bare package specifiers', () => {
    expect(resolveImportPath(CALLER, 'drizzle-orm')).toBeNull();
  });
});

describe('buildSymbolTable', () => {
  it('resolves named imports, aliases, and namespace members', () => {
    const source = [
      "import { ownedAssets as assets } from './schema';",
      "import * as schema from '@/composition/drizzle-schema';",
    ].join('\n');

    const symbols = buildSymbolTable(CALLER, source, EXPORTS);

    expect(symbols.get('assets')).toBe('owned_assets');
    expect(symbols.get('schema.marketPrices')).toBe('market_prices');
  });

  it('is not thrown off by a side-effect import preceding a schema import', () => {
    const source = [
      "import 'server-only';",
      "import { ownedAssets } from './schema';",
      'await db.delete(ownedAssets);',
    ].join('\n');

    expect(buildSymbolTable(CALLER, source, EXPORTS).get('ownedAssets')).toBe('owned_assets');
    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual(['owned_assets']);
  });

  it('ignores type-only imports and non-schema modules', () => {
    const source = [
      "import type { ownedAssets } from './schema';",
      "import { and, eq } from 'drizzle-orm';",
    ].join('\n');

    expect(buildSymbolTable(CALLER, source, EXPORTS).size).toBe(0);
  });
});

describe('findWrittenTables', () => {
  it('detects a single-line write call', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'await db.delete(ownedAssets).where(eq(ownedAssets.id, id));',
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual(['owned_assets']);
  });

  it('detects a multi-line chained write regardless of the receiver name', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'await someRenamedHandle',
      '  .insert(ownedAssets)',
      '  .values(rows);',
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual(['owned_assets']);
  });

  it('detects a raw sql template write through an interpolated table symbol', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'await db.execute(sql`TRUNCATE TABLE ${ownedAssets} RESTART IDENTITY CASCADE`);',
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual(['owned_assets']);
  });

  it('detects a write keyword that leads a later line of the template', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'await db.execute(sql`',
      '  UPDATE ${ownedAssets} AS a',
      "  SET quantity = 0`);",
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual(['owned_assets']);
  });

  it('does not read a column named updated_at as an UPDATE statement', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'const rows = await db.execute(sql`SELECT updated_at FROM ${ownedAssets}`);',
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual([]);
  });

  it('does not attribute a read-only import as a write', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'const rows = await db.select().from(ownedAssets);',
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual([]);
  });

  it('does not match a same-named method call on a value that is not a table symbol', () => {
    const source = [
      "import { ownedAssets } from './schema';",
      'seen.delete(cacheKey);',
    ].join('\n');

    expect(findWrittenTables(CALLER, source, EXPORTS)).toEqual([]);
  });
});

describe('findUndeclaredCrossOwnerWrites', () => {
  const site = (file: string, slice: string, table: string): WriteSite => ({ file, slice, table });

  it('passes a write made by the owning slice', () => {
    expect(
      findUndeclaredCrossOwnerWrites(
        [site(CALLER, 'features/owned-assets', 'owned_assets')],
        REGISTRY,
      ),
    ).toEqual([]);
  });

  it('passes a cross-owner write the table declares', () => {
    expect(
      findUndeclaredCrossOwnerWrites(
        [
          site(
            'src/composition/pipelines/sde-pipeline.ts',
            'composition/pipelines',
            'market_prices',
          ),
        ],
        REGISTRY,
      ),
    ).toEqual([]);
  });

  it('names the file, table, owner, and required declaration for an undeclared write', () => {
    const findings = findUndeclaredCrossOwnerWrites(
      [
        site(
          'src/features/industry-planner/census-probe.ts',
          'features/industry-planner',
          'market_prices',
        ),
      ],
      REGISTRY,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('src/features/industry-planner/census-probe.ts');
    expect(findings[0]).toContain('market_prices');
    expect(findings[0]).toContain('data/market-prices');
    expect(findings[0]).toContain('data-ownership-registry.ts');
  });

  it('rejects a write to a table that carries no ownership declaration at all', () => {
    const findings = findUndeclaredCrossOwnerWrites(
      [site('src/data/new-thing/queries.ts', 'data/new-thing', 'undeclared_table')],
      REGISTRY,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('no data-ownership declaration');
  });
});
