import { v } from 'convex/values';
import { verifyCharacterAuthorizationEndpoint } from '@/platform/auth/api-contract';
import { serviceFetch } from '@/platform/auth/service-client';
import { internalAction } from './_generated/server';
import { requireSyncEnv } from './lib/characterSync';

/** Convex provides sub-daily scheduling; durable authorization state stays in Neon. */
export const verify = internalAction({
  args: {},
  returns: v.null(),
  handler: async () => {
    const env = requireSyncEnv();
    const outcome = await serviceFetch(verifyCharacterAuthorizationEndpoint, {
      baseUrl: env.siteUrl,
      secret: env.secret,
      timeoutMs: 115_000,
    });
    if (!outcome.ok) {
      if (outcome.kind === 'network') throw outcome.cause;
      if (outcome.kind === 'protocol') throw new Error(`Authorization verification contract failed: ${outcome.detail}`);
      throw new Error(`Authorization verification returned ${outcome.status}`);
    }
    return null;
  },
});
