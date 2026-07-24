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
import {
  type AppFailure,
  unauthenticatedFailure,
  unexpectedFailure,
} from '@/lib/failure';
import { problemResponse } from '@/lib/problem';

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

/** Checks one bearer secret without constructing an HTTP response. */
export async function checkBearerSecret(
  req: Request,
  envVar: 'CRON_SECRET' | 'CONVEX_SERVICE_SECRET',
): Promise<{ ok: true } | { ok: false; failure: AppFailure }> {
  await connection();
  const secret = readEnv(envVar);
  if (!secret) {
    return {
      ok: false,
      failure: unexpectedFailure(
        'not_configured',
        undefined,
        `${envVar} not configured`,
      ),
    };
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true };
}

/**
 * Shared bearer-secret entry guard. Defers to request time (so Cache Components
 * doesn't try to prerender the route), then accepts only a caller presenting
 * `Authorization: Bearer ${secret}`. Returns a mapped problem response to
 * short-circuit the handler — 500 if the secret is unset, 401 for a bad or
 * absent bearer — or null to proceed.
 */
export async function requireBearerSecret(
  req: Request,
  envVar: 'CRON_SECRET' | 'CONVEX_SERVICE_SECRET',
): Promise<Response | null> {
  const result = await checkBearerSecret(req, envVar);
  return result.ok ? null : problemResponse(result.failure);
}
