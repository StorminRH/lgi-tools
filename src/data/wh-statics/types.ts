/**
 * One normalized statics pair from the feed: a J-space system and one wormhole
 * code it always spawns. `systemName` is retained on the snapshot for operator
 * review; the promoted serving copy stores codes only.
 */
export type WhStaticsEntry = {
  systemId: number;
  systemName: string;
  code: string;
};

/**
 * Pure difference between the promoted copy and an incoming normalized feed.
 * `totalDifferences === 0` is the nothing-to-review signal.
 */
export type StaticsDiff = {
  systemsAdded: number[];
  systemsRemoved: number[];
  systemsChanged: {
    systemId: number;
    before: readonly string[];
    after: readonly string[];
  }[];
  codesAdded: string[];
  codesRemoved: string[];
  totalDifferences: number;
};

/**
 * One per-system disagreement between the feed (via the wormhole codex) and the
 * Pathfinder lineage fixture. Never auto-resolved.
 */
export type StaticsCrossCheckDisagreement = {
  systemId: number;
  feedTypeIds: readonly number[];
  lineageTypeIds: readonly number[];
};

/**
 * Three-way cross-check result stored on each pending snapshot for the review
 * screen. Disagreements are surfaced, never resolved.
 */
export type StaticsCrossCheck = {
  agreedSystems: number;
  disagreements: readonly StaticsCrossCheckDisagreement[];
  lineageOnlySystems: readonly number[];
  feedOnlySystems: readonly number[];
};

/**
 * Promoted serving payload: feed version plus every known system with its
 * static codes, system-id sorted with codes sorted.
 */
export type PromotedStatics = {
  version: string;
  systems: { systemId: number; codes: readonly string[] }[];
};
