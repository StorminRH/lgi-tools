import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { is } from 'drizzle-orm';
import {
  getTableConfig,
  PgTable,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '@/composition/drizzle-schema';
import { ESI_REFRESH_DATASETS } from '@/data/esi-refresh-jobs/constants';
import { refreshAffiliations } from '@/platform/auth/affiliation';
import { refreshCorpStructuresForUser } from '@/features/owned-structures/refresh';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import {
  effectiveTtlMs,
  type EsiDatasetEntry,
} from '@/lib/esi-datasets/types';
import { SYNC_DATASET_CONFIG, SYNC_DATASETS } from '@/lib/sync-engine';
import {
  checkEntries,
  CONVEX_ESI_HOMES,
  ESI_INFRASTRUCTURE_TABLES,
  findUnregisteredMirrors,
  isEsiMirrorTable,
} from './checks';

const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);
const tableNames = new Set(tables.map((table) => getTableConfig(table).name));
const flagged = tables
  .filter(isEsiMirrorTable)
  .map((table) => getTableConfig(table).name);
const claimed = new Set(
  ESI_DATASET_ENTRIES.flatMap((entry) => [...entry.mirrorTables]),
);
const infrastructure = new Set(
  ESI_INFRASTRUCTURE_TABLES.map((entry) => entry.table),
);

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as { crons: { path: string }[] };

const liveContext = {
  cronRoutes: new Set(vercelConfig.crons.map((cron) => cron.path)),
  deferredDatasets: new Set<string>(ESI_REFRESH_DATASETS),
  personalEntryPoints: new Set([
    refreshAffiliations.name,
    refreshCorpStructuresForUser.name,
  ]),
  engineDatasets: new Set<string>(SYNC_DATASETS),
};

