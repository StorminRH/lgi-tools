import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getTableConfig,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import { refreshCorpStructuresForUser } from '@/features/owned-structures/refresh';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { refreshCharacterSheetsOnView } from '@/composition/sync/character-sheet-sync';
import { refreshCorpContextOnView } from '@/composition/sync/corp-context-sync';
import { refreshCorpJobsOnView } from '@/composition/sync/corp-industry-jobs-sync';
import { refreshJobsOnView } from '@/composition/sync/industry-jobs-sync';
import { refreshOwnedAssetsOnView } from '@/composition/sync/owned-assets-sync';
import { refreshOwnedBlueprintsOnView } from '@/composition/sync/owned-blueprints-sync';
import { refreshSkillsOnView } from '@/composition/sync/skills-sync';
import {
  reflectedSchemaTables,
  registryCoverageDiff,
} from '@/db/__tests__/support/schema-reflection';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import { routeDeclaration, type EsiRoute } from '@/lib/esi-datasets/routes';
import type {
  EsiDatasetEntry,
  EsiRouteDeclaration,
  EsiRouteHolder,
} from '@/lib/esi-datasets/types';
import { SYNC_DATASETS } from '@/lib/sync-engine';
import {
  checkEntries,
  CONVEX_ESI_HOMES,
  ESI_INFRASTRUCTURE_TABLES,
  isEsiMirrorTable,
} from './__tests__/checks';

const tables = await reflectedSchemaTables();
const tableNames = tables.map((table) => getTableConfig(table).name);
const flagged = tables
  .filter(isEsiMirrorTable)
  .map((table) => getTableConfig(table).name);
const declaredTables = [
  ...ESI_DATASET_ENTRIES.flatMap((entry) => [...entry.mirrorTables]),
  ...ESI_INFRASTRUCTURE_TABLES.map((entry) => entry.table),
];

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as { crons: { path: string }[] };

const liveContext = {
  cronRoutes: new Set(vercelConfig.crons.map((cron) => cron.path)),
  personalEntryPoints: new Set([
    refreshAffiliationsWithOutcome.name,
    refreshCorpStructuresForUser.name,
    resolveCorpViewer.name,
    refreshSkillsOnView.name,
    refreshJobsOnView.name,
    refreshCorpJobsOnView.name,
    refreshOwnedAssetsOnView.name,
    refreshOwnedBlueprintsOnView.name,
    refreshCorpContextOnView.name,
    refreshCharacterSheetsOnView.name,
  ]),
  engineDatasets: new Set<string>(SYNC_DATASETS),
};

const ESI = { kind: 'esi' } as const;

const SYNTHETIC_STORED: EsiRouteDeclaration = { route: '/synthetic/', method: 'GET', holder: 'global', specCacheSeconds: 300 };
const SYNTHETIC_LOOKUP: EsiRouteDeclaration = { ...SYNTHETIC_STORED, route: '/synthetic/lookup/', mode: 'pass-through' };

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
});

