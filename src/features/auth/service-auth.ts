// Shared bearer check for the internal service routes (`authz: service`) —
// the endpoints Convex actions call with the CONVEX_SERVICE_SECRET bearer.
import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time bearer check. Comparing SHA-256 digests (always 32 bytes) keeps
// timingSafeEqual's equal-length requirement satisfied and leaks no length, so a
// timing side-channel can't reveal CONVEX_SERVICE_SECRET character by character.
export function bearerMatches(authorization: string | null, secret: string): boolean {
  const provided = createHash('sha256').update(authorization ?? '').digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}
