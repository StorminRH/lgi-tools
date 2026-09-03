import type { AppFailure } from '@/lib/failure';
import { checkRateLimit } from '@/lib/rate-limit';

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