describe('ESI dataset registry seeded rule failures', () => {
  it('rejects missing and null global cron routes', () => {
    const missing: EsiDatasetEntry = {
      name: 'missing_cron',
      store: 'neon',
      shape: 'global-cron',
      refreshOwner: { kind: 'cron', route: '/api/cron/not-live' },
      upstream: ESI,
      routes: [],
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
      refreshOwner: { kind: 'entry-point', name: 'refreshNothingOnView' },
      upstream: ESI,
      routes: [],
      mirrorTables: [],
    };

    expect(checkEntries([entry], liveContext)).toEqual([
      'missing_personal_owner: unknown personal refresh owner refreshNothingOnView',
    ]);
  });

  it('rejects an unknown personal cron backstop under its dedicated rule', () => {
    const invalid: EsiDatasetEntry = {
      name: 'missing_personal_backstop',
      store: 'neon',
      shape: 'personal-on-view',
      refreshOwner: { kind: 'entry-point', name: 'refreshSkillsOnView' },
      cronBackstopRoute: '/api/cron/not-live',
      upstream: ESI,
      routes: [],
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

  it('rejects an engine owner outside the live sync datasets', () => {
    const entry: EsiDatasetEntry = {
      name: 'missing_engine',
      store: 'convex',
      shape: 'live',
      refreshOwner: { kind: 'engine', dataset: 'nothingLive' },
      upstream: ESI,
      routes: [],
      mirrorTables: [],
    };

    expect(checkEntries([entry], liveContext)).toEqual(['missing_engine: unknown engine dataset nothingLive']);
  });

  it('rejects a lookup that stores a route or claims a mirror table', () => {
    const stored: EsiDatasetEntry = {
      name: 'storing_lookup',
      store: 'none',
      shape: 'lookup',
      upstream: ESI,
      routes: [SYNTHETIC_LOOKUP, SYNTHETIC_STORED],
      mirrorTables: [],
    };
    const mirrored: EsiDatasetEntry = { ...stored, name: 'mirrored_lookup', routes: [SYNTHETIC_LOOKUP], mirrorTables: ['market_prices'] };

    expect(checkEntries([stored], liveContext)).toEqual([
      'storing_lookup: lookup route /synthetic/ must be pass-through',
      'storing_lookup: stored routes need a mirror table or keepBody',
    ]);
    expect(checkEntries([mirrored], liveContext)).toEqual(['mirrored_lookup: lookup dataset declares mirror tables']);
  });

  it('rejects a stored route whose answer has nowhere to land, and accepts a kept body', () => {
    const homeless: EsiDatasetEntry = {
      name: 'homeless_store',
      store: 'neon',
      shape: 'global-cron',
      refreshOwner: { kind: 'cron', route: '/api/cron/daily-batch' },
      upstream: ESI,
      routes: [SYNTHETIC_STORED, SYNTHETIC_LOOKUP],
      mirrorTables: [],
    };
    const kept: EsiDatasetEntry = { ...homeless, name: 'kept_body', routes: [{ ...SYNTHETIC_STORED, keepBody: true }] };

    expect(checkEntries([homeless], liveContext)).toEqual(['homeless_store: stored routes need a mirror table or keepBody']);
    expect(checkEntries([kept], liveContext)).toEqual([]);
  });

  it('accepts only a rationale-bearing waiver for its named violation', () => {
    const valid: EsiDatasetEntry = {
      name: 'waived_cron',
      store: 'neon',
      shape: 'global-cron',
      refreshOwner: { kind: 'cron', route: null },
      upstream: ESI,
      routes: [],
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
  it('passes every placement, owner, route and mirror rule', () => {
    expect(checkEntries(ESI_DATASET_ENTRIES, liveContext)).toEqual([]);
  });

  it('pins the reflected ESI freshness-table scan in both directions', () => {
    expect([...flagged].sort()).toEqual(
      [
        'character_industry_job_syncs',
        'character_sheets',
        'character_skill_syncs',
        'characters',
        'corp_industry_job_syncs',
        'corp_member_roles',
        'corp_profiles',
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
    const unregistered = registryCoverageDiff(flagged, declaredTables).missing;
    expect(
      unregistered,
      `Unregistered ESI mirror table(s): ${unregistered.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps every table claim and infrastructure exemption live', () => {
    const stale = registryCoverageDiff(tableNames, declaredTables).stale;
    expect(stale, `Stale ESI table claim(s): ${stale.join(', ')}`).toEqual([]);
    for (const entry of ESI_INFRASTRUCTURE_TABLES) {
      expect(entry.reason.trim(), entry.table).not.toBe('');
    }
  });

  it('declares unique entry names and one on-view entry point per personal dataset', () => {
    const names = ESI_DATASET_ENTRIES.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);

    const ownersByEntryPoint = new Map<string, string[]>();
    for (const entry of ESI_DATASET_ENTRIES) {
      if (entry.shape !== 'personal-on-view') continue;
      const owners = ownersByEntryPoint.get(entry.refreshOwner.name) ?? [];
      owners.push(entry.name);
      ownersByEntryPoint.set(entry.refreshOwner.name, owners);
    }
    // One sheet refresh serves its three tiers; every other entry point owns one dataset.
    expect(ownersByEntryPoint.get(refreshCharacterSheetsOnView.name)?.sort()).toEqual([
      'character_sheet_daily', 'character_sheet_hourly', 'character_sheet_live',
    ]);
    for (const [entryPoint, owners] of ownersByEntryPoint) {
      if (entryPoint !== refreshCharacterSheetsOnView.name) expect(owners, entryPoint).toHaveLength(1);
    }
  });

  it('maps Convex homes and Convex registry entries bidirectionally', () => {
    const convexEntries = ESI_DATASET_ENTRIES
      .filter((entry) => entry.store === 'convex')
      .map((entry) => entry.name)
      .sort();
    const mappedEntries = [...new Set(CONVEX_ESI_HOMES.map((home) => home.entry))].sort();

    expect(mappedEntries).toEqual(convexEntries);
    expect(CONVEX_ESI_HOMES).toEqual([
      { home: 'convex:characterLocation', entry: 'character_location' },
      { home: 'convex:characterLocationCovered', entry: 'character_location' },
      { home: 'convex:characterLocationOnline', entry: 'character_location' },
    ]);
  });

  it('pins the two live waivers with non-empty rationales', () => {
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
      {
        name: 'eve_status',
        rule: 'global-cron-names-route',
        rationale:
          'Tranquility status is read on view and kept whole in its esi_responses row until CCP\'s Expires; no cron owns it.',
      },
    ]);
    for (const waiver of waivers) expect(waiver.rationale.trim(), waiver.name).not.toBe('');
  });

  it('pins the one lookup entry to the searches and resolvers', () => {
    const lookups = ESI_DATASET_ENTRIES.filter((entry) => entry.shape === 'lookup');
    expect(lookups.map((entry) => entry.name)).toEqual(['esi_lookups']);
    expect(lookups[0]?.routes.map((route) => `${route.method} ${route.route}`)).toEqual([
      'GET /characters/{character_id}/search/',
      'POST /universe/ids/',
      'POST /universe/names/',
      'GET /universe/structures/{structure_id}/',
    ]);
  });
});

const OWNER_PLACEHOLDER: Record<EsiRouteHolder, string | null> = {
  character: '{character_id}',
  corporation: '{corporation_id}',
  'user-corporation': '{corporation_id}',
  global: null,
};

describe('ESI route declarations', () => {
  const entries: readonly EsiDatasetEntry[] = ESI_DATASET_ENTRIES;
  const esiEntries = entries.filter((entry) => entry.upstream.kind === 'esi');

  it('declares routes on every ESI entry and on nothing else', () => {
    for (const entry of entries) {
      if (entry.upstream.kind === 'esi') {
        expect(entry.routes.length, entry.name).toBeGreaterThan(0);
      } else {
        expect(entry.routes, entry.name).toEqual([]);
      }
    }
  });

  it('claims only mirror tables the schema defines, and a home for every stored route', () => {
    for (const entry of esiEntries) {
      for (const table of entry.mirrorTables) expect(tableNames, `${entry.name} claims ${table}`).toContain(table);
      const stored = entry.routes.filter((route) => (route.mode ?? 'stored') === 'stored');
      if (stored.length > 0 && entry.mirrorTables.length === 0) {
        expect(stored.every((route) => route.keepBody === true), entry.name).toBe(true);
      }
    }
  });

  it('fills a stored owner GET from its holder and keeps global routes owner-free', () => {
    for (const entry of esiEntries) {
      for (const route of entry.routes) {
        // A stored POST (the affiliation batch) names its characters in the body and is recorded per character.
        if (route.mode === 'pass-through' || route.method === 'POST') continue;
        const placeholder = OWNER_PLACEHOLDER[route.holder];
        const label = `${entry.name} ${route.route}`;
        if (placeholder === null) {
          expect(route.route, label).not.toMatch(/\{(character|corporation)_id\}/);
        } else {
          expect(route.route, label).toContain(placeholder);
        }
      }
    }
  });

  it('declares one route the same way everywhere it appears, the tracker aside', () => {
    const byRoute = new Map<string, Array<{ dataset: string; declaration: EsiRouteDeclaration }>>();
    for (const entry of esiEntries) {
      for (const declaration of entry.routes) {
        byRoute.set(declaration.route, [...(byRoute.get(declaration.route) ?? []), { dataset: entry.name, declaration }]);
      }
    }
    for (const [route, declared] of byRoute) {
      const owned = declared.filter((candidate) => candidate.declaration.mode !== 'convex');
      const [first, ...rest] = owned;
      if (first === undefined) continue;
      for (const other of rest) {
        expect(other.declaration, `${route}: ${other.dataset} vs ${first.dataset}`).toEqual(first.declaration);
      }
      expect(routeDeclaration(route as EsiRoute)).toEqual(first.declaration);
    }
  });

  it('leaves the map tracker its own declarations, and nothing else is convex', () => {
    const convex = esiEntries.flatMap((entry) =>
      entry.routes.filter((route) => route.mode === 'convex').map((route) => `${entry.name} ${route.route}`),
    );
    expect(convex).toEqual([
      'character_location /characters/{character_id}/location/',
      'character_location /characters/{character_id}/ship/',
      'character_location /characters/{character_id}/online/',
    ]);
    for (const entry of esiEntries) {
      if (entry.store === 'convex') expect(entry.routes.every((route) => route.mode === 'convex'), entry.name).toBe(true);
    }
  });

  it('keeps stored POSTs to the affiliation batch and stored bodies to the status document', () => {
    const storedPosts = esiEntries.flatMap((entry) =>
      entry.routes.filter((route) => route.method === 'POST' && route.mode !== 'pass-through').map((route) => route.route),
    );
    expect(storedPosts).toEqual(['/characters/affiliation/']);
    const kept = esiEntries.flatMap((entry) => entry.routes.filter((route) => route.keepBody === true).map((route) => route.route));
    expect(kept).toEqual(['/status/']);
    const unconditional = esiEntries.flatMap((entry) =>
      entry.routes.filter((route) => route.conditional === false).map((route) => route.route),
    );
    expect(unconditional).toEqual(['/characters/{character_id}/wallet/journal/']);
  });

  it('carries CCP\'s published cache time on every stored route', () => {
    for (const entry of esiEntries) {
      for (const route of entry.routes) {
        if (route.mode === 'pass-through') continue;
        const label = `${entry.name} ${route.route}`;
        if (route.route === '/markets/{region_id}/history/') {
          expect(route.specCacheSeconds, label).toBeNull();
        } else {
          expect(route.specCacheSeconds, label).toBeGreaterThan(0);
        }
      }
    }
  });
});
