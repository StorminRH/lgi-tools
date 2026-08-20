// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep               — the Vercel watchdog cron's sweep trigger.
//   POST /purge-online             — explicit characterOnline teardown for a Neon-side purge.
//   POST /purge-location-tracking  — characterLocation + mapTracking teardown for a Neon-side purge.
//   POST /project-map-access       — one-way Neon→Convex mapAccess claim reconcile.
//   POST /purge-map-access         — per-user mapAccess claim teardown for account purge.
//   POST /purge-map-chain          — complete bounded collaborative map teardown.
//   POST /jump-evidence            — one consistent tracked-transition evidence packet.
//   POST /resolve-jump             — one transactional automatic-jump write/answer.
//   POST /signature-elimination    — bounded evidence read or atomic assumed deduction batch.
//   POST /leave-sync               — tab-close retire of one user's location subject.
import { httpRouter } from 'convex/server';
import { z } from 'zod';
import { MAP_ROLES } from '@/data/maps/access-contract';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction, type ActionCtx } from './_generated/server';
import { bearerMatches } from './lib/bearerAuth';

const http = httpRouter();
const MAX_PURGE_BATCHES = 10_000;

// The inbound purge body's wire contract. The mutation's own arg validators
// would also reject a wrong-typed body, but only by throwing — which surfaced
// as a 500 plus a stack trace in the deployment logs. Validating here returns
// the clean 400 this route already intended for a malformed body.
const purgeOnlineBodySchema = z.object({
  userId: z.string(),
  characterId: z.number().nullable(),
});

const purgeLocationTrackingBodySchema = z.object({
  userId: z.string(),
  characterId: z.number().nullable(),
});

const leaveSyncBodySchema = z.object({
  userId: z.string().min(1),
  dataset: z.literal('characterLocation'),
  tabId: z.string().min(8).max(64),
});

const mapRoleSchema = z.enum(MAP_ROLES);

// Full-state projection body: one map, the complete desired claim set. Zod rejects
// empty roles and repeated userIds as clean 400s before the mutation runs.
const projectMapAccessBodySchema = z
  .object({
    mapId: z.string(),
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

const jumpEvidenceBodySchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('transition'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    characterId: z.number().int().positive(),
  }),
  z.strictObject({
    mode: z.literal('connection'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    connectionId: z.string().min(1),
  }),
]);

const jumpDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resolve'),
    candidateId: z.string().min(1),
    provenance: z.enum(['jump-verified', 'assumed']),
    candidateIds: z.array(z.string().min(1)),
    survivors: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal('insert'),
    candidateIds: z.array(z.string().min(1)),
    survivors: z.array(z.string().min(1)),
  }),
]);

const resolveJumpBodySchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('author'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    characterId: z.number().int().positive(),
    fromSolarSystemId: z.number().int().positive(),
    toSolarSystemId: z.number().int().positive(),
    transitionObservedAt: z.number().finite(),
    observedShipMassKg: z.number().finite().positive().nullable(),
    observationKey: z.string().min(1),
    decision: jumpDecisionSchema,
  }),
  z.object({
    operation: z.literal('confirm'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    connectionId: z.string().min(1),
  }),
  z.object({
    operation: z.literal('reassociate'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    connectionId: z.string().min(1),
    targetConnectionId: z.string().min(1),
  }),
]);

const eliminationDeductionSchema = z.union([
  z.strictObject({
    signatureId: z.string().min(1),
    typeCode: z.string().min(1),
    provenance: z.literal('assumed'),
  }),
  z.strictObject({
    signatureId: z.string().min(1),
    connectionId: z.string().min(1),
    provenance: z.literal('assumed'),
    expectedTypeCode: z.string().min(1).nullable(),
  }),
]);

const signatureEliminationBodySchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('evidence'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    systemId: z.number().int().positive(),
  }),
  z.strictObject({
    operation: z.literal('apply'),
    userId: z.string().min(1),
    mapId: z.string().min(1),
    systemId: z.number().int().positive(),
    deductions: z.array(eliminationDeductionSchema).min(1),
  }),
]);

// Shared service-auth guard: HTTP actions are bearer-gated by the same secret
// the deployment already holds (verified here in the opposite direction from the
// Next internal endpoints). True only on a valid Bearer match.
async function bearerOk(req: Request): Promise<boolean> {
  const secret = process.env.CONVEX_SERVICE_SECRET;
  if (!secret) return false;
  return bearerMatches(req.headers.get('authorization'), secret);
}

async function readJsonBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function authorizedAction(
  handle: (ctx: ActionCtx, req: Request) => Promise<Response>,
) {
  return httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    return handle(ctx, req);
  });
}

function authorizedJsonAction<T>(
  schema: z.ZodType<T>,
  handle: (ctx: ActionCtx, body: T) => Promise<Response>,
) {
  return authorizedAction(async (ctx, req) => {
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return new Response('Bad Request', { status: 400 });
    return handle(ctx, parsed.data);
  });
}

http.route({
  path: '/sweep',
  method: 'POST',
  handler: authorizedAction(async (ctx) => {
    const counts = await ctx.runMutation(internal.engine.sweep, {});
    return Response.json(counts);
  }),
});

http.route({
  path: '/jump-evidence',
  method: 'POST',
  handler: authorizedJsonAction(jumpEvidenceBodySchema, async (ctx, body) => {
    if (body.mode === 'connection') {
      return Response.json(
        await ctx.runQuery(internal.mapJump.connectionEvidence, {
          userId: body.userId,
          mapId: body.mapId,
          connectionId: body.connectionId as Id<'mapConnections'>,
        }),
      );
    }
    return Response.json(
      await ctx.runQuery(internal.mapJump.jumpEvidence, {
        userId: body.userId,
        mapId: body.mapId,
        characterId: body.characterId,
      }),
    );
  }),
});

