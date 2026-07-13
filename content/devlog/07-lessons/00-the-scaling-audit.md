## The Scaling Audit
<!-- updated: 2026-06-30 -->

The scaling audit changed how I think about the whole project.

Before that audit, I had a simple mental model: if one user consumes some percentage of a free tier, more users consume that percentage multiplied by user count. That sounds reasonable. It is also not how this app actually scales.

The better model is axes: fixed work, per-request work, per-visible-tab work, per-character work, per-corporation work, per-ESI-call work, and per-reactive-write fan-out. A feature can be cheap on one axis and expensive on another. A page can look static while waking the database. A background job can be harmless when it succeeds and dangerous when its cleanup path leaks a lock. A live subscription can be fine for a tiny boolean and wrong for a large board.

The first scaling decision was regional, not algorithmic. In [PR #65](https://github.com/StorminRH/lgi-tools/pull/65), I measured the live-price path and decided not to move it to the edge. The price path talks to Neon, the shared cache, ESI, and sometimes Fuzzwork. Running compute close to the user would shorten only one hop while lengthening the internal hops back to the database and splitting the per-region cache. The repo now pins Vercel compute to `iad1`, where the database lives, instead of letting that stay accidental.<sup><a href="#code-scaling-vercel-region">1</a></sup>

That is a pattern I kept coming back to: measure the actual bottleneck before moving the architecture. “Edge” sounded faster. For this app, the database-adjacent regional function was the safer default.

The next lesson came from deploys. Neon scaling to zero is a cost win, but it introduced a build-time failure mode. Static prerender can be the first thing to read from the database after the compute has gone idle, and a failed prerender is not retried by the platform. In [PR #99](https://github.com/StorminRH/lgi-tools/pull/99), I added a retry wrapper around only the prerender-reachable cached reads. It retries connection-class cold-start errors, not SQL errors, and it rethrows on exhaustion instead of returning an empty result that could be cached into a long-lived static page.<sup><a href="#code-scaling-cold-start">2</a></sup>

That distinction matters. A scaling fix that hides real data errors is worse than the intermittent failure it replaces. The rail became: recover from infrastructure wake-up, but never turn “could not read” into “empty data.”

The same audit put explicit ceilings on long-running routes. A route that normally finishes in seconds but inherits a 300-second platform default can hang too long before failing. The live market-price refresh now carries a `maxDuration` sized from observed worst cases: up to 50 type IDs, per-type ESI concurrency, 10-second outbound timeouts, and fallback. This is not about making the route faster. It is about making failure bounded.<sup><a href="#code-scaling-route-runtime">3</a></sup>

Convex required a different kind of correction. The early live trackers made me think in terms of function calls. The scaling audit made me think in terms of reactive reads and write fan-out. A heartbeat, a run-state update, or an ETag stamp can be small as a write but expensive if it causes every subscribed client to re-read a heavy payload. That is why the Convex engine notes now spell out the fixed idle floor, per-visible-tab heartbeat cost, Workpool overhead, and the fact that skills/jobs/corp jobs moved out of the live watcher cost model entirely.<sup><a href="#code-scaling-convex-cost-model">4</a></sup>

The correction was not “Convex is bad.” The correction was “Convex is sharp.” Online status is a good live Convex consumer because it is tiny and genuinely live. Skills and job boards are not, because their user-visible movement is mostly timestamp-derived and their upstream data is cached. The live trackers section covers the migration; the scaling lesson is broader: a live backend should not be the default home for every animated UI.

PR #170 added another Convex rail: cap the amount of live-sync work any one scan or sweep can read. The scan is oldest-due-first and drains backlog over later runs. That means a large backlog becomes latency, not a per-mutation read-limit incident. The code calls out the Convex index-read ceiling directly and sets the batch to 1024, far above normal load but below the danger zone.<sup><a href="#code-scaling-bounded-scan">5</a></sup>

The idle-cost audit also caught a quieter problem. The sync sweeper ran every 15 minutes and wrote a telemetry row every time, even when it had nothing to do. On an idle deployment, that one insert was enough to wake Neon and keep it from suspending. [PR #159](https://github.com/StorminRH/lgi-tools/pull/159) changed the rule: always log to runtime logs so I can tell the cron fired, but write durable telemetry only when the sweep is noteworthy — a failure or a re-arm.<sup><a href="#code-scaling-idle-sweeper">6</a></sup>

That was a humbling lesson. Observability is not free just because the row is small. A write has a wake-up cost in a scale-to-zero architecture.

The ESI gate had its own scaling correction. In [PR #102](https://github.com/StorminRH/lgi-tools/pull/102), a body-cache optimization became a response-consumption bug. The gate was trying to decide whether a response was small enough to cache by cloning and reading it. On streamed responses without `Content-Length`, that could interfere with the caller reading the body. The fix was to cache only fixed-length responses under the cap and never read an unknown-size body in the gate. Later verification showed the cache still helps for small per-type responses, but the rule is explicit now: if the gate cannot size the body without reading it, it leaves the body alone.<sup><a href="#code-scaling-esi-body-cache">7</a></sup>

That is the same scaling theme again: the shared layer has to be conservative because every feature inherits its mistake.

The last scaling lesson was not about volume at all. It was cleanup ordering. The daily cron jobs use session advisory locks. If unlocking throws and the reserved connection is not released in an outer `finally`, the connection can stay abandoned with the lock held on its session. Later jobs see “busy” forever until the pool recycles that connection. [PR #150](https://github.com/StorminRH/lgi-tools/pull/150) fixed that by making connection release the outermost cleanup.<sup><a href="#code-scaling-cron-lock-release">8</a></sup>

That bug is a good reminder that scale failures are not always high-traffic failures. Sometimes they are one transient error in a cleanup path.

The audit changed the questions I ask before directing another AI coding session. I no longer ask only whether the feature works. I ask what it wakes up, what it writes, who is subscribed to that write, what gets re-read, what is fixed cost, what is per-visible-tab cost, what is per-character cost, and what happens when cleanup fails.

Scaling is not one big later problem. It is a set of placement decisions made early, often in code that looks too small to matter.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-scaling-vercel-region" file="vercel.json" lines="3-39" lang="json" -->
```json id="2ve9rm"
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
    { "path": "/api/cron/refresh-prices", "schedule": "30 11 * * *" },
    { "path": "/api/cron/refresh-industry-indices", "schedule": "40 11 * * *" },
    { "path": "/api/cron/refresh-sde", "schedule": "50 11 * * *" },
    { "path": "/api/cron/sync-sweeper", "schedule": "*/15 * * * *" }
  ]
}
```

<!-- uth:code id="code-scaling-cold-start" file="src/lib/neon-cold-start-retry.ts" lines="3-20,38-76" lang="ts" -->
```ts id="va9qmb"
// Retry wrapper for the prerender-reachable `'use cache'` DB reads. During
// `next build`, static prerender can hit a Neon compute that scaled to zero,
// and Vercel never retries a failed prerender: one connection-class error kills
// the whole deploy.
//
// Design constraints:
// - NEVER catch-and-return-empty — an empty result would be cached into the
//   long-lived `use cache` entries.
// - Retry ONLY the connection-class error signature of a cold start; SQL and
//   logic errors rethrow immediately.
export function isNeonColdStartError(err: unknown): boolean {
  let node: unknown = err;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && node instanceof Error; depth++) {
    if (node.name === 'NeonDbError') {
      const code = (node as { code?: unknown }).code;
      if (
        node.message.startsWith('Error connecting to database') ||
        /^Server error \(HTTP status 5\d\d\)/.test(node.message) ||
        (typeof code === 'string' && (code.startsWith('08') || code === '57P03'))
      ) return true;
    }
    node = (node as { cause?: unknown }).cause ?? (node as { sourceError?: unknown }).sourceError;
  }
  return false;
}

export async function withColdStartRetry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isNeonColdStartError(err)) throw err;
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[neon-cold-start-retry] attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
```

<!-- uth:code id="code-scaling-route-runtime" file="src/app/api/market-prices/refresh/route.ts" lines="6-15" lang="ts" -->
```ts id="h1ha7y"
// Rate-limited per client IP. The threshold lives in
// src/data/market-prices/constants.ts so post-ship tuning is one config
// change, not a code edit.
// authz: public

// Worst honest case: 50 typeIds at per-type ESI concurrency 10 → up to 5
// sequential rounds of 10s-timeout fetches plus the Fuzzwork fallback
// (observed peak 38.8s). 60 covers that while bounding a hang at well under
// the 300s platform default.
export const maxDuration = 60;
```

<!-- uth:code id="code-scaling-convex-cost-model" file="convex/engine.ts" lines="26-52" lang="ts" -->
```ts id="bvx2sc"
// Cost model (Convex billing; every function execution bills as one call,
// component internals and reactive re-runs included.
// Idle floor ≈ 94k calls/mo with zero traffic: this 30s scan (86.4k), the
// 15-min Vercel sweep chain (HTTP action + sweep mutation, 5.8k), and the
// Workpool's own 30-min healthcheck cron (1.4k).
// Per visible tab: 3 heartbeats/min ≈ 180 calls/hr. Since 3.5.e1 each beat
// writes only the syncPresence row, so interval beats no longer re-run
// forViewer and no longer re-read the heavy tracker payload.
// Watched-hour ≈ 2.9k calls online status (60-run floor) — the SOLE live watcher now;
// skills/jobs/corp all moved to Neon stale-gated on-view reads in MIGRATE.B.
```

<!-- uth:code id="code-scaling-bounded-scan" file="convex/engine.ts" lines="32-62" lang="ts" -->
```ts id="7v2azw"
// The overdue/hot-set dispatch passes read at most this many subjects per run,
// oldest-first, so a large due or hot set can't approach Convex's ~4,096
// index-range-read per-mutation ceiling. A backlog drains over subsequent runs.
export const SCAN_DISPATCH_BATCH = 1024;

function dueSubjects(ctx: MutationCtx, now: number): Promise<Doc<'syncSubjects'>[]> {
  return ctx.db
    .query('syncSubjects')
    .withIndex('by_next_due', (q) => q.gt('nextDueAt', 0).lte('nextDueAt', now))
    .take(SCAN_DISPATCH_BATCH);
}
```

<!-- uth:code id="code-scaling-idle-sweeper" file="src/app/api/cron/sync-sweeper/noteworthy.ts" lines="5-18" lang="ts" -->
```ts id="ok63sz"
// The sweeper runs every 15 minutes as the sync engine's external watchdog. A
// healthy run is a no-op, and its only durable side effect used to be a telemetry
// INSERT — the sole thing waking Neon's compute on an idle system.
//
// Record a durable row only when the run is noteworthy: it had to re-arm an
// overdue subject or it failed outright. The healthy case still emits a runtime
// log line, so "did the cron fire" stays answerable without poking Neon.
export function isNoteworthySweep(summary: CronSyncSweeperResponse): boolean {
  return summary.status === 'failed' || (summary.dispatched ?? 0) > 0;
}
```

<!-- uth:code id="code-scaling-esi-body-cache" file="src/lib/esi/dispatch.ts" lines="9-45" lang="ts" -->
```ts id="v8ucsh"
// Capture the body for the shared ETag cache when it's worth storing — but only
// for a response that arrives with a fixed Content-Length at or under the cap.
//
// A no-Content-Length body can't be size-bounded without reading it, and reading
// it here via res.clone() is exactly what intermittently consumes the CALLER's
// body; not reading it leaves the caller's body untouched.
async function captureBodyForCache(res: Response): Promise<string | null> {
  const contentLength = parseIntHeader(res.headers, 'Content-Length');
  if (contentLength === null || contentLength > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  const text = await res.clone().text();
  if (new TextEncoder().encode(text).length > BODY_CACHE_MAX_BYTES) {
    return null;
  }
  return text;
}
```

<!-- uth:code id="code-scaling-cron-lock-release" file="src/app/api/cron/refresh-sde/route.ts" lines="30-41" lang="ts" -->
```ts id="c1g2ti"
} finally {
  // Nest the unlock so reserved.release() is the OUTERMOST cleanup and always
  // runs — if the unlock query itself threw, skipping release() would leak the
  // connection AND leave the session-advisory lock held, wedging later runs.
  try {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
  } finally {
    reserved.release();
  }
}
```
<!-- uth:code-excerpts:end -->
