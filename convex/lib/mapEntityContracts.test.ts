import { type Infer, v } from 'convex/values';
import { expect, expectTypeOf, test } from 'vitest';
import type {
  ConnectionMassState,
  WormholeLifeStage,
  WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { MapRole } from '@/data/maps/access-contract';
import type { ConnectionDoorSide } from '@/data/maps/connection-hallway';
import {
  connectionDoorSideValidator,
  connectionLifetimeValidator,
  currentMapRoleValidator,
  lifeStageValidator,
  mapRoleValidator,
  massStateValidator,
  noteTargetKindValidator,
  shipSizeValidator,
  type NoteTargetKind,
  type StoredMapRole,
} from './mapEntityContracts';

test('the tuple-built enum validators keep the deployed schema members, in order, with null last', () => {
  const lifeStages = [
    v.literal('under_1_day'),
    v.literal('under_4_hours'),
    v.literal('under_1_hour'),
    v.literal('expired'),
  ] as const;

  expect(massStateValidator).toEqual(
    v.union(v.literal('stable'), v.literal('reduced'), v.literal('critical'), v.null()),
  );
  expect(lifeStageValidator).toEqual(v.union(...lifeStages, v.null()));
  expect(connectionLifetimeValidator.members[1]).toEqual(
    v.object({
      kind: v.literal('stage'),
      lifeStage: v.union(...lifeStages),
      observedAt: v.number(),
    }),
  );
  expect(shipSizeValidator).toEqual(
    v.union(v.literal('S'), v.literal('M'), v.literal('L'), v.literal('XL'), v.null()),
  );
  expect(currentMapRoleValidator).toEqual(
    v.union(v.literal('viewer'), v.literal('editor'), v.literal('admin')),
  );
  expect(mapRoleValidator).toEqual(
    v.union(v.literal('viewer'), v.literal('editor'), v.literal('admin'), v.literal('owner')),
  );
  expect(noteTargetKindValidator).toEqual(
    v.union(v.literal('map'), v.literal('system'), v.literal('signature')),
  );
});

test('each enum validator accepts exactly its domain vocabulary', () => {
  expectTypeOf<Infer<typeof connectionDoorSideValidator>>().toEqualTypeOf<ConnectionDoorSide>();
  expectTypeOf<Infer<typeof massStateValidator>>().toEqualTypeOf<ConnectionMassState | null>();
  expectTypeOf<Infer<typeof lifeStageValidator>>().toEqualTypeOf<WormholeLifeStage | null>();
  expectTypeOf<Infer<typeof shipSizeValidator>>().toEqualTypeOf<WormholeSizeClass | null>();
  expectTypeOf<Infer<typeof currentMapRoleValidator>>().toEqualTypeOf<MapRole>();
  expectTypeOf<Infer<typeof mapRoleValidator>>().toEqualTypeOf<StoredMapRole>();
  expectTypeOf<Infer<typeof noteTargetKindValidator>>().toEqualTypeOf<NoteTargetKind>();
});
