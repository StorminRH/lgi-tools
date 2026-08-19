import 'server-only';

import { Ratelimit } from "@upstash/ratelimit";
import { rateLimitedFailure } from "@/lib/failure";
import { allowUnconfiguredUpstash, createUpstashClient, resolveUpstashRest } from "@/lib/upstash";

// Shared sliding-window rate limiter backed by Upstash Redis. Stateless
// across Vercel serverless invocations (in-process counters don't survive
// scale-out, so we cannot use a Map here).
//
// One limiter instance per `name` is memoised — recreating Ratelimit on
// every call would still work but allocates a new internal cache each
// time. The Upstash SDK is connectionless (REST under the hood), so module
// state is safe across serverless cold starts.

/** Allowed rate-limit verdict carrying the remaining request count for the active window. */
export interface RateLimitOk {
  ok: true;
  remaining: number;
}

/** Denied rate-limit verdict carrying the retry delay in whole seconds. */
export interface RateLimitDenied {
  ok: false;
  retryAfter: number;
}

/** Closed rate-limit result requiring callers to handle allowed and denied outcomes explicitly. */
export type RateLimitResult = RateLimitOk | RateLimitDenied;

interface RateLimitOptions {
  perMinute: number;
  name: string;
}

const limiters = new Map<string, Ratelimit>();
let warnedAboutMissingEnv = false;

// This limiter sits on the request path, so a Redis outage must surface fast
// rather than stall the invocation toward the 300s platform limit. One retry
// covers a transient non-abort network error; a timeout abort rethrows
// immediately by SDK design, so the total wait stays near the bound.
const RATE_LIMIT_REDIS_TIMEOUT_MS = 2000;
const RATE_LIMIT_REDIS_RETRIES = 1;

function getLimiter(
  options: RateLimitOptions,
  upstash: NonNullable<ReturnType<typeof resolveUpstashRest>>,
): Ratelimit {
  const cacheKey = `${options.name}:${options.perMinute}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: createUpstashClient({
      ...upstash,
      timeoutMs: RATE_LIMIT_REDIS_TIMEOUT_MS,
      retries: RATE_LIMIT_REDIS_RETRIES,
    }),
    limiter: Ratelimit.slidingWindow(options.perMinute, "60 s"),
    analytics: true,
    prefix: `lgi:ratelimit:${options.name}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

/**
 * Returns `{ ok: true }` when the caller is under the limit and
 * `{ ok: false, retryAfter }` when they're over it. `retryAfter` is in
 * seconds, matching the `Retry-After` HTTP header units.
 *
 * In development without Upstash env vars configured, returns ok with
 * Infinity remaining and warns once per process — so `pnpm dev` stays
 * unblocked without an account. In production / preview, missing env vars
 * throw (fail-closed: a misconfigured deploy should 500 once and get
 * fixed, not ship an unlimited endpoint silently).
 */
export async function rateLimit(
  identifier: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const upstash = resolveUpstashRest();
  if (!upstash) {
    // Non-production (dev, test) bypasses cleanly so `pnpm dev` and
    // vitest don't require an Upstash account. Production fails closed:
    // a misconfigured deploy should 500 once and get fixed, never ship
    // an unlimited endpoint silently.
    if (allowUnconfiguredUpstash()) {
      if (!warnedAboutMissingEnv && process.env.NODE_ENV === "development") {
        console.warn(
          "[rate-limit] KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) not set — rate limiting disabled in dev",
        );
        warnedAboutMissingEnv = true;
      }
      return { ok: true, remaining: Number.POSITIVE_INFINITY };
    }
    throw new Error(
      "Rate limiter not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (direct Upstash)",
    );
  }

  const limiter = getLimiter(options, upstash);
  const result = await limiter.limit(identifier);
  // `analytics: true` makes `pending` a real promise that performs the
  // analytics write; awaiting it inside the request lifecycle ensures
  // the data actually lands before the serverless invocation finishes.
  await result.pending;

  if (result.success) {
    return { ok: true, remaining: result.remaining };
  }

  const retryAfter = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );
  return { ok: false, retryAfter };
}

/** Typed rate-limit core result carrying an application failure instead of an HTTP response. */
export type CheckRateLimitResult =
  | { ok: true }
  | { ok: false; failure: ReturnType<typeof rateLimitedFailure> };

/** Checks one request's named rate-limit bucket without constructing an HTTP response. */
export async function checkRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<CheckRateLimitResult> {
  const limit = await rateLimit(clientIdentifier(request.headers), options);
  if (limit.ok) return { ok: true };
  return {
    ok: false,
    failure: rateLimitedFailure(limit.retryAfter),
  };
}

/**
 * Extracts the originating IP for rate-limit keying. `x-real-ip` is
 * platform-set on Vercel (the connecting client's address; a client can't
 * supply it) and must win: the leftmost `x-forwarded-for` entry is
 * attacker-controlled there — Vercel appends to a client-supplied list
 * rather than replacing it, so keying on it hands every spoofer a fresh
 * bucket (verified live against a preview deployment). The forwarded-for
 * path stays as a fallback for local dev, where `x-real-ip` isn't set;
 * no header at all falls to one fixed shared bucket so such callers are
 * still subject to the limit.
 */
export function clientIdentifier(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
