// Process-local JWKS cache for Convex JWT signing. The keypair is static
// (persisted in the `jwks` table); re-reading it on every /token mint was
// waking Neon for an idle logged-in tab. A miss still loads from the adapter.
import type { Jwk } from 'better-auth/plugins/jwt';

type JwksAdapter = {
  findMany: (opts: { model: string }) => Promise<unknown[] | null | undefined>;
};

type JwksCtx = {
  context: { adapter: JwksAdapter };
};

let cachedKeys: Jwk[] | null = null;

/** Test-only: drop the process cache so each case can observe a fresh adapter read. */
export function __resetJwksCacheForTests(): void {
  cachedKeys = null;
}

function asJwks(keys: unknown[] | null | undefined): Jwk[] | null | undefined {
  if (keys === null || keys === undefined) return keys;
  return keys as Jwk[];
}

/**
 * Better Auth jwt `adapter.getJwks` — returns cached rows after the first DB
 * read. Empty results are not cached so a first-boot key create can retry.
 */
export async function getCachedJwks(ctx: JwksCtx): Promise<Jwk[] | null | undefined> {
  if (cachedKeys !== null && cachedKeys.length > 0) return cachedKeys;
  const keys = asJwks(await ctx.context.adapter.findMany({ model: 'jwks' }));
  if (keys !== null && keys !== undefined && keys.length > 0) {
    cachedKeys = keys;
  }
  return keys;
}
