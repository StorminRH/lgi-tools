import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { httpAction, type ActionCtx } from '../_generated/server';
import { bearerMatches } from './bearerAuth';

// Mutation arg validators throw, and Convex HTTP maps that throw to 500.
// Zod here returns the 400 this door intended for a malformed body.

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

export function authorizedAction(
  handle: (ctx: ActionCtx, req: Request) => Promise<Response>,
): PublicHttpAction {
  return httpAction(async (ctx, req) => {
    if (!(await bearerOk(req))) return new Response('Unauthorized', { status: 401 });
    return handle(ctx, req);
  });
}

export function authorizedJsonAction<T>(
  schema: z.ZodType<T>,
  handle: (ctx: ActionCtx, body: T) => Promise<Response>,
): PublicHttpAction {
  return authorizedAction(async (ctx, req) => {
    const raw = await readJsonBody(req);
    if (raw === null) return new Response('Bad Request', { status: 400 });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return new Response('Bad Request', { status: 400 });
    return handle(ctx, parsed.data);
  });
}
