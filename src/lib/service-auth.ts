import { connection } from 'next/server';
import { bearerMatches } from '@/lib/bearer';
import { readEnv } from '@/lib/env';
import {
  type CheckResult,
  unauthenticatedFailure,
  unexpectedFailure,
} from '@/lib/failure';

export async function checkBearerSecret(
  req: Request,
  envVar: 'CRON_SECRET' | 'CONVEX_SERVICE_SECRET',
): Promise<CheckResult> {
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
  if (!(await bearerMatches(req.headers.get('authorization'), secret))) {
    return { ok: false, failure: unauthenticatedFailure() };
  }
  return { ok: true };
}
