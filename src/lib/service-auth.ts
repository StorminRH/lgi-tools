import { createHash, timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { readEnv } from '@/lib/env';
import {
  type AppFailure,
  unauthenticatedFailure,
  unexpectedFailure,
} from '@/lib/failure';

export function bearerMatches(authorization: string | null, secret: string): boolean {
  const provided = createHash('sha256').update(authorization ?? '').digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

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
