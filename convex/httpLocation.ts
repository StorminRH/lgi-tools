import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { internal } from './_generated/api';
import { authorizedJsonAction } from './lib/httpAuth';

const purgeLocationTrackingBodySchema = z.object({
  userId: z.string(),
  characterId: z.number().nullable(),
});

const leaveSyncBodySchema = z.object({
  userId: z.string().min(1),
  dataset: z.literal('characterLocation'),
  tabId: z.string().min(8).max(64),
});

export const leaveSync: PublicHttpAction = authorizedJsonAction(leaveSyncBodySchema, async (ctx, body) => {
  const result = await ctx.runMutation(internal.engineLeave.leave, body);
  return Response.json(result);
});

export const purgeLocationTracking: PublicHttpAction = authorizedJsonAction(
  purgeLocationTrackingBodySchema,
  async (ctx, body) => {
    const counts = await ctx.runMutation(internal.characterLocationPurge.purgeForUser, body);
    return Response.json(counts);
  },
);
