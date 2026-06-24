// Shared constant-time bearer check (lib, importable from anywhere server-side):
// the internal service routes (`authz: service`, CONVEX_SERVICE_SECRET) and the
// Vercel-cron guard (`authz: cron`, CRON_SECRET) both authenticate this way.
// Lives in lib so the cron helper can reuse it without crossing the lib→feature
// boundary. The Convex side keeps its own copy (convex/lib/bearerAuth.ts) — that
// runtime has no node:crypto.
import { createHash, timingSafeEqual } from 'node:crypto';

// Constant-time bearer check. Comparing SHA-256 digests (always 32 bytes) keeps
// timingSafeEqual's equal-length requirement satisfied and leaks no length, so a
// timing side-channel can't reveal the secret character by character.
export function bearerMatches(authorization: string | null, secret: string): boolean {
  const provided = createHash('sha256').update(authorization ?? '').digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}
