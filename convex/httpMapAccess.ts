import type { PublicHttpAction } from 'convex/server';
import {
  mapTrackingSnapshotDoor,
  projectMapAccessDoor,
  purgeMapAccessDoor,
  purgeMapChainDoor,
  purgeUserMapClaimsDoor,
} from '@/data/maps/convex-doors';
import { internal } from './_generated/api';
import { authorizedJsonAction } from './lib/httpAuth';

const MAX_PURGE_BATCHES = 10_000;

/** Runs `step` until a batch reports nothing left; `finished` is false when the cap ran out first. */
async function drainBatches(
  step: () => Promise<{ deleted: number; hasMore: boolean }>,
): Promise<{ deleted: number; finished: boolean }> {
  let deleted = 0;
  for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
    const batch = await step();
    deleted += batch.deleted;
    if (!batch.hasMore) return { deleted, finished: true };
  }
  return { deleted, finished: false };
}

const batchLimitExceeded = (): Response =>
  new Response('Purge batch limit exceeded', { status: 503 });

export const projectMapAccess: PublicHttpAction = authorizedJsonAction(
  projectMapAccessDoor.request,
  async (ctx, body) => {
    const counts = await ctx.runMutation(
      internal.mapAccessProjection.reconcileMapClaims,
      body,
    );
    if (body.claims.length === 0 && counts.outcome !== 'stale') {
      const { finished } = await drainBatches(() => ctx.runMutation(
        internal.mapJumpBookkeeping.purgeForMap,
        { mapId: body.mapId },
      ));
      if (!finished) return batchLimitExceeded();
    }
    return Response.json(counts);
  },
);

export const purgeMapAccess: PublicHttpAction = authorizedJsonAction(purgeMapAccessDoor.request, async (ctx, body) => {
  const { deleted, finished } = await drainBatches(() => ctx.runMutation(
    internal.mapAccessProjection.purgeUserClaims,
    { userId: body.userId },
  ));
  return finished ? Response.json({ deleted }) : batchLimitExceeded();
});

export const purgeUserMapClaims: PublicHttpAction = authorizedJsonAction(
  purgeUserMapClaimsDoor.request,
  async (ctx, body) => Response.json(await ctx.runMutation(
    internal.mapAccessProjection.purgeUserMapClaims,
    body,
  )),
);

export const purgeMapChain: PublicHttpAction = authorizedJsonAction(purgeMapChainDoor.request, async (ctx, body) => {
  const { deleted, finished } = await drainBatches(() => ctx.runMutation(
    internal.mapPurge.purgeMapBatch,
    { mapId: body.mapId },
  ));
  return finished ? Response.json({ deleted, remaining: false }) : batchLimitExceeded();
});

/** Service-only freeze and snapshot for the character-scoping backfill. */
export const mapTrackingSnapshot: PublicHttpAction = authorizedJsonAction(
  mapTrackingSnapshotDoor.request,
  async (ctx, body) => Response.json({
    tracked: await ctx.runMutation(internal.mapAccessProjection.freezeMapTrackingForScoping, body),
  }),
);
