// HTTP actions — the service door into the deployment (served on the
// .convex.site origin; API port + 1 on a local backend). Bearer-gated by the
// same service secret the deployment already uses to call the Next internal
// endpoints (here verified in the opposite direction):
//   POST /sweep            — the Vercel watchdog cron's sweep trigger.
//   POST /purge-character  — the owner-hash transfer purge's prompt projection
//                            teardown (3.7.1.3), called by the Neon reconcile.
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

http.route({
  path: '/purge-character',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.CONVEX_SERVICE_SECRET;
    if (!secret || !(await bearerMatches(req.headers.get('authorization'), secret))) {
      return new Response('Unauthorized', { status: 401 });
    }
    // Boundary validation: this is a service door, not a trusted internal call.
    const body: unknown = await req.json().catch(() => null);
    const args = parsePurgeArgs(body);
    if (args === null) return new Response('Bad Request', { status: 400 });
    const counts = await ctx.runMutation(internal.purge.purgeCharacter, args);
    return Response.json(counts);
  }),
});

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Validate the purge request body at the boundary. userId must be a non-empty
// string; characterId a positive integer (an EVE character id).
function parsePurgeArgs(body: unknown): { userId: string; characterId: number } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { userId, characterId } = body as Record<string, unknown>;
  if (!isNonEmptyString(userId) || !isPositiveInteger(characterId)) return null;
  return { userId, characterId };
}

export default http;
