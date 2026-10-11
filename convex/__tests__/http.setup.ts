import { convexTest } from 'convex-test';
import { leaveSyncDoor } from '@/data/convex/leave-contract';
import * as locationTrackingDoors from '@/data/location-tracking/convex-doors';
import * as mapDoors from '@/data/maps/convex-doors';
import * as onlineStatusDoors from '@/data/online-status/convex-doors';
import schema from '../schema';
import { modules } from './modules.setup';

export const CONVEX_HTTP_SECRET = 'svc-secret';

/** Every door Next calls, read from the door modules rather than restated. */
export const CONVEX_DOORS = [
  ...Object.values(mapDoors),
  ...Object.values(locationTrackingDoors),
  ...Object.values(onlineStatusDoors),
  leaveSyncDoor,
];

/** The one routed path without a Next caller, and so without a door contract. */
export const CONVEX_ONLY_PATHS = ['/merge-user-state'] as const;

export const postConvexHttp = (
  path: (typeof CONVEX_DOORS)[number]['path'] | (typeof CONVEX_ONLY_PATHS)[number],
  body: BodyInit | null,
  authorized = true,
) =>
  convexTest(schema, modules).fetch(path, {
    method: 'POST',
    ...(authorized ? { headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` } } : {}),
    body,
  });
