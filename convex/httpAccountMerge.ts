import { z } from 'zod';
import {
  deleteExpiredTrackingReceiptsDoor,
  listExpiredTrackingReceiptsDoor,
  restoreMergeTrackingDoor,
  snapshotMergeTrackingDoor,
} from '@/data/location-tracking/convex-doors';
import type { PublicHttpAction } from 'convex/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
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
  snapshotMergeTrackingDoor.request,
  async (ctx, body) =>
    Response.json(await ctx.runQuery(internal.accountMerge.snapshotMergeTracking, body)),
);

export const restoreMergeTracking: PublicHttpAction = authorizedJsonAction(
  restoreMergeTrackingDoor.request,
  async (ctx, body) =>
    Response.json(await ctx.runMutation(internal.accountMerge.restoreMergeTracking, body)),
);

export const listExpiredTrackingReceipts: PublicHttpAction = authorizedJsonAction(
  listExpiredTrackingReceiptsDoor.request,
  async (ctx, body) =>
    Response.json(await ctx.runQuery(internal.accountMerge.listExpiredTrackingReceipts, body)),
);

export const deleteExpiredTrackingReceipts: PublicHttpAction = authorizedJsonAction(
  deleteExpiredTrackingReceiptsDoor.request,
  async (ctx, body) =>
    Response.json(await ctx.runMutation(internal.accountMerge.deleteExpiredTrackingReceipts, {
      cutoff: body.cutoff,
      receipts: body.receipts.map(({ receiptId, operationId }) => ({
        receiptId: receiptId as Id<'accountMergeTrackingReceipts'>,
        operationId,
      })),
    })),
);
