// Shared constant-time bearer check + the failure-returning bearer-secret core
// (lib, importable from anywhere server-side): the internal service routes
// (`authz: service`, CONVEX_SERVICE_SECRET) and the Vercel-cron guard
// (`authz: cron`, CRON_SECRET) both authenticate this way. The Convex side keeps
// its own copy (convex/lib/bearerAuth.ts) — that runtime has no node:crypto.
//
// This module returns typed failures and never constructs a Response: mapping a
// failure to a problem response now belongs to src/transport/api-response.ts,
// which reads the ambient correlation id, and lib may not import transport. The
// response-building wrapper `requireBearerSecret` therefore lives beside its
// only caller in src/transport/cron.ts.
//
// Route-kit dividing rule: auth-AGNOSTIC route plumbing (body parse, rate-limit
// guard, bearer-secret checks) lives here in src/lib beside route-body.ts;
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
    console.error('[service-auth] missing required environment variable', envVar);
    return {
      ok: false,
      failure: unexpectedFailure(
        'not_configured',
        undefined,
        'service authentication is not configured',
      ),
    };
  }
  if (!bearerMatches(req.headers.get('authorization'), secret)) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true };
}
