## Serverless by Design
<!-- updated: 2026-06-30 -->

Before the individual services make sense, the runtime model needs a little setup.

LGI.tools is not built around one permanent server. There is no single Node process sitting there all day, holding memory, running loops, keeping sockets warm, and remembering what happened five minutes ago. Most of the app runs as serverless work: a request arrives, the platform starts or reuses a function, the function does its job, and then that local process can disappear.

That is different from the shape a lot of EVE tools naturally drift toward. EVE projects often want stateful behavior: a bot that stays logged in, a worker that polls ESI on a loop, a socket server that keeps a live map open, a process-local cache of characters or systems, a queue that lives in memory, or a cron script running on a VPS. That model can be straightforward because the server is the place where everything gathers. It is also easy to accidentally make the whole tool depend on one always-on box behaving well.

I wanted LGI.tools to be easier to host, easier to scale down, and harder to break with one stuck process. The tradeoff is that the app cannot pretend local memory is durable. A JavaScript variable is not a shared counter. A timer inside one request is not a scheduler. A cached database socket is not a contract. If a feature needs memory after the request ends, that memory has to live somewhere explicit.

That idea is the thread through the next few sections.

Vercel is the host and the clock. It serves the public pages, runs the request handlers, builds the site, and triggers scheduled routes. That is where the app chooses regional serverless compute near the database instead of spreading everything to the edge. The point is not that edge compute is bad. The point is that LGI.tools spends a lot of time talking to its database, cache, and EVE data sources, so the request handler belongs near the data more than it belongs near every individual visitor.<sup><a href="#code-serverless-vercel">1</a></sup>

Neon is where durable relational state lives. Accounts, linked characters, saved structures, SDE tables, market snapshots, planner inputs, and audit-style records need a real database. But serverless Postgres still has serverless behavior: it can sleep when idle, wake on demand, and expose different connection paths for different jobs. Normal request reads should behave like short fresh calls. The few jobs that need real session-level coordination have to use a more deliberate connection path. That difference is why the Neon section spends time on “one database, two ways in.”<sup><a href="#code-serverless-db">2</a></sup>

Convex is the live layer, not the main filing cabinet. It is useful for small pieces of state that should react on screen without the browser polling: online status, presence, and the live-sync machinery around them. But it is also the place where I learned that “live” can become expensive if I treat every changing thing as a subscription. In a serverless architecture, a live system is powerful because it gives the app a place to coordinate without a permanent app server. It also needs a narrow job.

Upstash Redis is the shared short-term memory. A serverless function cannot enforce rate limits, abuse controls, or a shared ESI budget with an in-process map because there may be many function instances and none of them is guaranteed to survive. Redis gives the app a small common scratchpad for counters, retry blocks, and cache metadata. The important distinction is that module state can cache a client, but it cannot be the truth for a cross-request limit.<sup><a href="#code-serverless-rate-limit">3</a></sup>

Once I accepted that split, some failure modes became easier to reason about. Build-time database reads get their own cold-start retry because a sleeping database should not randomly kill a deploy, but that retry must never hide real SQL errors or cache an empty result. Scheduled work is declared as platform cron routes, not as a custom worker loop. Preview database branches need cleanup because managed services still create real external state. Those details are small, but they all come from the same rule: state has to be placed deliberately.<sup><a href="#code-serverless-cold-start">4</a></sup><sup><a href="#code-serverless-preview-cleanup">5</a></sup>

So “serverless by design” does not mean the app has no state. LGI.tools has plenty of state. The point is that each kind of state has a home: durable records in Neon, live reactive state in Convex, short-lived counters in Redis, scheduled execution in Vercel, and source-of-truth EVE data behind the ESI/SDE boundaries. The rest of this infrastructure chapter is really about those homes, and the mistakes that taught me where the boundaries needed to be.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-serverless-vercel" file="vercel.json" lines="3-39" lang="json" -->
```json id="b9mqe2"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["iad1"],
  "git": {
    "deploymentEnabled": {
      "main": true,
      "**": false,
      "*": false,
      "*/*": false
    }
  },
  "crons": [
    { "path": "/api/cron/refresh-affiliations", "schedule": "20 11 * * *" },
    { "path": "/api/cron/refresh-prices", "schedule": "30 11 * * *" },
    { "path": "/api/cron/refresh-industry-indices", "schedule": "40 11 * * *" },
    { "path": "/api/cron/refresh-sde", "schedule": "50 11 * * *" },
    { "path": "/api/cron/refresh-gsc", "schedule": "0 9 * * *" },
    { "path": "/api/cron/sync-sweeper", "schedule": "*/15 * * * *" }
  ]
}
```

