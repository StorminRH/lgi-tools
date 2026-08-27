import type { Doc, Id } from '@/data/convex/data-model';
import { isTombstoned } from '@/data/maps/chain-contract';
import type { ConnectionHallway } from '@/data/maps/connection-hallway';

export type ConnectionEditorDetail = Readonly<
  Omit<
    ConnectionHallway,
    | 'mapId'
    | 'observationKey'
    | 'firstSeenAt'
    | 'observedMassKg'
    | 'observedMassAtStateKg'
  >
> & {
  readonly connectionId: Id<'mapConnections'>;
  readonly _creationTime: number;
  readonly firstSeenAt: number | null;
  readonly observedMassKg: number | null;
  readonly observedMassAtStateKg: number | null;
};

/** A resolved connection whose destination can anchor the canvas details card. */
export interface ConnectionDetail extends ConnectionEditorDetail {
  readonly toSystemId: number;
}

function connectionEditorDetail(
  row: Doc<'mapConnections'>,
): ConnectionEditorDetail {
  return {
    connectionId: row._id,
    _creationTime: row._creationTime,
    fromSystemId: row.fromSystemId,
    toSystemId: row.toSystemId,
    from: row.from,
    to: row.to,
    massState: row.massState,
    shipSize: row.shipSize,
    identity: row.identity,
    lifetime: row.lifetime,
    resolution: row.resolution,
    tombstone: row.tombstone,
    firstSeenAt: optionalOrNull(row.firstSeenAt),
    observedMassKg: optionalOrNull(row.observedMassKg),
    observedMassAtStateKg: optionalOrNull(row.observedMassAtStateKg),
  };
}

function optionalOrNull<Value>(value: Value | null | undefined): Value | null {
  return value ?? null;
}

/** Projects subscribed connection documents into the stable card-detail map. */
export function connectionDetailsFromRows(
  rows: readonly Doc<'mapConnections'>[],
): ReadonlyMap<Id<'mapConnections'>, ConnectionDetail> {
  const details = new Map<Id<'mapConnections'>, ConnectionDetail>();
  for (const row of rows) {
    // The public subscription is resolved-only; keep this projection guarded
    // as a second boundary for direct/test callers holding a schema-wide Doc.
    if (row.toSystemId === null) continue;
    details.set(row._id, connectionEditorDetail(row) as ConnectionDetail);
  }
  return details;
}

/** One scanned-but-unexplored wormhole slot, projected for prompt labeling. */
export interface UnresolvedHoleSummary extends ConnectionEditorDetail {
  readonly toSystemId: null;
}

/** Projects subscribed unresolved-slot documents into stable prompt summaries. */
export function unresolvedHolesFromRows(
  rows: readonly Doc<'mapConnections'>[],
): readonly UnresolvedHoleSummary[] {
  return rows
    .filter((row) => row.toSystemId === null && !isTombstoned(row))
    .map((row) => connectionEditorDetail(row) as UnresolvedHoleSummary);
}
