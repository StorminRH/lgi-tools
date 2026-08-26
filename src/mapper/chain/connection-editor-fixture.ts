import type { Id } from '@/data/convex/data-model';
import { blankDoor, blankHallway } from '@/data/maps/connection-hallway';
import type { ConnectionEditorDetail } from './use-map-chain';

/** Blank hallway-shaped editor detail for unit tests. */
export function connectionEditorFixture(
  overrides: Partial<ConnectionEditorDetail> = {},
): ConnectionEditorDetail {
  const hallway = blankHallway({
    mapId: 'map-a',
    fromSystemId: overrides.fromSystemId ?? 31_000_001,
    toSystemId: overrides.toSystemId === undefined ? null : overrides.toSystemId,
  });
  return {
    connectionId: (overrides.connectionId ?? 'c1') as Id<'mapConnections'>,
    _creationTime: overrides._creationTime ?? 1,
    fromSystemId: hallway.fromSystemId,
    toSystemId: hallway.toSystemId,
    from: overrides.from ?? blankDoor(),
    to: overrides.to ?? blankDoor(),
    massState: overrides.massState ?? null,
    shipSize: overrides.shipSize ?? null,
    identity: overrides.identity ?? hallway.identity,
    lifetime: overrides.lifetime ?? hallway.lifetime,
    resolution: overrides.resolution ?? hallway.resolution,
    tombstone: overrides.tombstone ?? hallway.tombstone,
    firstSeenAt: overrides.firstSeenAt ?? null,
    observedMassKg: overrides.observedMassKg ?? null,
    observedMassAtStateKg: overrides.observedMassAtStateKg ?? null,
  };
}
