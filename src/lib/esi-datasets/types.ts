/**
 * The upstream a dataset is fed from. ESI upstreams carry no cache time of
 * their own: every stored answer expires when CCP's Expires says, through
 * the response store, and the route declarations carry CCP's published
 * fallback. Non-ESI upstreams are exempt from ESI expiry rules, but not
 * placement rules.
 */
export type EsiUpstream =
  | { kind: 'esi' }
  | { kind: 'ccp-sde-manifest' }
  | { kind: 'google-gsc' }
  | { kind: 'anoik-statics' };

export type EsiGateRuleId =
  | 'global-cron-names-route'
  | 'personal-backstop-names-route'
  | 'personal-names-owner';

/** Whose Neon rows a route's answers belong to: the identity of the stored rows, not of the token. */
export type EsiRouteHolder = 'character' | 'corporation' | 'user-corporation' | 'global';

/**
 * The holder of one stored answer. Corp industry jobs are stored per user
 * and corporation, so a `user-corporation` holder names both; otherwise one
 * member's refresh would mark another member's rows as fresh.
 */
export type EsiHolder =
  | { kind: 'global' }
  | { kind: 'character'; id: number }
  | { kind: 'corporation'; id: number }
  | { kind: 'user-corporation'; id: number; userId: string };

/**
 * One ESI route a dataset reads, declared once so the response store can
 * key, expire and purge it. `stored` routes (the default) go through the
 * store and keep CCP's Expires and ETag in esi_responses; `pass-through`
 * routes always call and record nothing; `convex` routes belong to the map
 * tracker, which keeps its own schedule, and the store refuses them.
 * `conditional: false` never sends If-None-Match (the wallet journal is
 * digested, never stored raw). `keepBody` keeps small whole documents in
 * the row itself (the server status). `specCacheSeconds` is CCP's published
 * cache time from the OpenAPI spec (x-server-cache-ttl, or x-client-cache-ttl
 * where the server cache is event-based); an answer with no Expires falls
 * back to it, and null means such an answer is due at once.
 */
export type EsiRouteDeclaration = {
  route: string;
  method: 'GET' | 'POST';
  holder: EsiRouteHolder;
  specCacheSeconds: number | null;
  mode?: 'stored' | 'pass-through' | 'convex';
  conditional?: false;
  keepBody?: true;
};

export type EsiDatasetCommon = {
  name: string;
  upstream: EsiUpstream;
  routes: readonly EsiRouteDeclaration[];
  mirrorTables: readonly string[];
  derivedClientAssets?: readonly {
    name: string;
    route: string;
    placement: 'versioned-immutable-route';
    refresh: 'sde-refresh-cron-tag-bust';
  }[];
  waiver?: {
    rule: EsiGateRuleId;
    rationale: string;
  };
  notes?: string;
};

export type GlobalCronDataset = EsiDatasetCommon & {
  store: 'neon';
  shape: 'global-cron';
  refreshOwner: {
    kind: 'cron';
    route: string | null;
  };
};

export type PersonalOnViewDataset = EsiDatasetCommon & {
  store: 'neon';
  shape: 'personal-on-view';
  refreshOwner: {
    kind: 'entry-point';
    name: string;
  };
  cronBackstopRoute?: string;
};

export type LiveDataset = EsiDatasetCommon & {
  store: 'convex';
  shape: 'live';
  refreshOwner: {
    kind: 'engine';
    dataset: string;
  };
};

/**
 * Searches and id or name resolvers: every route is pass-through, so
 * nothing is stored, nothing expires and nobody owns a refresh. They are
 * declared so the store can key them and the downtime halt covers them.
 */
export type LookupDataset = EsiDatasetCommon & {
  store: 'none';
  shape: 'lookup';
};

export type EsiDatasetEntry =
  | GlobalCronDataset
  | PersonalOnViewDataset
  | LiveDataset
  | LookupDataset;
