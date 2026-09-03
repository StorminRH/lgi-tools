import 'server-only';

import { Ratelimit } from "@upstash/ratelimit";
import { rateLimitedFailure } from "@/lib/failure";
import { allowUnconfiguredUpstash, createUpstashClient, resolveUpstashRest } from "@/lib/upstash";

export interface RateLimitOk {
  ok: true;
  remaining: number;
}

export interface RateLimitDenied {
  ok: false;
  retryAfter: number;
}

export type RateLimitResult = RateLimitOk | RateLimitDenied;

export interface RateLimitOptions {
  perMinute: number;
  name: string;
}

const limiters = new Map<string, Ratelimit>();
let warnedAboutMissingEnv = false;

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

export async function rateLimit(
  identifier: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const upstash = resolveUpstashRest();
  if (!upstash) {
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

export type CheckRateLimitResult =
  | { ok: true }
  | { ok: false; failure: ReturnType<typeof rateLimitedFailure> };

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
