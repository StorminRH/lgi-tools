import { readEnv } from '@/lib/env';

/**
 * Resolves the Upstash Redis REST credentials from either provisioning path —
 * `KV_REST_API_*` (Vercel marketplace, preferred) or `UPSTASH_REDIS_REST_*`
 * (direct signup) — or null when a complete credential pair is unavailable.
 * Callers own their unconfigured behavior.
 */
export function resolveUpstashRest(): { url: string; token: string } | null {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token =
    readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  return url && token ? { url, token } : null;
}
