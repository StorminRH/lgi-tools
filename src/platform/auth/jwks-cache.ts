import type { Jwk } from 'better-auth/plugins/jwt';

export type JwksAdapter = {
  findMany: (opts: { model: string }) => Promise<unknown[] | null | undefined>;
};

export type JwksCtx = {
  context: { adapter: JwksAdapter };
};

let cachedKeys: Jwk[] | null = null;

export function __resetJwksCacheForTests(): void {
  cachedKeys = null;
}

function asJwks(keys: unknown[] | null | undefined): Jwk[] | null | undefined {
  if (keys === null || keys === undefined) return keys;
  return keys as Jwk[];
}

export async function getCachedJwks(ctx: JwksCtx): Promise<Jwk[] | null | undefined> {
  if (cachedKeys !== null && cachedKeys.length > 0) return cachedKeys;
  const keys = asJwks(await ctx.context.adapter.findMany({ model: 'jwks' }));
  if (keys !== null && keys !== undefined && keys.length > 0) {
    cachedKeys = keys;
  }
  return keys;
}
