import { checkBearerSecret } from '@/lib/service-auth';
import { problemResponse } from './api-response';

export async function requireBearerSecret(
  req: Request,
  envVar: 'CRON_SECRET' | 'CONVEX_SERVICE_SECRET',
): Promise<Response | null> {
  const result = await checkBearerSecret(req, envVar);
  return result.ok ? null : problemResponse(result.failure);
}

/**
 * Shared Vercel-cron entry guard. Every cron route defers to request time (so
 * Cache Components doesn't try to prerender it) and accepts only Vercel's cron
 * invoker, which sends `Authorization: Bearer ${CRON_SECRET}`. Returns an error
 * Response to short-circuit the handler — 500 if the secret is unset, 401 for a
 * bad/absent bearer — or null to proceed. One implementation means the auth
 * check can't silently drift between routes.
 */
export function requireCronAuth(req: Request): Promise<Response | null> {
  return requireBearerSecret(req, 'CRON_SECRET');
}

export async function swallow(label: string, p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error(label, err);
  }
}
