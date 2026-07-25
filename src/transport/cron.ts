import { checkBearerSecret } from '@/lib/service-auth';
import { problemResponse } from './api-response';

/**
 * Shared bearer-secret entry guard. Defers to request time (so Cache Components
 * doesn't try to prerender the route), then accepts only a caller presenting
 * `Authorization: Bearer ${secret}`. Returns a mapped problem response to
 * short-circuit the handler — 500 if the secret is unset, 401 for a bad or
 * absent bearer — or null to proceed. Lives here rather than beside
 * `checkBearerSecret` in src/lib because building a problem response now reads
 * the ambient correlation id from transport, and lib may not import transport.
 */
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

/**
 * Awaits a fire-and-forget side effect, swallowing failures so observability
 * can never break the cron, and awaiting so the write lands before the
 * serverless function freezes on return.
 */
export async function swallow(label: string, p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error(label, err);
  }
}
