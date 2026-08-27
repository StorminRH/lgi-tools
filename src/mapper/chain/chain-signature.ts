import type { DrainedPages } from '@/data/convex/use-drained-pages';
import { isTombstoned } from '@/data/maps/chain-contract';
import type { LayoutConfig, LayoutFacts } from '../layout/layout-contract';
import type { ChainSnapshot } from './reconciler';

/** The row shapes the signature summarizes, kept minimal so the function stays pure and testable. */
export interface SignatureInput {
  readonly systems: { readonly rows: readonly { readonly systemId: number }[]; readonly complete: boolean };
  readonly connections: {
    readonly rows: readonly {
      readonly _id: string;
      readonly fromSystemId: number;
      readonly toSystemId: number;
      readonly deletedAt?: number | null;
    }[];
    readonly complete: boolean;
  };
}

/**
 * A content fingerprint of both collections, used to decide whether a merge is warranted.
 *
 * Content, never array identity: the subscription hooks hand back fresh arrays and a fresh wrapper
 * object on every render, so an identity comparison would re-merge forever — replaying every intent
 * continuously, which sub-version 4.0.3.2 would bind animations to. Exported so that stability is a
 * unit test rather than a property nothing checks; the separators cannot occur in numeric system ids
 * or Convex document ids, so no distinct content collides.
 *
 * Systems are live-only while connections include structural tombstones. The
 * connection liveness bit makes a tombstone/restore patch trigger one merge
 * without making ordinary detail-field patches re-run layout.
 */
export function chainSignature(
  systems: SignatureInput['systems'],
  connections: SignatureInput['connections'],
): string {
  return [
    systems.complete,
    systems.rows.map((row) => row.systemId).join(','),
    connections.complete,
    connections.rows
      .map(
        (row) =>
          `${row._id}:${isTombstoned(row) ? 0 : 1}:${row.fromSystemId}>${row.toSystemId}`,
      )
      .join(','),
  ].join('#');
}

/**
 * Drops tombstoned rows while preserving page completeness and relative order.
 *
 * Runs upstream of {@link chainSignature}: the signature fingerprints only ids
 * and completeness, so filtering anywhere downstream would leave a ghost on
 * canvas until an unrelated change.
 */
export function filterLivePages<Row extends { readonly deletedAt?: number | null }>(
  pages: DrainedPages<Row>,
): DrainedPages<Row> {
  const live = pages.rows.filter((row) => !isTombstoned(row));
  if (live.length === pages.rows.length) return pages;
  return { rows: live, complete: pages.complete };
}

/** Keeps every connection row, including structural dying/skeleton ties. */
export function filterChainConnections<Row>(
  pages: DrainedPages<Row>,
): DrainedPages<Row> {
  return pages;
}

/**
 * Layout facts from a snapshot's server-ordered rows — never from reconciled
 * arrival order. Array position IS creation order for the kernel.
 */
export function factsFromSnapshot(snapshot: ChainSnapshot): LayoutFacts {
  return {
    systems: snapshot.systems.rows.map((row) => ({ systemId: row.systemId })),
    connections: snapshot.connections.rows.map((row) => ({
      fromSystemId: row.fromSystemId,
      toSystemId: row.toSystemId,
    })),
  };
}

/**
 * Stable fingerprint of dial state — part of the posted key. Exhaustive by
 * type: adding a `LayoutConfig` field without fingerprinting it here is a
 * compile error, because an unfingerprinted dial would commit state that never
 * changes the posted key — a silent no-op dial.
 */
export function layoutConfigKey(config: LayoutConfig): string {
  const parts = {
    ringSpacing: config.ringSpacing,
    minSeparation: config.minSeparation,
    wedgePolicy: config.wedgePolicy,
    siblingSpread: config.siblingSpread,
    directionSequence: config.directionSequence.join(','),
  } satisfies Record<keyof LayoutConfig, string | number>;
  return Object.values(parts).join('|');
}

/**
 * Posted key: chain content, dial fingerprint, the re-lock revision bump, and
 * the halo/stub fingerprints. Both derived components are structural layout input, not
 * motion or fog state (the HC-4 rule stands): the adjacency asset landing
 * changes the facts the kernel must place without changing the authored
 * signature, and an unfingerprinted halo would silently never re-post.
 */
export function layoutPostKey(
  signature: string,
  configKey: string,
  revision: number,
  haloKey = '',
  stubKey = '',
): string {
  return `${signature}#${configKey}@${revision}~${haloKey}^${stubKey}`;
}
