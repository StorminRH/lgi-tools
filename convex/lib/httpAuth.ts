import { z } from 'zod';
import type { PublicHttpAction } from 'convex/server';
import { bearerMatches } from '@/lib/bearer';
import { readEnv } from '@/lib/env';
import { httpAction, type ActionCtx } from '../_generated/server';

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
    const secret = readEnv('CONVEX_SERVICE_SECRET');
    if (secret === undefined) {
      console.error('[httpAuth] CONVEX_SERVICE_SECRET is not set on this Convex deployment');
      return new Response('Service authentication is not configured', { status: 500 });
    }
    if (!(await bearerMatches(req.headers.get('authorization'), secret))) {
      return new Response('Unauthorized', { status: 401 });
    }
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