http.route({
  path: '/resolve-jump',
  method: 'POST',
  handler: authorizedJsonAction(resolveJumpBodySchema, async (ctx, body) => {
    if (body.operation === 'confirm') {
      return Response.json(
        await ctx.runMutation(internal.mapJump.confirmJumpIdentity, {
          userId: body.userId,
          mapId: body.mapId,
          connectionId: body.connectionId as Id<'mapConnections'>,
        }),
      );
    }
    if (body.operation === 'reassociate') {
      return Response.json(
        await ctx.runMutation(internal.mapJump.reassociateJumpDestination, {
          userId: body.userId,
          mapId: body.mapId,
          connectionId: body.connectionId as Id<'mapConnections'>,
          targetConnectionId: body.targetConnectionId as Id<'mapConnections'>,
        }),
      );
    }
    const decision = body.decision.kind === 'resolve'
      ? {
          ...body.decision,
          candidateId: body.decision.candidateId as Id<'mapConnections'>,
          candidateIds: body.decision.candidateIds as Id<'mapConnections'>[],
          survivors: body.decision.survivors as Id<'mapConnections'>[],
        }
      : {
          ...body.decision,
          candidateIds: body.decision.candidateIds as Id<'mapConnections'>[],
          survivors: body.decision.survivors as Id<'mapConnections'>[],
        };
    return Response.json(
      await ctx.runMutation(internal.mapJump.resolveJumpAuthoring, {
        userId: body.userId,
        mapId: body.mapId,
        characterId: body.characterId,
        fromSolarSystemId: body.fromSolarSystemId,
        toSolarSystemId: body.toSolarSystemId,
        transitionObservedAt: body.transitionObservedAt,
        observedShipMassKg: body.observedShipMassKg,
        observationKey: body.observationKey,
        decision,
      }),
    );
  }),
});

http.route({
  path: '/signature-elimination',
  method: 'POST',
  handler: authorizedJsonAction(signatureEliminationBodySchema, async (ctx, body) => {
    if (body.operation === 'evidence') {
      return Response.json(
        await ctx.runQuery(internal.mapScan.eliminationEvidence, {
          userId: body.userId,
          mapId: body.mapId,
          systemId: body.systemId,
        }),
      );
    }
    return Response.json(
      await ctx.runMutation(internal.mapScan.applyEliminationDeductions, {
        userId: body.userId,
        mapId: body.mapId,
        systemId: body.systemId,
        deductions: body.deductions.map((deduction) =>
          'connectionId' in deduction
            ? {
                ...deduction,
                connectionId: deduction.connectionId as Id<'mapConnections'>,
              }
            : deduction,
        ),
      }),
    );
  }),
});

http.route({
  path: '/purge-online',
  method: 'POST',
  // Both a JSON.parse failure and a wrong-typed field return the same clean
  // 400 the route already intended, instead of letting the mutation's arg
  // validators throw a 500 with a stack trace into the deployment logs. The
  // Neon purge does NOT depend on either: the online-status contributor
  // swallows any non-2xx response (best-effort), so a bad body here can never
  // abort the sweep.
  handler: authorizedJsonAction(purgeOnlineBodySchema, async (ctx, body) => {
    const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body);
    return Response.json(counts);
  }),
});

http.route({
  path: '/leave-sync',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = leaveSyncBodySchema.safeParse(raw);
    if (!body.success) return new Response('Bad Request', { status: 400 });
    const result = await ctx.runMutation(internal.engine.leave, body.data);
    return Response.json(result);
  }),
});

http.route({
  path: '/purge-location-tracking',
  method: 'POST',
  handler: authorizedJsonAction(purgeLocationTrackingBodySchema, async (ctx, body) => {
    const counts = await ctx.runMutation(internal.characterLocation.purgeForUser, body);
    return Response.json(counts);
  }),
});

http.route({
  path: '/project-map-access',
  method: 'POST',
  handler: authorizedJsonAction(projectMapAccessBodySchema, async (ctx, body) => {
    const counts = await ctx.runMutation(
      internal.mapAccessProjection.reconcileMapClaims,
      body,
    );
    if (body.claims.length === 0) {
      // Map teardown owns durable exactly-once stamps, but drains them in
      // bounded transactions. A 503 remains idempotently retryable after any
      // completed batches instead of making a large map permanently undeletable.
      for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
        const batch = await ctx.runMutation(internal.mapJumpBookkeeping.purgeForMap, {
          mapId: body.mapId,
        });
        if (!batch.hasMore) return Response.json(counts);
      }
      return new Response('Purge batch limit exceeded', { status: 503 });
    }
    return Response.json(counts);
  }),
});

http.route({
  path: '/purge-map-access',
  method: 'POST',
  handler: authorizedJsonAction(purgeMapAccessBodySchema, async (ctx, body) => {
    // Cap iterations so a concurrent writer that keeps re-inserting claims cannot
    // hang the HTTP action; purge remains idempotent and safe to retry.
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
  }),
});

http.route({
  path: '/purge-map-chain',
  method: 'POST',
  handler: authorizedJsonAction(purgeMapChainBodySchema, async (ctx, body) => {
    let deleted = 0;
    for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
      const batch = await ctx.runMutation(internal.mapPurge.purgeMapBatch, {
        mapId: body.mapId,
      });
      deleted += batch.deleted;
      if (!batch.hasMore) return Response.json({ deleted, remaining: false });
    }
    return new Response('Purge batch limit exceeded', { status: 503 });
  }),
});

export default http;
