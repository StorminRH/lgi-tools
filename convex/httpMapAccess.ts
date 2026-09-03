import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { MAP_ROLES } from '@/data/maps/access-contract';
import { internal } from './_generated/api';
import { authorizedJsonAction } from './lib/httpAuth';

const MAX_PURGE_BATCHES = 10_000;

const mapRoleSchema = z.enum(MAP_ROLES);

const projectMapAccessBodySchema = z
  .object({
    mapId: z.string(),
    revision: z.number().int().positive(),
    claims: z.array(
      z.object({
        userId: z.string(),
        roles: z.array(mapRoleSchema).min(1),
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

const purgeMapChainBodySchema = z.object({
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
      for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
        const batch = await ctx.runMutation(internal.mapJumpBookkeeping.purgeForMap, {
          mapId: body.mapId,
        });
        if (!batch.hasMore) return Response.json(counts);
      }
      return new Response('Purge batch limit exceeded', { status: 503 });
    }
    return Response.json(counts);
  },
);

export const purgeMapAccess: PublicHttpAction = authorizedJsonAction(purgeMapAccessBodySchema, async (ctx, body) => {
  let deleted = 0;
  for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
    const batch = await ctx.runMutation(internal.mapAccessProjection.purgeUserClaims, {
      userId: body.userId,
    });
    deleted += batch.deleted;
    if (!batch.hasMore) {
      return Response.json({ deleted });
    }
  }
  return new Response('Purge batch limit exceeded', { status: 503 });
});

export const purgeMapChain: PublicHttpAction = authorizedJsonAction(purgeMapChainBodySchema, async (ctx, body) => {
  let deleted = 0;
  for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
    const batch = await ctx.runMutation(internal.mapPurge.purgeMapBatch, {
      mapId: body.mapId,
    });
    deleted += batch.deleted;
    if (!batch.hasMore) return Response.json({ deleted, remaining: false });
  }
  return new Response('Purge batch limit exceeded', { status: 503 });
});
