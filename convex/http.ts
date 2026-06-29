// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep  — the Vercel watchdog cron's sweep trigger.
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { bearerMatches } from './lib/bearerAuth';

const http = httpRouter();

http.route({
  path: '/sweep',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.CONVEX_SERVICE_SECRET;
    if (!secret || !(await bearerMatches(req.headers.get('authorization'), secret))) {
      return new Response('Unauthorized', { status: 401 });
    }
    const counts = await ctx.runMutation(internal.engine.sweep, {});
    return Response.json(counts);
  }),
});

export default http;
