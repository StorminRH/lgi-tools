import { isTombstoned } from '@/data/maps/chain-contract';
import type { LayoutConfig, LayoutFacts } from '../layout/layout-contract';
import type { ChainSnapshot } from './reconciler';

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

// Drop tombstones here. chainSignature only fingerprints ids, so a later filter leaves a ghost.
export function filterLivePages<Row extends { readonly deletedAt?: number | null }>(
  pages: { readonly rows: readonly Row[]; readonly complete: boolean },
): { readonly rows: readonly Row[]; readonly complete: boolean } {
  const live = pages.rows.filter((row) => !isTombstoned(row));
  if (live.length === pages.rows.length) return pages;
  return { rows: live, complete: pages.complete };
}

export function factsFromSnapshot(snapshot: ChainSnapshot): LayoutFacts {
  return {
    systems: snapshot.systems.rows.map((row) => ({ systemId: row.systemId })),
    connections: snapshot.connections.rows.map((row) => ({
      fromSystemId: row.fromSystemId,
      toSystemId: row.toSystemId,
    })),
  };
}

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

export function layoutPostKey(
  signature: string,
  configKey: string,
  revision: number,
  haloKey = '',
  stubKey = '',
): string {
  return `${signature}#${configKey}@${revision}~${haloKey}^${stubKey}`;
}
