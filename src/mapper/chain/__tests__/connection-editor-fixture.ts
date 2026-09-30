import type { Id } from '@/data/convex/data-model';
import { blankDoor, blankHallway } from '@/data/maps/connection-hallway';
import type { ConnectionEditorDetail } from '../connection-detail';

type Overrides = Partial<ConnectionEditorDetail>;
type BlankHallway = ReturnType<typeof blankHallway>;

function fixtureHallway(overrides: Overrides): BlankHallway {
  return blankHallway({
    mapId: 'map-a',
    fromSystemId: overrides.fromSystemId ?? 31_000_001,
    toSystemId: overrides.toSystemId === undefined ? null : overrides.toSystemId,
  });
}

function doorAndMassFields(overrides: Overrides) {
  return {
    from: overrides.from ?? blankDoor(),
    to: overrides.to ?? blankDoor(),
    massState: overrides.massState ?? null,
    shipSize: overrides.shipSize ?? null,
  };
}

function hallwayStateFields(overrides: Overrides, hallway: BlankHallway) {
  return {
    identity: overrides.identity ?? hallway.identity,
    lifetime: overrides.lifetime ?? hallway.lifetime,
    resolution: overrides.resolution ?? hallway.resolution,
    tombstone: overrides.tombstone ?? hallway.tombstone,
  };
}

function observationFields(overrides: Overrides) {
  return {
    firstSeenAt: overrides.firstSeenAt ?? null,
    observedMassKg: overrides.observedMassKg ?? null,
    observedMassAtStateKg: overrides.observedMassAtStateKg ?? null,
  };
}

function optionalFields(overrides: Overrides) {
  return {
    ...(overrides.staticCode === undefined ? {} : { staticCode: overrides.staticCode }),
    ...(overrides.seatOrderAt === undefined ? {} : { seatOrderAt: overrides.seatOrderAt }),
  };
}

export function connectionEditorFixture(
  overrides: Partial<ConnectionEditorDetail> = {},
): ConnectionEditorDetail {
  const hallway = fixtureHallway(overrides);
  return {
    connectionId: (overrides.connectionId ?? 'c1') as Id<'mapConnections'>,
    _creationTime: overrides._creationTime ?? 1,
    fromSystemId: hallway.fromSystemId,
    toSystemId: hallway.toSystemId,
    ...doorAndMassFields(overrides),
    ...hallwayStateFields(overrides, hallway),
    ...observationFields(overrides),
    ...optionalFields(overrides),
  };
}
