// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep               — the Vercel watchdog cron's sweep trigger.
//   POST /purge-online             — explicit characterOnline teardown for a Neon-side purge.
//   POST /purge-location-tracking  — characterLocation + mapTracking teardown for a Neon-side purge.
//   POST /project-map-access       — one-way Neon→Convex mapAccess claim reconcile.
//   POST /purge-map-access         — per-user mapAccess claim teardown for account purge.
//   POST /jump-evidence            — one consistent tracked-transition evidence packet.
//   POST /resolve-jump             — one transactional automatic-jump write/answer.
//   POST /signature-elimination    — bounded evidence read or atomic assumed deduction batch.
import { httpRouter } from 'convex/server';
import { z } from 'zod';
import { MAP_ROLES } from '@/data/maps/access-contract';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';
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

http.route({
  path: '/sweep',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const counts = await ctx.runMutation(internal.engine.sweep, {});
    return Response.json(counts);
  }),
});

http.route({
  path: '/jump-evidence',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = jumpEvidenceBodySchema.safeParse(raw);
    if (!body.success) return new Response('Bad Request', { status: 400 });
    if (body.data.mode === 'connection') {
      return Response.json(
        await ctx.runQuery(internal.mapJump.connectionEvidence, {
          userId: body.data.userId,
          mapId: body.data.mapId,
          connectionId: body.data.connectionId as Id<'mapConnections'>,
        }),
      );
    }
    return Response.json(
      await ctx.runQuery(internal.mapJump.jumpEvidence, {
        userId: body.data.userId,
        mapId: body.data.mapId,
        characterId: body.data.characterId,
      }),
    );
  }),
});

http.route({
  path: '/resolve-jump',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = resolveJumpBodySchema.safeParse(raw);
    if (!body.success) return new Response('Bad Request', { status: 400 });

    if (body.data.operation === 'confirm') {
      return Response.json(
        await ctx.runMutation(internal.mapJump.confirmJumpIdentity, {
          userId: body.data.userId,
          mapId: body.data.mapId,
          connectionId: body.data.connectionId as Id<'mapConnections'>,
        }),
      );
    }
    if (body.data.operation === 'reassociate') {
      return Response.json(
        await ctx.runMutation(internal.mapJump.reassociateJumpDestination, {
          userId: body.data.userId,
          mapId: body.data.mapId,
          connectionId: body.data.connectionId as Id<'mapConnections'>,
          targetConnectionId:
            body.data.targetConnectionId as Id<'mapConnections'>,
        }),
      );
    }
    const decision = body.data.decision.kind === 'resolve'
      ? {
          ...body.data.decision,
          candidateId:
            body.data.decision.candidateId as Id<'mapConnections'>,
          candidateIds: body.data.decision.candidateIds as Id<'mapConnections'>[],
          survivors: body.data.decision.survivors as Id<'mapConnections'>[],
        }
      : {
          ...body.data.decision,
          candidateIds: body.data.decision.candidateIds as Id<'mapConnections'>[],
          survivors: body.data.decision.survivors as Id<'mapConnections'>[],
        };
    return Response.json(
      await ctx.runMutation(internal.mapJump.resolveJumpAuthoring, {
        userId: body.data.userId,
        mapId: body.data.mapId,
        characterId: body.data.characterId,
        fromSolarSystemId: body.data.fromSolarSystemId,
        toSolarSystemId: body.data.toSolarSystemId,
        transitionObservedAt: body.data.transitionObservedAt,
        observedShipMassKg: body.data.observedShipMassKg,
        observationKey: body.data.observationKey,
        decision,
      }),
    );
  }),
});

http.route({
  path: '/signature-elimination',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = signatureEliminationBodySchema.safeParse(raw);
    if (!body.success) return new Response('Bad Request', { status: 400 });
    if (body.data.operation === 'evidence') {
      return Response.json(
        await ctx.runQuery(internal.mapScan.eliminationEvidence, {
          userId: body.data.userId,
          mapId: body.data.mapId,
          systemId: body.data.systemId,
        }),
      );
    }
    return Response.json(
      await ctx.runMutation(internal.mapScan.applyEliminationDeductions, {
        userId: body.data.userId,
        mapId: body.data.mapId,
        systemId: body.data.systemId,
        deductions: body.data.deductions.map((deduction) =>
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
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    // Both a JSON.parse failure and a wrong-typed field return the same clean
    // 400 the route already intended, instead of letting the mutation's arg
    // validators throw a 500 with a stack trace into the deployment logs. The
    // Neon purge does NOT depend on either: the online-status contributor
    // swallows any non-2xx response (best-effort), so a bad body here can never
    // abort the sweep.
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = purgeOnlineBodySchema.safeParse(raw);
    if (!body.success) {
      return new Response('Bad Request', { status: 400 });
    }
    const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body.data);
    return Response.json(counts);
  }),
});

http.route({
  path: '/purge-location-tracking',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = purgeLocationTrackingBodySchema.safeParse(raw);
    if (!body.success) {
      return new Response('Bad Request', { status: 400 });
    }
    const counts = await ctx.runMutation(internal.characterLocation.purgeForUser, body.data);
    return Response.json(counts);
  }),
});

http.route({
  path: '/project-map-access',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = projectMapAccessBodySchema.safeParse(raw);
    if (!body.success) {
      return new Response('Bad Request', { status: 400 });
    }
    const counts = await ctx.runMutation(
      internal.mapAccessProjection.reconcileMapClaims,
      body.data,
    );
    if (body.data.claims.length === 0) {
      // Map teardown owns durable exactly-once stamps, but drains them in
      // bounded transactions. A 503 remains idempotently retryable after any
      // completed batches instead of making a large map permanently undeletable.
      for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
        const batch = await ctx.runMutation(internal.mapJumpBookkeeping.purgeForMap, {
          mapId: body.data.mapId,
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
  handler: httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const body = purgeMapAccessBodySchema.safeParse(raw);
    if (!body.success) {
      return new Response('Bad Request', { status: 400 });
    }

    // Cap iterations so a concurrent writer that keeps re-inserting claims cannot
    // hang the HTTP action; purge remains idempotent and safe to retry.
    let deleted = 0;
    for (let batchIndex = 0; batchIndex < MAX_PURGE_BATCHES; batchIndex += 1) {
      const batch = await ctx.runMutation(internal.mapAccessProjection.purgeUserClaims, {
        userId: body.data.userId,
      });
      deleted += batch.deleted;
      if (!batch.hasMore) {
        return Response.json({ deleted });
      }
    }
    return new Response('Purge batch limit exceeded', { status: 503 });
  }),
});

export default http;
