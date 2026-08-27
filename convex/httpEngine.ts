import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { internal } from './_generated/api';
import { authorizedAction, authorizedJsonAction } from './lib/httpAuth';

const purgeOnlineBodySchema = z.object({
  userId: z.string(),
  characterId: z.number().nullable(),
});

export const sweep: PublicHttpAction = authorizedAction(async (ctx) => {
  const counts = await ctx.runMutation(internal.engineSweep.sweep, {});
  return Response.json(counts);
});

export const purgeOnline: PublicHttpAction = authorizedJsonAction(purgeOnlineBodySchema, async (ctx, body) => {
  const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body);
  return Response.json(counts);
});
