import { Redis } from '@upstash/redis';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { isHostedVercel, readEnv } from '@/lib/env';

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
function completeRestPair(
  urlName: 'KV_REST_API_URL' | 'UPSTASH_REDIS_REST_URL',
  tokenName: 'KV_REST_API_TOKEN' | 'UPSTASH_REDIS_REST_TOKEN',
): { url: string; token: string } | null {
  const url = readEnv(urlName);
  const token = readEnv(tokenName);
  return url && token ? { url, token } : null;
}

export function resolveUpstashRest(): { url: string; token: string } | null {
  return (
    completeRestPair('KV_REST_API_URL', 'KV_REST_API_TOKEN')
    ?? completeRestPair('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN')
  );
}

/** Missing Upstash may degrade anywhere that is not hosted Vercel production or preview. */
export function allowUnconfiguredUpstash(): boolean {
  return !isHostedVercel();
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

// The SDK exposes no per-command completion hook and no injectable fetch, so
// Redis cost is measured by wrapping the client handle. `Date.now()` rather than
// `performance.now()` because this module is reachable from the Convex isolate,
// whose runtime this code must not assume beyond the ES basics — these are
// network round-trips, so millisecond resolution loses nothing. In Convex no
// sink is installed, so `addDependencyTiming` is a no-op there.
function timeRedisSettlement<T>(result: T, startedAt: number): T {
  if (
    typeof result !== 'object'
    || result === null
    || typeof (result as { then?: unknown }).then !== 'function'
  ) {
    return result;
  }
  const record = (): void => {
    addDependencyTiming('redis', Date.now() - startedAt);
  };
  void (result as unknown as PromiseLike<unknown>).then(record, record);
  return result;
}

/**
 * Wraps a Redis handle so every command's elapsed milliseconds are recorded against the active
 * operation. `pipeline()` and `multi()` hand back a builder whose commands chain by returning the
 * builder itself and whose cost lands entirely on `exec()`, so the builder is wrapped too and a
 * self-returning chain call is answered with the wrapper rather than the bare handle.
 */
function withCommandTiming<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      const method = value.bind(target) as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown => {
        const startedAt = Date.now();
        const result = method(...args);
        if (result === target) return receiver;
        if (prop === 'pipeline' || prop === 'multi') {
          return withCommandTiming(result as object);
        }
        return timeRedisSettlement(result, startedAt);
      };
    },
  });
}

/**
 * Constructs the app's only Upstash Redis client shape: a per-request timeout
 * signal and an explicit retry count. A timed-out command rejects with the
 * SDK's `TimeoutError` — the SDK rethrows a function-form signal's abort
 * immediately, so `retries` covers transient non-abort network errors only.
 * The returned handle records each command's duration as `redis` dependency cost.
 */
export function createUpstashClient(config: UpstashClientConfig): UpstashRedis {
  return withCommandTiming(
    new Redis({
      url: config.url,
      token: config.token,
      automaticDeserialization: config.automaticDeserialization,
      // Invoked once per request, outside the SDK's retry loop, so the bound
      // spans the whole attempt sequence rather than each attempt.
      signal: () => timeoutSignal(config.timeoutMs),
      retry: { retries: config.retries },
    }),
  );
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
