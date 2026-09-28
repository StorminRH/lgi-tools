import type {
  ConnectionMassState,
  WormholeDestinationHint,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import { typedDoorsFrom } from '@/data/maps/connection-door-types';
import {
  blankHallway,
  identityFromDoors,
  leadsToFromHint,
  type ConnectionHallway,
} from '@/data/maps/connection-hallway';

export type HallwayFixture = {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly wormholeTypeCode: string | null;
  readonly shipSize: WormholeSizeClass | null;
} & (
  | {
      readonly kind: 'connected';
      readonly toSystemId: number;
      readonly massState: ConnectionMassState | null;
    }
  | {
      readonly kind: 'unresolved';
      readonly toSystemId: null;
      readonly fromSignatureId: string;
      readonly fromDestinationHint?: WormholeDestinationHint;
    }
);

export function hallwayFromFixture(args: HallwayFixture): ConnectionHallway {
  const doors = typedDoorsFrom('from', args.wormholeTypeCode);
  return {
    ...blankHallway({
      mapId: args.mapId,
      fromSystemId: args.fromSystemId,
      toSystemId: args.toSystemId,
    }),
    from: args.kind === 'unresolved'
      ? {
          ...doors.from,
          signatureId: args.fromSignatureId,
          leadsTo: leadsToFromHint(args.fromDestinationHint),
        }
      : doors.from,
    to: doors.to,
    identity: identityFromDoors(
      doors.from.typeCode,
      doors.to.typeCode,
      args.wormholeTypeCode === null ? null : 'human',
    ),
    massState: args.kind === 'connected' ? args.massState : null,
    shipSize: args.shipSize,
  };
}
