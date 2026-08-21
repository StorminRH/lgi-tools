import type { AppFailure } from '@/lib/failure';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Mutation-shell preflight that checks one named per-IP bucket and maps a
 * denial through the route's own 429 response. Lib stays Response-free.
 */
export function rateLimitPreflight(
  request: Request,
  options: { readonly name: string; readonly perMinute: number },
  onLimited: (failure: AppFailure) => Response,
): () => Promise<Response | null> {
  return async () => {
    const limit = await checkRateLimit(request, options);
    return limit.ok ? null : onLimited(limit.failure);
  };
}
