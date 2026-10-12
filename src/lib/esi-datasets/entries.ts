import type { EsiDatasetEntry, EsiRouteDeclaration, EsiRouteHolder } from './types';

/**
 * Route declarations, spelled once each. The builders keep the route
 * literal, so `EsiRoute` stays the union of exactly these strings.
 */
function get<const R extends string, const H extends EsiRouteHolder>(route: R, holder: H, specCacheSeconds: number | null) {
  return { route, method: 'GET', holder, specCacheSeconds } as const;
}

function post<const R extends string, const H extends EsiRouteHolder>(route: R, holder: H, specCacheSeconds: number | null) {
  return { route, method: 'POST', holder, specCacheSeconds } as const;
}

/**
 * The ESI upstream of an entry and its routes from one list: the spec paths
 * are the declared routes, so the two can never disagree.
 */
function esi<const T extends readonly EsiRouteDeclaration[]>(verifiedCacheSeconds: number | null, routes: T) {
  const specPaths = [...new Set(routes.map((declaration) => declaration.route))];
  return { upstream: { kind: 'esi', specPaths, verifiedCacheSeconds }, routes } as const;
}

/** Player structure names are looked up live and never stored; two datasets share the one declaration. */
const UNIVERSE_STRUCTURE_LOOKUP = {
  ...get('/universe/structures/{structure_id}/', 'global', 3600),
  mode: 'pass-through',
} as const satisfies EsiRouteDeclaration;

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
    refreshOwner: { kind: 'entry-point', name: 'refreshSkillsOnView' },
    ...esi(120, [
      get('/characters/{character_id}/skills/', 'character', 60),
      get('/characters/{character_id}/skillqueue/', 'character', 60),
    ]),
    mirrorTables: ['character_skills', 'character_skill_syncs'],
  },
  {
    name: 'character_industry_jobs',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshJobsOnView' },
    ...esi(300, [
      get('/characters/{character_id}/industry/jobs/', 'character', 300),
    ]),
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
    refreshOwner: { kind: 'entry-point', name: 'refreshCorpJobsOnView' },
    ...esi(300, [
      get('/corporations/{corporation_id}/industry/jobs/', 'user-corporation', 300),
    ]),
    mirrorTables: ['corp_industry_jobs', 'corp_industry_job_syncs'],
  },
  {
    name: 'owned_assets',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshOwnedAssetsOnView' },
    ...esi(3600, [
      get('/characters/{character_id}/assets/', 'character', 3600),
      get('/corporations/{corporation_id}/assets/', 'corporation', 3600),
    ]),
    mirrorTables: ['owned_assets', 'owned_asset_syncs', 'corp_holding_nodes'],
  },
  {
    name: 'owned_blueprints',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshOwnedBlueprintsOnView' },
    ...esi(3600, [
      get('/characters/{character_id}/blueprints/', 'character', 3600),
      get('/corporations/{corporation_id}/blueprints/', 'corporation', 3600),
    ]),
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
    ...esi(3600, [
      get('/corporations/{corporation_id}/structures/', 'corporation', 3600),
    ]),
    mirrorTables: ['corp_structures', 'corp_structure_syncs'],
  },
  {
    name: 'corp_context',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshCorpContextOnView' },
    notes:
      'The Director context pass behind role-mirrored corp sharing: HQ station, renamed divisions, linked members\' bases, and the names of containers and structures the holding index refers to.',
    ...esi(3600, [
      get('/corporations/{corporation_id}/', 'corporation', 3600),
      get('/corporations/{corporation_id}/divisions/', 'corporation', 3600),
      get('/corporations/{corporation_id}/membertracking/', 'corporation', 3600),
      { ...post('/corporations/{corporation_id}/assets/names/', 'global', null), mode: 'pass-through' },
      UNIVERSE_STRUCTURE_LOOKUP,
    ]),
    mirrorTables: ['corp_profiles', 'corp_member_bases'],
  },
  {
    name: 'character_corp_roles',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'resolveCorpViewer' },
    notes:
      'Three writers share corp_member_roles. resolveCorpViewer fetches a member whose stored row is stale. The corp sync passes reuse a fresh same-corporation row and probe live only without one. The Director and Station Manager mutation gates always probe live.',
    ...esi(3600, [
      get('/characters/{character_id}/roles/', 'character', 3600),
    ]),
    mirrorTables: ['corp_member_roles'],
  },
  {
    name: 'affiliations',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshAffiliationsWithOutcome' },
    ...esi(3600, [
      post('/characters/affiliation/', 'character', 3600),
    ]),
    mirrorTables: ['characters'],
  },
  {
    name: 'market_prices',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'row-stale-after',
    refreshOwner: { kind: 'cron', route: '/api/cron/daily-batch' },
    ttlOverride: {
      milliseconds: 5 * 60 * 1000,
      rationale:
        'On-view reads reuse Neon prices for five minutes, matching the upstream order cache. The nightly backstop has a separate selection window.',
    },
    ...esi(300, [
      get('/markets/{region_id}/orders/', 'global', 300),
    ]),
    mirrorTables: ['market_prices'],
  },
  {
    name: 'market_history',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'expires-boundary',
    refreshOwner: { kind: 'cron', route: null },
    waiver: {
      rule: 'global-cron-names-route',
      rationale:
        'History refreshes on view and persists each response Expires boundary; no cron owns it.',
    },
    notes:
      'The ESI operation declares no static x-cached-seconds; each response supplies Expires.',
    ...esi(null, [
      get('/markets/{region_id}/history/', 'global', null),
    ]),
    mirrorTables: ['market_history', 'market_history_meta'],
  },
  {
    name: 'industry_indices',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'cron-cadence',
    refreshOwner: {
      kind: 'cron',
      route: '/api/cron/daily-batch',
    },
    ...esi(3600, [
      get('/industry/systems/', 'global', 3600),
      get('/markets/prices/', 'global', 3600),
    ]),
    mirrorTables: ['industry_cost_indices', 'adjusted_prices'],
  },
  {
    name: 'eve_status',
    store: 'neon',
    shape: 'global-cron',
    freshnessModel: 'expires-boundary',
    refreshOwner: { kind: 'cron', route: null },
    ...esi(30, [
      { ...get('/status/', 'global', 30), keepBody: true },
    ]),
    waiver: {
      rule: 'global-cron-names-route',
      rationale:
        'Tranquility status is read on view and kept whole in its esi_responses row until CCP\'s Expires; no cron owns it.',
    },
    notes:
      'The server status document is small, so the response store keeps the body in the row itself and no mirror table exists.',
    mirrorTables: [],
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
    routes: [],
    mirrorTables: [
      'eve_categories',
      'eve_groups',
      'eve_types',
      'dgm_attribute_types',
      'type_dogma',
      'industry_blueprints',
      'blueprint_trees',
      'blueprint_flat_materials',
      'industry_target_filters',
      'industry_modifiers',
      'industry_assembly_lines',
      'industry_installation_types',
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
    routes: [],
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
      route: '/api/cron/daily-batch',
    },
    upstream: { kind: 'anoik-statics' },
    routes: [],
    mirrorTables: ['wh_statics_snapshots', 'wh_system_statics'],
    notes:
      'Weekly conditional refresh into an operator-reviewed pending snapshot; serving reads only the promoted copy.',
  },
  {
    name: 'character_sheet_live',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshCharacterSheetsOnView' },
    notes:
      'The 120 s tier of the home board character sheet: attributes, implants, clones and wallet balance are cached 120 s upstream; location, ship and online (5-60 s) are declared at the tier maximum, which stays at or above every upstream. Those three paths are also claimed by the Convex character_location entry (the map tracker); this entry reads them on view for the dashboard at the tier TTL and never feeds the tracker.',
    ...esi(120, [
      get('/characters/{character_id}/location/', 'character', 5),
      get('/characters/{character_id}/ship/', 'character', 5),
      get('/characters/{character_id}/online/', 'character', 60),
      get('/characters/{character_id}/attributes/', 'character', 120),
      get('/characters/{character_id}/implants/', 'character', 120),
      get('/characters/{character_id}/clones/', 'character', 120),
      get('/characters/{character_id}/wallet/', 'character', 120),
    ]),
    mirrorTables: ['character_sheets'],
  },
  {
    name: 'character_sheet_hourly',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshCharacterSheetsOnView' },
    notes:
      'The hourly tier: journal page 1 (digested, never stored raw), open market orders (1200 s upstream, declared at the tier maximum), and the names of player structures a character is docked at or keeps clones in.',
    ...esi(3600, [
      { ...get('/characters/{character_id}/wallet/journal/', 'character', 3600), conditional: false },
      get('/characters/{character_id}/orders/', 'character', 1200),
      UNIVERSE_STRUCTURE_LOOKUP,
    ]),
    mirrorTables: ['character_sheets'],
  },
  {
    name: 'character_sheet_daily',
    store: 'neon',
    shape: 'personal-on-view',
    freshnessModel: 'caller-ttl',
    refreshOwner: { kind: 'entry-point', name: 'refreshCharacterSheetsOnView' },
    notes: 'The daily tier: the public character record (birthday, security status).',
    ...esi(86400, [
      get('/characters/{character_id}/', 'character', 86400),
    ]),
    mirrorTables: ['character_sheets'],
  },
  {
    name: 'character_location',
    store: 'convex',
    shape: 'live',
    freshnessModel: 'engine-cadence',
    refreshOwner: { kind: 'engine', dataset: 'characterLocation' },
    ...esi(5, [
      { ...get('/characters/{character_id}/location/', 'character', 5), mode: 'convex' },
      { ...get('/characters/{character_id}/ship/', 'character', 5), mode: 'convex' },
      { ...get('/characters/{character_id}/online/', 'character', 60), mode: 'convex' },
    ]),
    mirrorTables: [],
  },
] as const satisfies readonly EsiDatasetEntry[];
