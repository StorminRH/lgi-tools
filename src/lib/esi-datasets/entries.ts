import type { EsiDatasetEntry } from './types';

/**
 * The ESI dataset registry: one complete declaration per existing external
 * dataset, including placement, freshness, refresh ownership, and durable
 * mirrors. These entries are also the runtime TTL source; the registry gate
 * rejects unregistered mirrors, invalid placement, and below-upstream polling.
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
    mirrorTables: ['owned_assets', 'owned_asset_syncs', 'corp_holding_nodes'],
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
    name: 'corp_context',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'deferred-queue', dataset: 'corp_context' },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/corporations/{corporation_id}/',
        '/corporations/{corporation_id}/divisions/',
        '/corporations/{corporation_id}/membertracking/',
        '/corporations/{corporation_id}/assets/names/',
        '/universe/structures/{structure_id}/',
      ],
      verifiedCacheSeconds: 3600,
    },
    notes:
      'The Director context pass behind role-mirrored corp sharing: HQ station, renamed divisions, linked members\' bases, and the names of containers and structures the holding index refers to.',
    mirrorTables: ['corp_profiles', 'corp_member_bases'],
  },
  {
    name: 'character_corp_roles',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'resolveCorpViewer' },
    upstream: {
      kind: 'esi',
      specPaths: ['/characters/{character_id}/roles/'],
      verifiedCacheSeconds: 3600,
    },
    mirrorTables: ['corp_member_roles'],
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
    derivedClientAssets: [
      {
        name: 'universe-system-directory',
        route: '/api/universe/assets/[version]/systems',
        placement: 'versioned-immutable-route',
        refresh: 'sde-refresh-cron-tag-bust',
      },
      {
        name: 'universe-adjacency-graph',
        route: '/api/universe/assets/[version]/adjacency',
        placement: 'versioned-immutable-route',
        refresh: 'sde-refresh-cron-tag-bust',
      },
      {
        name: 'wormhole-codex',
        route: '/api/universe/assets/[version]/wormholes',
        placement: 'versioned-immutable-route',
        refresh: 'sde-refresh-cron-tag-bust',
      },
    ],
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
    name: 'wh_statics',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'cron-cadence',
    refreshOwner: {
      kind: 'cron',
      route: '/api/cron/refresh-wh-statics',
    },
    upstream: { kind: 'anoik-statics' },
    mirrorTables: ['wh_statics_snapshots', 'wh_system_statics'],
    notes:
      'Weekly conditional refresh into an operator-reviewed pending snapshot; serving reads only the promoted copy.',
  },
  {
    name: 'character_sheet_live',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'deferred-queue', dataset: 'character_sheet' },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/characters/{character_id}/location/',
        '/characters/{character_id}/ship/',
        '/characters/{character_id}/online/',
        '/characters/{character_id}/attributes/',
        '/characters/{character_id}/implants/',
        '/characters/{character_id}/clones/',
        '/characters/{character_id}/wallet/',
      ],
      verifiedCacheSeconds: 120,
    },
    notes:
      'The 120 s tier of the home board character sheet: attributes, implants, clones and wallet balance are cached 120 s upstream; location, ship and online (5-60 s) are declared at the tier maximum, which stays at or above every upstream. Those three paths are also claimed by the Convex character_location entry (the map tracker); this entry reads them on view for the dashboard at the tier TTL and never feeds the tracker.',
    mirrorTables: ['character_sheets'],
  },
  {
    name: 'character_sheet_hourly',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'deferred-queue', dataset: 'character_sheet' },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/characters/{character_id}/wallet/journal/',
        '/characters/{character_id}/orders/',
        '/universe/structures/{structure_id}/',
      ],
      verifiedCacheSeconds: 3600,
    },
    notes:
      'The hourly tier: journal page 1 (digested, never stored raw), open market orders (1200 s upstream, declared at the tier maximum), and the names of player structures a character is docked at or keeps clones in.',
    mirrorTables: ['character_sheets'],
  },
  {
    name: 'character_sheet_daily',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'deferred-queue', dataset: 'character_sheet' },
    upstream: {
      kind: 'esi',
      specPaths: ['/characters/{character_id}/'],
      verifiedCacheSeconds: 86400,
    },
    notes: 'The daily tier: the public character record (birthday, security status).',
    mirrorTables: ['character_sheets'],
  },
  {
    name: 'character_location',
    store: 'convex',
    shape: 'live',
    freshnessModel: 'engine-cadence',
    refreshOwner: { kind: 'engine', dataset: 'characterLocation' },
    upstream: {
      kind: 'esi',
      specPaths: [
        '/characters/{character_id}/location/',
        '/characters/{character_id}/ship/',
        '/characters/{character_id}/online/',
      ],
      verifiedCacheSeconds: 5,
    },
    mirrorTables: [],
  },
] as const satisfies readonly EsiDatasetEntry[];
