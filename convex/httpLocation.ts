import type { PublicHttpAction } from 'convex/server';
import { leaveSyncDoor } from '@/data/convex/leave-contract';
import { purgeLocationTrackingDoor } from '@/data/location-tracking/convex-doors';
import { internal } from './_generated/api';
import { authorizedJsonAction } from './lib/httpAuth';

export const leaveSync: PublicHttpAction = authorizedJsonAction(leaveSyncDoor.request, async (ctx, body) => {
  const result = await ctx.runMutation(internal.engineLeave.leave, body);
  return Response.json(result);
});

export const purgeLocationTracking: PublicHttpAction = authorizedJsonAction(
  purgeLocationTrackingDoor.request,
  async (ctx, body) => {
    const counts = await ctx.runMutation(internal.characterLocationPurge.purgeForUser, body);
    return Response.json(counts);
  },
);
