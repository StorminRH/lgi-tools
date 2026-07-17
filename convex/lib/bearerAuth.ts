// Constant-time bearer check for the Convex HTTP-action runtime. That runtime
// has the Web Crypto API (crypto.subtle) and TextEncoder but NOT node:crypto, so
// it can't share src/lib/service-auth.ts's timingSafeEqual primitive. Hashing
// both sides to fixed-length SHA-256 digests keeps the comparison
// length-independent, so a timing side-channel can't reveal the secret. Mirrors
// the Vercel-side bearerMatches.
async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/**
 * Constant-time check that a raw Authorization header matches the expected Bearer secret; null and
 * malformed headers return false without throwing.
 */
export async function bearerMatches(
  authorization: string | null,
  secret: string,
): Promise<boolean> {
  const [provided, expected] = await Promise.all([
    sha256(authorization ?? ''),
    sha256(`Bearer ${secret}`),
  ]);
  // Both digests are 32 bytes; OR every byte difference so the loop count never
  // depends on where a mismatch first occurs.
  let diff = 0;
  // Both digests are fixed 32-byte SHA-256 outputs, so `?? 0` never triggers; it
  // keeps the loop branch-free / constant-time while staying index-safe.
  for (let i = 0; i < expected.length; i++) diff |= (provided[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}