function entryNamed(name: string): EsiDatasetEntry {
  const entry = ESI_DATASET_ENTRIES.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Missing test registry entry: ${name}`);
  return entry;
}

function staticEsi(cacheSeconds: number) {
  return {
    kind: 'esi' as const,
    specPaths: ['/synthetic/'],
    verifiedCacheSeconds: cacheSeconds,
  };
}

describe('ESI dataset registry pure checks', () => {
  it('recognizes only the declared freshness-column patterns', () => {
    const refreshed = pgTable('synthetic_refreshed', {
      lastRefreshedAt: timestamp('last_refreshed_at'),
    });
    const affiliation = pgTable('synthetic_affiliation', {
      affiliationRefreshedAt: timestamp('affiliation_refreshed_at'),
    });
    const expires = pgTable('synthetic_expires', {
      staleAfter: timestamp('stale_after'),
    });
    const fetched = pgTable('synthetic_fetched', {
      fetchedAt: timestamp('fetched_at'),
    });
    const ordinary = pgTable('synthetic_ordinary', {
      updatedAt: timestamp('updated_at'),
    });

    expect(isEsiMirrorTable(refreshed)).toBe(true);
    expect(isEsiMirrorTable(affiliation)).toBe(true);
    expect(isEsiMirrorTable(expires)).toBe(true);
    expect(isEsiMirrorTable(fetched)).toBe(true);
    expect(isEsiMirrorTable(ordinary)).toBe(false);
  });

  it('surfaces an unregistered mirror and clears claimed or infrastructure tables', () => {
    expect(
      findUnregisteredMirrors(
        ['synthetic_unregistered'],
        new Set(),
        new Set(),
      ),
    ).toEqual(['synthetic_unregistered']);
    expect(
      findUnregisteredMirrors(['claimed'], new Set(['claimed']), new Set()),
    ).toEqual([]);
    expect(
      findUnregisteredMirrors(
        ['transport'],
        new Set(),
        new Set(['transport']),
      ),
    ).toEqual([]);
  });

  it('derives default, override, and non-static effective TTLs', () => {
    expect(effectiveTtlMs(entryNamed('skills'))).toBe(120_000);
    expect(effectiveTtlMs(entryNamed('market_prices'))).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(effectiveTtlMs(entryNamed('market_history'))).toBeNull();
    expect(effectiveTtlMs(entryNamed('sde'))).toBeNull();
  });
});

describe('ESI dataset registry seeded rule failures', () => {
  it('rejects Convex data cached above 120 seconds without collaboration', () => {
    const entry: EsiDatasetEntry = {
      name: 'bad_convex_placement',
      store: 'convex',
      shape: 'live',
      freshnessModel: 'engine-cadence',
      refreshOwner: { kind: 'engine', dataset: 'onlineStatus' },
      upstream: staticEsi(3600),
      mirrorTables: [],
    };

    expect(checkEntries([entry], liveContext)).toEqual([
      'bad_convex_placement: Convex requires verified ESI cache <= 120s or collaborative data',
    ]);
  });

  it('rejects missing and null global cron routes', () => {
    const missing: EsiDatasetEntry = {
      name: 'missing_cron',
      store: 'neon',
      shape: 'global-cron',
      freshnessModel: 'row-stale-after',
      refreshOwner: { kind: 'cron', route: '/api/cron/not-live' },
      upstream: staticEsi(300),
      mirrorTables: [],
    };
    const absent: EsiDatasetEntry = {
      ...missing,
      name: 'absent_cron',
      refreshOwner: { kind: 'cron', route: null },
    };

    expect(checkEntries([missing], liveContext)).toEqual([
      'missing_cron: unknown cron route /api/cron/not-live',
    ]);
    expect(checkEntries([absent], liveContext)).toEqual([
      'absent_cron: global-cron dataset has no cron route',
    ]);
  });

  it('rejects a personal refresh owner outside the live handles', () => {
    const entry: EsiDatasetEntry = {
      name: 'missing_personal_owner',
      store: 'neon',
      shape: 'personal-on-view',
      freshnessModel: 'caller-ttl',
      refreshOwner: { kind: 'deferred-queue', dataset: 'not_live' },
      upstream: staticEsi(300),
      mirrorTables: [],
    };

    expect(checkEntries([entry], liveContext)).toEqual([
      'missing_personal_owner: unknown personal refresh owner not_live',
    ]);
  });

  it('rejects an unknown personal cron backstop under its dedicated rule', () => {
    const invalid: EsiDatasetEntry = {
      name: 'missing_personal_backstop',
      store: 'neon',
      shape: 'personal-on-view',
      freshnessModel: 'caller-ttl',
      refreshOwner: { kind: 'deferred-queue', dataset: 'skills' },
      cronBackstopRoute: '/api/cron/not-live',
      upstream: staticEsi(300),
      mirrorTables: [],
    };
    const waived: EsiDatasetEntry = {
      ...invalid,
      name: 'waived_personal_backstop',
      waiver: {
        rule: 'personal-backstop-names-route',
        rationale: 'Synthetic seeded waiver.',
      },
    };

    expect(checkEntries([invalid], liveContext)).toEqual([
      'missing_personal_backstop: unknown cron backstop /api/cron/not-live',
    ]);
    expect(checkEntries([waived], liveContext)).toEqual([]);
  });

  it('rejects an effective TTL below the verified upstream cache', () => {
    const entry: EsiDatasetEntry = {
      name: 'too_fast',
      store: 'neon',
      shape: 'global-cron',
      freshnessModel: 'row-stale-after',
      refreshOwner: { kind: 'cron', route: '/api/cron/refresh-prices' },
      upstream: staticEsi(300),
      ttlOverride: {
        milliseconds: 60_000,
        rationale: 'Synthetic seeded violation.',
      },
      mirrorTables: [],
    };

    expect(checkEntries([entry], liveContext)).toEqual([
      'too_fast: effective TTL 60000ms is below upstream 300000ms',
    ]);
  });

  it('accepts only a rationale-bearing waiver for its named violation', () => {
    const valid: EsiDatasetEntry = {
      name: 'waived_cron',
      store: 'neon',
      shape: 'global-cron',
      freshnessModel: 'expires-boundary',
      refreshOwner: { kind: 'cron', route: null },
      upstream: {
        kind: 'esi',
        specPaths: ['/synthetic/expires/'],
        verifiedCacheSeconds: null,
      },
      waiver: {
        rule: 'global-cron-names-route',
        rationale: 'Synthetic on-view owner.',
      },
      mirrorTables: [],
    };
    const emptyRationale: EsiDatasetEntry = {
      ...valid,
      name: 'empty_waiver',
      waiver: {
        rule: 'global-cron-names-route',
        rationale: '',
      },
    };

    expect(checkEntries([valid], liveContext)).toEqual([]);
    expect(checkEntries([emptyRationale], liveContext)).toEqual([
      'empty_waiver: waiver global-cron-names-route requires a rationale',
    ]);
  });
});

describe('ESI dataset registry live gate', () => {
  it('passes every placement, owner, route, and freshness rule', () => {
    expect(checkEntries(ESI_DATASET_ENTRIES, liveContext)).toEqual([]);
  });

  it('pins the reflected ESI freshness-table scan in both directions', () => {
    expect([...flagged].sort()).toEqual(
      [
        'character_industry_job_syncs',
        'character_skill_syncs',
        'characters',
        'corp_industry_job_syncs',
        'corp_structure_syncs',
        'esi_snapshots',
        'market_history_meta',
        'market_prices',
        'owned_asset_syncs',
        'owned_blueprint_syncs',
      ].sort(),
    );
  });

  it('claims every reflected mirror or declares it as infrastructure', () => {
    const unregistered = findUnregisteredMirrors(
      flagged,
      claimed,
      infrastructure,
    );
    expect(
      unregistered,
      `Unregistered ESI mirror table(s): ${unregistered.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps every table claim and infrastructure exemption live', () => {
    const stale = [...claimed, ...infrastructure]
      .filter((name) => !tableNames.has(name))
      .sort();
    expect(stale, `Stale ESI table claim(s): ${stale.join(', ')}`).toEqual([]);
    for (const entry of ESI_INFRASTRUCTURE_TABLES) {
      expect(entry.reason.trim(), entry.table).not.toBe('');
    }
  });

  it('declares unique entry names and exactly one owner for every queue dataset', () => {
    const names = ESI_DATASET_ENTRIES.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);

    for (const dataset of ESI_REFRESH_DATASETS) {
      const owners = ESI_DATASET_ENTRIES.filter(
        (entry) =>
          entry.shape === 'personal-on-view'
          && entry.refreshOwner.kind === 'deferred-queue'
          && entry.refreshOwner.dataset === dataset,
      );
      expect(owners, dataset).toHaveLength(1);
    }
  });

  it('maps Convex homes and Convex registry entries bidirectionally', () => {
    const convexEntries = ESI_DATASET_ENTRIES
      .filter((entry) => entry.store === 'convex')
      .map((entry) => entry.name)
      .sort();
    const mappedEntries = CONVEX_ESI_HOMES
      .map((home) => home.entry)
      .sort();

    expect(mappedEntries).toEqual(convexEntries);
    expect(CONVEX_ESI_HOMES).toEqual([
      { home: 'convex:characterOnline', entry: 'online_status' },
    ]);
  });

  it('pins the one live waiver with a non-empty rationale', () => {
    const entries: readonly EsiDatasetEntry[] = ESI_DATASET_ENTRIES;
    const waivers = entries.flatMap((entry) =>
      entry.waiver === undefined
        ? []
        : [{
            name: entry.name,
            rule: entry.waiver.rule,
            rationale: entry.waiver.rationale,
          }],
    );

    expect(waivers).toEqual([
      {
        name: 'market_history',
        rule: 'global-cron-names-route',
        rationale:
          'History refreshes on view and persists each response Expires boundary; no cron owns it.',
      },
    ]);
    expect(waivers[0]?.rationale.trim()).not.toBe('');
  });

  it('pins every effective runtime TTL to its verified value', () => {
    expect(effectiveTtlMs(entryNamed('skills'))).toBe(120_000);
    expect(effectiveTtlMs(entryNamed('character_industry_jobs'))).toBe(
      300_000,
    );
    expect(effectiveTtlMs(entryNamed('corporation_industry_jobs'))).toBe(
      300_000,
    );
    expect(effectiveTtlMs(entryNamed('owned_assets'))).toBe(3_600_000);
    expect(effectiveTtlMs(entryNamed('owned_blueprints'))).toBe(
      3_600_000,
    );
    expect(effectiveTtlMs(entryNamed('owned_structures'))).toBe(
      3_600_000,
    );
    expect(effectiveTtlMs(entryNamed('affiliations'))).toBe(
      3_600_000,
    );
    expect(effectiveTtlMs(entryNamed('market_prices'))).toBe(
      86_400_000,
    );
    expect(effectiveTtlMs(entryNamed('online_status'))).toBe(
      SYNC_DATASET_CONFIG.onlineStatus.cadenceFloorMs,
    );
  });
});
