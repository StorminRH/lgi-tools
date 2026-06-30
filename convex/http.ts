// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep         — the Vercel watchdog cron's sweep trigger.
//   POST /purge-online  — explicit characterOnline teardown for a Neon-side purge.
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { bearerMatches } from './lib/bearerAuth';

const http = httpRouter();

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
    // The mutation's arg validators (v.string / v.union(v.number, v.null)) are the
    // TYPE boundary — they reject a wrong-typed body. They can't catch a JSON.parse
    // failure though, so guard the parse and return a clean 400 (rather than a 500 +
    // a stack trace in the deployment logs) on a malformed body. The Neon purge does
    // NOT depend on either: the online-status contributor swallows any non-2xx
    // response (best-effort), so a bad body here can never abort the sweep.
    let body: { userId: string; characterId: number | null };
    try {
      body = (await req.json()) as { userId: string; characterId: number | null };
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    const counts = await ctx.runMutation(internal.onlineStatus.purgeForUser, body);
    return Response.json(counts);
  }),
});

export default http;
