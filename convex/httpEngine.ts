import type { PublicHttpAction } from 'convex/server';
import { internal } from './_generated/api';
import { authorizedJsonAction, userPurgeBodySchema } from './lib/httpAuth';

export const purgeOnline: PublicHttpAction = authorizedJsonAction(userPurgeBodySchema, async (ctx, body) => {
  const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body);
  return Response.json(counts);
});
