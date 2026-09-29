import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { internal } from './_generated/api';
import { authorizedJsonAction } from './lib/httpAuth';

const mergeUserStateBodySchema = z
  .object({
    sourceUserId: z.string().min(1),
    survivorUserId: z.string().min(1),
  })
  .refine((body) => body.sourceUserId !== body.survivorUserId, {
    message: 'source and survivor must differ',
  });

export const mergeUserState: PublicHttpAction = authorizedJsonAction(
  mergeUserStateBodySchema,
  async (ctx, body) =>
    Response.json(await ctx.runMutation(internal.accountMerge.mergeUserState, body)),
);


export const snapshotMergeTracking: PublicHttpAction = authorizedJsonAction(
  z.object({ sourceUserId: z.string().min(1) }),
  async (ctx, body) =>
    Response.json(await ctx.runQuery(internal.accountMerge.snapshotMergeTracking, body)),
);

export const restoreMergeTracking: PublicHttpAction = authorizedJsonAction(
  z.object({
    operationId: z.string().min(1),
    survivorUserId: z.string().min(1),
    selections: z.array(z.object({
      mapId: z.string().min(1),
      characterId: z.number().int().positive(),
      lastProcessedTransitionAt: z.number().nonnegative().optional(),
    })).max(1000),
  }),
  async (ctx, body) =>
    Response.json(await ctx.runMutation(internal.accountMerge.restoreMergeTracking, body)),
);
