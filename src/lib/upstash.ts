import { Redis } from '@upstash/redis';
import { readEnv } from '@/lib/env';

// The single Upstash Redis construction owner. Every consumer resolves its
// client here so no call site can ship the SDK's implicit defaults — no request
// timeout at all, plus five exponential retries. The declared policy for each
// consumer lives in src/composition/vendor-resilience-registry.ts.
//
// This module is reachable from the Convex isolate (onlineStatusSync -> the ESI
// gate -> exhaustion-marker -> here), so it must stay free of `next/server` and
// Node builtins, and must not use the `AbortSignal.timeout`/`any` statics that
// Convex's default runtime omits.

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

/** Upstash Redis client type, re-exported so wrapper consumers never import the vendor package. */
export type UpstashRedis = Redis;

/**
 * Explicit per-client resilience config. `timeoutMs` and `retries` are required
 * so no construction can inherit an SDK default; omitting
 * `automaticDeserialization` preserves the SDK's own default of deserializing.
 */
export interface UpstashClientConfig {
  url: string;
  token: string;
  timeoutMs: number;
  retries: number;
  automaticDeserialization?: boolean;
}

/**
 * Builds the portable abort signal the SDK calls once per request. Deliberately
 * `AbortController` + `setTimeout` rather than `AbortSignal.timeout`, which
 * Convex's default runtime does not implement. The SDK's `signal` factory has no
 * settle hook to clear the timer, so it always fires; aborting an
 * already-settled request is a no-op.
 */
function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException('signal timed out', 'TimeoutError')),
    timeoutMs,
  );
  return controller.signal;
}

/**
 * Constructs the app's only Upstash Redis client shape: a per-request timeout
 * signal and an explicit retry count. A timed-out command rejects with the
 * SDK's `TimeoutError` — the SDK rethrows a function-form signal's abort
 * immediately, so `retries` covers transient non-abort network errors only.
 */
export function createUpstashClient(config: UpstashClientConfig): UpstashRedis {
  return new Redis({
    url: config.url,
    token: config.token,
    automaticDeserialization: config.automaticDeserialization,
    // Invoked once per request, outside the SDK's retry loop, so the bound
    // spans the whole attempt sequence rather than each attempt.
    signal: () => timeoutSignal(config.timeoutMs),
    retry: { retries: config.retries },
  });
}

/**
 * Env-resolved variant of `createUpstashClient`; null when Upstash is
 * unconfigured so each caller keeps owning its own degradation.
 */
export function resolveUpstashClient(options: {
  timeoutMs: number;
  retries: number;
  automaticDeserialization?: boolean;
}): UpstashRedis | null {
  const upstash = resolveUpstashRest();
  if (!upstash) return null;
  return createUpstashClient({ ...upstash, ...options });
}
