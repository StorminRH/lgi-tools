// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep               — the Vercel watchdog cron's sweep trigger.
//   POST /purge-online        — explicit characterOnline teardown for a Neon-side purge.
//   POST /project-map-access  — one-way Neon→Convex mapAccess claim reconcile.
//   POST /purge-map-access    — per-user mapAccess claim teardown for account purge.
import { httpRouter } from 'convex/server';
import { z } from 'zod';
import { MAP_ROLES } from '@/data/maps/access-contract';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { bearerMatches } from './lib/bearerAuth';

const http = httpRouter();

// The inbound purge body's wire contract. The mutation's own arg validators
// would also reject a wrong-typed body, but only by throwing — which surfaced
// as a 500 plus a stack trace in the deployment logs. Validating here returns
// the clean 400 this route already intended for a malformed body.
const purgeOnlineBodySchema = z.object({
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

    let deleted = 0;
    for (;;) {
      const batch = await ctx.runMutation(internal.mapAccessProjection.purgeUserClaims, {
        userId: body.data.userId,
      });
      deleted += batch.deleted;
      if (!batch.hasMore) break;
    }
    return Response.json({ deleted });
  }),
});

export default http;
