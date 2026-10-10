import type { Infer } from 'convex/values';
import { expectTypeOf, test } from 'vitest';
import type { ConnectionDoorSide } from '@/data/maps/connection-hallway';
import { connectionDoorSideValidator } from './mapEntityContracts';

test('the door-side validator accepts exactly the connection door sides', () => {
  expectTypeOf<Infer<typeof connectionDoorSideValidator>>().toEqualTypeOf<ConnectionDoorSide>();
});
