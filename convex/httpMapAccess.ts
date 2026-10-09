import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { MAP_ROLES } from '@/data/maps/access-contract';
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

const mapRoleSchema = z.enum(MAP_ROLES);

const projectMapAccessBodySchema = z
  .object({
    mapId: z.string(),
    revision: z.number().int().positive(),
    claims: z.array(
      z.object({
        userId: z.string(),
        roles: z.array(mapRoleSchema).min(1),
        characters: z
          .array(z.object({ characterId: z.number().int().positive(), name: z.string() }))
          .optional(),
      }),
    ),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    for (const [index, claim] of body.claims.entries()) {
      if (seen.has(claim.userId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['claims', index, 'userId'],
          message: 'duplicate userId',
        });
      }
      seen.add(claim.userId);
    }
  });

const purgeMapAccessBodySchema = z.object({
  userId: z.string(),
});

const purgeUserMapClaimsBodySchema = z.object({
  userId: z.string().min(1),
  revision: z.number().int().positive(),
  mapIds: z.array(z.string().min(1)).min(1).max(32),
});

const purgeMapChainBodySchema = z.object({
  mapId: z.string().min(1),
});

const mapTrackingSnapshotBodySchema = z.object({
  mapId: z.string().min(1),
});

export const projectMapAccess: PublicHttpAction = authorizedJsonAction(
  projectMapAccessBodySchema,
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

export const purgeMapAccess: PublicHttpAction = authorizedJsonAction(purgeMapAccessBodySchema, async (ctx, body) => {
  const { deleted, finished } = await drainBatches(() => ctx.runMutation(
    internal.mapAccessProjection.purgeUserClaims,
    { userId: body.userId },
  ));
  return finished ? Response.json({ deleted }) : batchLimitExceeded();
});

export const purgeUserMapClaims: PublicHttpAction = authorizedJsonAction(
  purgeUserMapClaimsBodySchema,
  async (ctx, body) => Response.json(await ctx.runMutation(
    internal.mapAccessProjection.purgeUserMapClaims,
    body,
  )),
);

export const purgeMapChain: PublicHttpAction = authorizedJsonAction(purgeMapChainBodySchema, async (ctx, body) => {
  const { deleted, finished } = await drainBatches(() => ctx.runMutation(
    internal.mapPurge.purgeMapBatch,
    { mapId: body.mapId },
  ));
  return finished ? Response.json({ deleted, remaining: false }) : batchLimitExceeded();
});

/** Service-only freeze and snapshot for the character-scoping backfill. */
export const mapTrackingSnapshot: PublicHttpAction = authorizedJsonAction(
  mapTrackingSnapshotBodySchema,
  async (ctx, body) => Response.json({
    tracked: await ctx.runMutation(internal.mapAccessProjection.freezeMapTrackingForScoping, body),
  }),
);
