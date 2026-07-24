// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep         — the Vercel watchdog cron's sweep trigger.
//   POST /purge-online  — explicit characterOnline teardown for a Neon-side purge.
import { httpRouter } from 'convex/server';
import { z } from 'zod';
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

// Shared service-auth guard: both HTTP actions are bearer-gated by the same secret
// the deployment already holds (verified here in the opposite direction from the
// Next internal endpoints). True only on a valid Bearer match.
async function bearerOk(req: Request): Promise<boolean> {
  const secret = process.env.CONVEX_SERVICE_SECRET;
  if (!secret) return false;
  return bearerMatches(req.headers.get('authorization'), secret);
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
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    const body = purgeOnlineBodySchema.safeParse(raw);
    if (!body.success) {
      return new Response('Bad Request', { status: 400 });
    }
    const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body.data);
    return Response.json(counts);
  }),
});

export default http;
