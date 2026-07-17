/**
 * The upstream a dataset is fed from. ESI upstreams carry the hand-verified
 * cache time and the spec path(s) it was read from at esi.evetech.net/ui/.
 * `verifiedCacheSeconds` is null only when the operation declares no static
 * window and freshness comes from its response Expires header. Non-ESI
 * upstreams are exempt from ESI cache-time rules, but not placement rules.
 */
type EsiUpstream =
  | {
      kind: 'esi';
      specPaths: readonly string[];
      verifiedCacheSeconds: number | null;
    }
  | { kind: 'ccp-sde-manifest' }
  | { kind: 'google-gsc' };

/**
 * The rules an entry may carry a waiver against. A waiver names exactly one
 * rule: recorded debt rather than a blanket exception.
 */
export type EsiGateRuleId =
  | 'convex-cache-bound'
  | 'global-cron-names-route'
  | 'personal-backstop-names-route'
  | 'personal-names-owner'
  | 'ttl-at-least-upstream';

type EsiDatasetCommon = {
  name: string;
  upstream: EsiUpstream;
  mirrorTables: readonly string[];
  ttlOverride?: {
    milliseconds: number;
    rationale: string;
  };
  waiver?: {
    rule: EsiGateRuleId;
    rationale: string;
  };
  notes?: string;
};

type GlobalCronDataset = EsiDatasetCommon & {
  store: 'neon';
  shape: 'global-cron';
  freshnessModel: 'row-stale-after' | 'expires-boundary' | 'cron-cadence';
  refreshOwner: {
    kind: 'cron';
    route: string | null;
  };
};

type PersonalOnViewDataset = EsiDatasetCommon & {
  store: 'neon';
  shape: 'personal-on-view';
  freshnessModel: 'caller-ttl';
  refreshOwner:
    | {
        kind: 'deferred-queue';
        dataset: string;
      }
    | {
        kind: 'entry-point';
        name: string;
      };
  cronBackstopRoute?: string;
};

type LiveDataset = EsiDatasetCommon & {
  store: 'convex';
  shape: 'live';
  freshnessModel: 'engine-cadence';
  refreshOwner: {
    kind: 'engine';
    dataset: string;
  };
  collaborative?: boolean;
};

/**
 * One declaration per externally fed dataset: where it lives, how fresh it
 * must be, and who refreshes it. The shape discriminant pairs each placement
 * with its legal freshness model and owner reference. World references remain
 * names so this leaf imports nothing; the junction validator cross-checks them
 * against live tables, routes, queue handles, entry points, and engine keys.
 */
export type EsiDatasetEntry =
  | GlobalCronDataset
  | PersonalOnViewDataset
  | LiveDataset;

/**
 * Returns the dataset's effective static staleness window in milliseconds:
 * the declared override when present, otherwise the verified upstream ESI
 * cache time. Expires-boundary and cron-cadence models return null because
 * their row or schedule owns freshness instead of a fixed TTL. Engine-cadence
 * returns the upstream window so the junction gate can verify its cadence
 * floor; runtime callers do not consume it as a staleness TTL.
 */
export function effectiveTtlMs(entry: EsiDatasetEntry): number | null {
  if (
    entry.freshnessModel === 'expires-boundary'
    || entry.freshnessModel === 'cron-cadence'
  ) {
    return null;
  }
  if (entry.ttlOverride !== undefined) {
    return entry.ttlOverride.milliseconds;
  }
  if (entry.upstream.kind !== 'esi' || entry.upstream.verifiedCacheSeconds === null) {
    return null;
  }
  return entry.upstream.verifiedCacheSeconds * 1000;
}
