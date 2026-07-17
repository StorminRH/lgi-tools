import type { EsiDatasetEntry } from './types';

/**
 * The ESI dataset registry: one complete declaration per existing external
 * dataset, including placement, freshness, refresh ownership, and durable
 * mirrors. Session 3.9.2.3.2 makes these entries the runtime TTL source; the
 * registry gate already rejects unregistered mirrors, invalid placement, and
 * below-upstream polling.
 */
export const ESI_DATASET_ENTRIES = [
  {
    name: 'skills',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'deferred-queue', dataset: 'skills' },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/characters/{character_id}/skills/',
        '/characters/{character_id}/skillqueue/',
      ],
      verifiedCacheSeconds: 120,
    },
    mirrorTables: ['character_skills', 'character_skill_syncs'],
  },
  {
    name: 'character_industry_jobs',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: {
      kind: 'deferred-queue',
      dataset: 'character_industry_jobs',
    },
    upstream: {
      kind: 'esi',
      specPaths: ['/characters/{character_id}/industry/jobs/'],
      verifiedCacheSeconds: 300,
    },
    mirrorTables: [
      'character_industry_jobs',
      'character_industry_job_syncs',
    ],
  },
  {
    name: 'corporation_industry_jobs',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: {
      kind: 'deferred-queue',
      dataset: 'corporation_industry_jobs',
    },
    upstream: {
      kind: 'esi',
      specPaths: ['/corporations/{corporation_id}/industry/jobs/'],
      verifiedCacheSeconds: 300,
    },
    mirrorTables: ['corp_industry_jobs', 'corp_industry_job_syncs'],
  },
  {
    name: 'owned_assets',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'deferred-queue', dataset: 'owned_assets' },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/characters/{character_id}/assets/',
        '/corporations/{corporation_id}/assets/',
      ],
      verifiedCacheSeconds: 3600,
    },
    mirrorTables: ['owned_assets', 'owned_asset_syncs'],
  },
  {
    name: 'owned_blueprints',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: {
      kind: 'deferred-queue',
      dataset: 'owned_blueprints',
    },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/characters/{character_id}/blueprints/',
        '/corporations/{corporation_id}/blueprints/',
      ],
      verifiedCacheSeconds: 3600,
    },
    mirrorTables: ['owned_blueprints', 'owned_blueprint_syncs'],
  },
  {
    name: 'owned_structures',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: {
      kind: 'entry-point',
      name: 'refreshCorpStructuresForUser',
    },
    upstream: {
      kind: 'esi',
      specPaths: ['/corporations/{corporation_id}/structures/'],
      verifiedCacheSeconds: 3600,
    },
    mirrorTables: ['corp_structures', 'corp_structure_syncs'],
  },
  {
    name: 'affiliations',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshAffiliations' },
    cronBackstopRoute: '/api/cron/refresh-affiliations',
    upstream: {
      kind: 'esi',
      specPaths: ['/characters/affiliation/'],
      verifiedCacheSeconds: 3600,
    },
    mirrorTables: ['characters'],
  },
  {
    name: 'market_prices',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'row-stale-after',
    refreshOwner: { kind: 'cron', route: '/api/cron/refresh-prices' },
    upstream: {
      kind: 'esi',
      specPaths: ['/markets/{region_id}/orders/'],
      verifiedCacheSeconds: 300,
    },
    ttlOverride: {
      milliseconds: 24 * 60 * 60 * 1000,
      rationale:
        'The marker schedules the nightly sweep; getLivePrices still fetches live on view.',
    },
    mirrorTables: ['market_prices'],
  },
  {
    name: 'market_history',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'expires-boundary',
    refreshOwner: { kind: 'cron', route: null },
    upstream: {
      kind: 'esi',
      specPaths: ['/markets/{region_id}/history/'],
      verifiedCacheSeconds: null,
    },
    waiver: {
      rule: 'global-cron-names-route',
      rationale:
        'History refreshes on view and persists each response Expires boundary; no cron owns it.',
    },
    notes:
      'The ESI operation declares no static x-cached-seconds; each response supplies Expires.',
    mirrorTables: ['market_history', 'market_history_meta'],
  },
  {
    name: 'industry_indices',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'cron-cadence',
    refreshOwner: {
      kind: 'cron',
      route: '/api/cron/refresh-industry-indices',
    },
    upstream: {
      kind: 'esi',
      specPaths: ['/industry/systems/', '/markets/prices/'],
      verifiedCacheSeconds: 3600,
    },
    mirrorTables: ['industry_cost_indices', 'adjusted_prices'],
  },
  {
    name: 'sde',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'cron-cadence',
    refreshOwner: { kind: 'cron', route: '/api/cron/refresh-sde' },
    upstream: { kind: 'ccp-sde-manifest' },
    mirrorTables: [
      'eve_categories',
      'eve_groups',
      'eve_types',
      'dgm_attribute_types',
      'type_dogma',
      'industry_blueprints',
      'blueprint_trees',
      'blueprint_flat_materials',
      'eve_regions',
      'eve_constellations',
      'eve_solar_systems',
      'eve_station_operations',
      'eve_npc_stations',
      'eve_system_jumps',
      'eve_data_meta',
    ],
  },
  {
    name: 'gsc',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'cron-cadence',
    refreshOwner: { kind: 'cron', route: '/api/cron/refresh-gsc' },
    upstream: { kind: 'google-gsc' },
    mirrorTables: [
      'gsc_search_analytics',
      'gsc_sitemaps',
      'gsc_url_inspection',
    ],
  },
  {
    name: 'online_status',
    store: 'convex',
    shape: 'live',
    freshnessModel: 'engine-cadence',
    refreshOwner: { kind: 'engine', dataset: 'onlineStatus' },
    upstream: {
      kind: 'esi',
      specPaths: ['/characters/{character_id}/online/'],
      verifiedCacheSeconds: 60,
    },
    mirrorTables: [],
  },
] as const satisfies readonly EsiDatasetEntry[];
