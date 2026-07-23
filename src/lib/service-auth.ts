// Shared constant-time bearer check + the bearer-secret route guards (lib,
// importable from anywhere server-side): the internal service routes
// (`authz: service`, CONVEX_SERVICE_SECRET) and the Vercel-cron guard
// (`authz: cron`, CRON_SECRET) both authenticate this way. Lives in lib so the
// cron helper can reuse it without crossing the lib→feature boundary. The
// Convex side keeps its own copy (convex/lib/bearerAuth.ts) — that runtime has
// no node:crypto.
//
// Route-kit dividing rule: auth-AGNOSTIC route plumbing (body parse, rate-limit
// guard, bearer-secret guards) lives here in src/lib beside route-body.ts;
// auth-AWARE guards (session/admin — they need the Better Auth instance) live
// in src/platform/auth/route-guards.ts, because lib may import only lib.
import { createHash, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { readEnv } from '@/lib/env';

/**
 * Constant-time bearer check. Comparing SHA-256 digests (always 32 bytes) keeps
 * timingSafeEqual's equal-length requirement satisfied and leaks no length, so a
 * timing side-channel can't reveal the secret character by character.
 */
export function bearerMatches(authorization: string | null, secret: string): boolean {
  const provided = createHash('sha256').update(authorization ?? '').digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

/**
 * Shared bearer-secret entry guard. Defers to request time (so Cache Components
 * doesn't try to prerender the route), then accepts only a caller presenting
 * `Authorization: Bearer ${secret}`. Returns an error Response to short-circuit
 * the handler — 500 if the secret is unset, 401 for a bad/absent bearer — or
 * null to proceed. One implementation means the check can't drift between the
 * cron and service route families.
 */
export async function requireBearerSecret(
  req: Request,
  envVar: 'CRON_SECRET' | 'CONVEX_SERVICE_SECRET',
): Promise<Response | null> {
  await connection();
  const secret = readEnv(envVar);
  if (!secret) {
    return new Response(`${envVar} not configured`, { status: 500 });
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

/**
 * Guard for the internal service routes (`authz: service`): a Convex action
 * authenticates with the shared CONVEX_SERVICE_SECRET bearer.
 */
export function requireServiceAuth(req: Request): Promise<Response | null> {
  return requireBearerSecret(req, 'CONVEX_SERVICE_SECRET');
}
