import type { PublicHttpAction } from 'convex/server';
import { purgeOnlineDoor } from '@/data/online-status/convex-doors';
import { internal } from './_generated/api';
import { authorizedJsonAction } from './lib/httpAuth';

export const purgeOnline: PublicHttpAction = authorizedJsonAction(purgeOnlineDoor.request, async (ctx, body) => {
  const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body);
  return Response.json(counts);
});
