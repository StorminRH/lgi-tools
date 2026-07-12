## Redis

Redis is a small tool with a big temptation.

At its core, Redis is a fast key-value store. It is good at things like counters, short-lived cache entries, locks, queues, and little bits of shared operational memory. Upstash gives me that shape as a managed service that works well from serverless runtimes: instead of opening a long-lived TCP connection from a permanent app server, the app can talk to Redis through a connectionless service boundary that fits Vercel functions.

That made it useful for LGI.tools right away. A serverless function cannot safely say, “I’ll just keep this counter in memory.” There may be several function instances, they may start and stop independently, and none of them is guaranteed to see what the others saw. If I need a public feedback route to know how many times an IP has posted recently, or an ESI wrapper to know whether the whole app is near a shared API budget limit, that memory has to live somewhere outside the function.

But Redis is not a database in the way Neon is a database. That distinction matters. Redis is fast, shared, and convenient, which means it is very easy to start putting too much in it. The line I try to keep is simple: Redis can remember the operational state the app needs right now, but it should not become a second source of durable truth. If Redis disappears, LGI.tools may slow down, pause, or refuse some work. It should not forget what a character owns, what a structure is, or what the SDE says.

So Upstash has the narrowest job of the infrastructure services. Vercel runs the app. Neon keeps durable records. Convex handles small live projections. Upstash Redis is the shared scratchpad: rate limits, short-lived blocks, ESI budget mirrors, and cache metadata.