<!-- uth:code id="code-serverless-db" file="src/db/index.ts" lines="17-103" lang="ts" -->
```ts id="f4x2vz"
function getClient(): HttpClient {
  if (_client) return _client;
  const url = requireEnv('DATABASE_URL');
  // Neon HTTP driver: one `fetch` per query, no TCP connection held. A Neon
  // compute that has scaled to zero slows the first query instead of erroring
  // it on a dead socket — that's the production-outage fix.
  _client = neon(url);
  return _client;
}

function getDb(): Db {
  if (_db) return _db;
  if (readEnv('LOCAL_DB_DRIVER') === 'postgres-js') {
    const url = requireEnv('DATABASE_URL');
    _db = drizzlePg(postgres(url)) as unknown as Db;
    return _db;
  }
  _db = drizzleHttp({ client: getClient() });
  return _db;
}

export function resolveLockConnectionUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (isPooledHost(url)) {
    throw new Error(
      'Refusing to hold a session advisory lock on a pooled (-pooler) connection: ' +
        'set DATABASE_URL_UNPOOLED to the direct Neon endpoint. ' +
        'Session-scoped locks do not hold through PgBouncer transaction-mode pooling.',
    );
  }
  return url;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const directClient: Sql = new Proxy({} as Sql, {
  get(_target, prop) {
    return (getDirectClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

<!-- uth:code id="code-serverless-rate-limit" file="src/lib/rate-limit.ts" lines="7-113" lang="ts" -->
```ts id="6w5h9v"
// Shared sliding-window rate limiter backed by Upstash Redis. Stateless
// across Vercel serverless invocations (in-process counters don't survive
// scale-out, so we cannot use a Map here).
//
// One limiter instance per `name` is memoised — recreating Ratelimit on
// every call would still work but allocates a new internal cache each
// time. The Upstash SDK is connectionless (REST under the hood), so module
// state is safe across serverless cold starts.

const limiters = new Map<string, Ratelimit>();

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

await result.pending;
```

<!-- uth:code id="code-serverless-cold-start" file="src/lib/neon-cold-start-retry.ts" lines="3-76" lang="ts" -->
```ts id="p6w8gn"
// Retry wrapper for the prerender-reachable `'use cache'` DB reads. During
// `next build`, static prerender can hit a Neon compute that scaled to zero,
// and Vercel never retries a failed prerender: one connection-class error kills
// the whole deploy.
//
// Design constraints:
// - NEVER catch-and-return-empty — an empty result would be cached into the
//   long-lived `use cache` entries.
// - Retry ONLY the connection-class error signature of a cold start.
// - The whole envelope must stay well under Next's ~50 s prerender cache-fill
//   ceiling.

export async function withColdStartRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isNeonColdStartError(err)) throw err;
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `[neon-cold-start-retry] attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
```

<!-- uth:code id="code-serverless-preview-cleanup" file=".github/workflows/delete-neon-branch.yml" lines="5-33" lang="yaml" -->
```yaml id="wuhfag"
# Previews are manual-on-demand only. When someone spins up a manual
# preview, the Vercel ↔ Neon integration creates `preview/<branch-name>` but
# never deletes it on PR close — this workflow does.

on:
  pull_request:
    types: [closed]

jobs:
  delete-branch:
    runs-on: ubuntu-latest
    steps:
      - name: Delete preview/<branch> in Neon
        continue-on-error: true
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          branch: preview/${{ github.event.pull_request.head.ref }}
          api_key: ${{ secrets.NEON_API_KEY }}
```
<!-- uth:code-excerpts:end -->
