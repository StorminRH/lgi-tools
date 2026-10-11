import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { leaveSyncTabFields } from '@/data/convex/leave-contract';
import { internal } from './_generated/api';
import { authorizedJsonAction, userPurgeBodySchema } from './lib/httpAuth';

const leaveSyncBodySchema = z.object({
  userId: z.string().min(1),
  ...leaveSyncTabFields,
});

export const leaveSync: PublicHttpAction = authorizedJsonAction(leaveSyncBodySchema, async (ctx, body) => {
  const result = await ctx.runMutation(internal.engineLeave.leave, body);
  return Response.json(result);
});

export const purgeLocationTracking: PublicHttpAction = authorizedJsonAction(
  userPurgeBodySchema,
  async (ctx, body) => {
    const counts = await ctx.runMutation(internal.characterLocationPurge.purgeForUser, body);
    return Response.json(counts);
  },
);