The first use was the easiest one to understand: rate limiting. [PR #29](https://github.com/StorminRH/lgi-tools/pull/29) added an Upstash-backed limiter for public POST routes. The feedback endpoint needed it because an unthrottled feedback form is a Discord-webhook spam vector. The market-price refresh endpoint needed it because the Industry Planner was going to let browsers request live price refreshes. Those are not permanent records, but they do need to be shared across every serverless instance handling traffic at that moment. An in-process `Map` would only protect one function instance. Upstash gives all of them the same counter.<sup><a href="#code-upstash-rate-limit">1</a></sup><sup><a href="#code-upstash-route-usage">2</a></sup>

That small feature also caught a real integration lesson. [PR #30](https://github.com/StorminRH/lgi-tools/pull/30) fixed a production failure caused by the app expecting one set of environment variable names while the Vercel marketplace integration provided another. The same Redis database existed, but the app was not reading the contract Vercel gave it. The limiter failed closed, which was the right safety posture, but it meant protected routes returned 500 in production. The fix was not to make the limiter permissive. The fix was to accept both provisioning shapes, prefer the Vercel marketplace names when present, and cover that behavior in tests. Managed services still have contracts, and those contracts need rails too.<sup><a href="#code-upstash-rate-limit">1</a></sup>

The second use is the one that matters most to the EVE side of the project: shared API budgeting. CCP’s API limits are not scoped to one JavaScript process. LGI.tools might have several serverless instances running at once, and all of them are spending from the same practical ESI budget. If each instance kept its own memory of recent responses, they would all make locally reasonable decisions that add up to a globally bad one.

That is why [PR #92](https://github.com/StorminRH/lgi-tools/pull/92) moved the ESI budget mirror into Redis. Before an ESI request goes out, the wrapper can ask the shared scoreboard what the app has recently observed: error counts, retry blocks, cached ETags, and route-specific cooldowns. After a response comes back, it can report what it learned so the next instance sees the same picture. The ESI section later goes deeper on the policy. The Redis point is simpler: the budget memory has to be shared because the budget risk is shared.<sup><a href="#code-upstash-scoreboard-resolver">3</a></sup>

This is also where Redis’ disposability is useful instead of scary. An ESI retry block is not a permanent fact. A budget echo is not user data. An ETag cache entry is only useful inside a response window. These values should expire. They should be cheap to read and write. They should be available to all serverless instances. That is Redis’ lane.<sup><a href="#code-upstash-redis-scoreboard">4</a></sup>

The failure behavior follows from that lane. If Redis is missing in development, the app can use an in-memory fallback so local work is not blocked. In production, missing Redis is different. If the shared ESI scoreboard is not configured, automated ESI dispatch should fail closed instead of pretending each instance has enough context to keep calling upstream. A paused refresh is annoying. Blindly spending a shared external API budget is worse.

[PR #117](https://github.com/StorminRH/lgi-tools/pull/117) cleaned up the scoreboard after it grew past its original shape. The first version had too much packed into one shared utility: types, key construction, Redis storage, memory fallback, and request policy. Splitting those pieces did not change the feature, but it made the boundary easier to review. That matters in an AI-built repo because a giant “shared helper” file invites the next agent to add one more unrelated responsibility. Smaller modules make the job harder to misunderstand.

That is the Upstash rule now: Redis is memory the whole serverless app can share, not a place to hide durable product state. It coordinates, throttles, blocks, and caches short-lived operational facts. When it is present, the app can make better shared decisions. When it is absent, the app should be conservative, not clever.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-upstash-rate-limit" file="src/lib/rate-limit.ts" lines="7-123" lang="ts" -->
```ts
// Shared sliding-window rate limiter backed by Upstash Redis. Stateless
// across Vercel serverless invocations (in-process counters don't survive
// scale-out, so we cannot use a Map here).
//
// One limiter instance per `name` is memoised. The Upstash SDK is
// connectionless (REST under the hood), so module state is safe across
// serverless cold starts.

function redisUrl(): string | undefined {
  return readEnv("KV_REST_API_URL") ?? readEnv("UPSTASH_REDIS_REST_URL");
}

function redisToken(): string | undefined {
  return readEnv("KV_REST_API_TOKEN") ?? readEnv("UPSTASH_REDIS_REST_TOKEN");
}

function getLimiter(options: RateLimitOptions): Ratelimit {
  const cacheKey = `${options.name}:${options.perMinute}`;
  const cached = limiters.get(cacheKey);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: new Redis({ url: redisUrl()!, token: redisToken()! }),
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
  if (!isConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true, remaining: Number.POSITIVE_INFINITY };
    }
    throw new Error(
      "Rate limiter not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (direct Upstash)",
    );
  }

  const limiter = getLimiter(options);
  const result = await limiter.limit(identifier);
  await result.pending;

  if (result.success) return { ok: true, remaining: result.remaining };
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfter };
}
```

<!-- uth:code id="code-upstash-route-usage" file="src/app/api/feedback/route.ts, src/app/api/market-prices/refresh/route.ts" lines="18-21,73-84;54-65" lang="ts" -->
```ts
// Feedback POSTs fan out to a Discord webhook, so an unthrottled endpoint is a
// webhook-spam vector. 5/min is generous for a real user typing thoughtfully
// but cuts a scripted flood off fast.

const limit = await rateLimit(clientIdentifier(request.headers), {
  name: 'feedback',
  perMinute: FEEDBACK_LIMIT_PER_MINUTE,
});
if (!limit.ok) {
  return Response.json(
    { error: 'rate_limited', retryAfter: limit.retryAfter } satisfies RateLimitedBody,
    {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfter) },
    },
  );
}

// Market-price refresh uses the same shared limiter shape.
const limit = await rateLimit(clientIdentifier(request.headers), {
  name: "market-prices-refresh",
  perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE,
});
```

<!-- uth:code id="code-upstash-scoreboard-resolver" file="src/lib/esi/scoreboard/index.ts" lines="8-77" lang="ts" -->
```ts
// Shared ESI budget scoreboard. CCP's limits are per-IP / per-app — shared
// across every serverless instance we run — so the mirror of what we've spent
// must be shared too. Upstash Redis is the real, shared thing; the in-process
// fallback is for dev/test only.

function redisUrl(): string | undefined {
  return readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
}

function redisToken(): string | undefined {
  return readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
}

export function resolveScoreboard(): EsiScoreboard | null {
  const url = redisUrl();
  const token = redisToken();
  if (url && token) {
    const cached = redisScoreboards.get(url);
    if (cached) return cached;
    const created = new RedisScoreboard(url, token);
    redisScoreboards.set(url, created);
    return created;
  }

  if (process.env.NODE_ENV !== 'production') {
    memoryScoreboard ??= new MemoryScoreboard();
    return memoryScoreboard;
  }

  console.error('[esi] budget scoreboard not configured ... ESI dispatch is failing closed');
  return null;
}
```

<!-- uth:code id="code-upstash-redis-scoreboard" file="src/lib/esi/scoreboard/redis.ts" lines="29-105,108-184" lang="ts" -->
```ts
// Hard timeout on every Redis REST call — the scoreboard sits on the go/no-go
// path of every ESI call and must fail fast, not stall it.
const REDIS_TIMEOUT_MS = 1500;

// Upstash Redis (REST over plain fetch, so it runs in every serverless/runtime path that needs shared memory).
export class RedisScoreboard implements EsiScoreboard {
  async preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState> {
    const minute = epochMinute();
    const pipeline = this.redis.pipeline();
    pipeline.get(keyErrorCount(minute));
    pipeline.get(keyErrorCount(minute - 1));
    pipeline.get(KEY_ERROR_ECHO);
    pipeline.get(keyBlock(normalizeEsiPath(url)));
    if (wantEtag) pipeline.get(keyEtagMeta(url));
    const rows = await pipeline.exec<(string | null)[]>();

    const selfCount =
      (parseStoredInt(rows[0]) ?? 0) + (parseStoredInt(rows[1]) ?? 0);
    const echo = parseStoredInt(rows[2]);

    return {
      effectiveRemaining: Math.min(
        echo ?? ESI_ERROR_CEILING,
        ESI_ERROR_CEILING - selfCount,
      ),
      blockedRetryAfter: blockRemaining !== null && blockRemaining > 0 ? blockRemaining : null,
      etag: wantEtag ? parseStoredMeta(rows[4] ?? null) : null,
    };
  }

  async report(report: EsiReport): Promise<void> {
    const pipeline = this.redis.pipeline();
    const queued = [
      this.queueErrorCount(pipeline, report),
      this.queueErrorEcho(pipeline, report),
      this.queueGroupState(pipeline, report),
      this.queueRetryBlock(pipeline, report),
      this.queueEtag(pipeline, report),
    ];
    if (queued.some(Boolean)) await pipeline.exec();
  }
}
```

<!-- uth:code-excerpts:end -->

