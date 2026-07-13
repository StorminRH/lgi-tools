## The ESI Gate

ESI is CCP’s live API for EVE Online. It is how LGI.tools reaches outside its own database and asks the game what is true right now: market orders, character data, corporation data, industry jobs, skills, affiliations, structures, and all the other moving pieces that cannot come from the static data export.

That makes ESI powerful, but it also makes it one of the easiest places to hurt the whole app. A bad database query usually breaks one feature. A bad UI component usually breaks one screen. A bad ESI caller can spend the same shared API budget every other feature needs. It can also keep retrying when EVE is already telling the app to slow down.

That problem gets sharper in a serverless app. LGI.tools does not have one permanent process that remembers every outbound request. Several Vercel functions can wake up at the same time, each handling a different user, cron route, or refresh. If each function only trusts its own local memory, each one can make a locally reasonable decision that adds up to globally bad behavior. ESI needed one shared door.

The other thing that makes ESI different from a normal API integration is that the response itself carries operational information. EVE tells callers about error-budget state, retry timing, cache windows, ETags, and compatibility expectations. Ignoring that information would be wasteful at best and hostile at worst. So the job was not just “fetch from CCP.” The job was to build a boundary where every ESI call follows the same outbound rules.

The first version of that boundary lived inside market pricing because market prices were the first serious ESI consumer. That made sense at the time. The wrapper identified the app, pinned the compatibility date, tracked the error budget it could see, and let price fetching fall back when ESI was unhealthy. The mistake was leaving that protection owned by a data slice. Once character and corporation features were coming, the pricing module could not be the place every future ESI caller imported from. Rebuilding the same wrapper somewhere else would have been worse, because two wrappers would each think they owned a budget that is actually shared.

[PR #91](https://github.com/StorminRH/lgi-tools/pull/91) changed the rule: ESI became shared infrastructure. The public surface moved to `src/lib/esi`, with two sanctioned operations: build the URL with `esiUrl`, then dispatch with `esiFetch`. The gate is deliberately OAuth-agnostic. If a caller passes an `Authorization` header, the gate leaves it alone. That lets public market reads and authenticated character reads share one outbound policy without putting token logic inside the gate itself.<sup><a href="#code-esi-entry">1</a></sup>

[PR #92](https://github.com/StorminRH/lgi-tools/pull/92) is where the serverless lesson landed. A module-level counter was good enough for one hourly price cron. It was not good enough for concurrent, user-triggered ESI work. Each Vercel instance could start with a clean local counter and dispatch as if nobody else had spent anything. The fix was to move the mirror into a shared scoreboard. In production, that scoreboard is Upstash Redis. In dev and tests, it can fall back to in-process memory so the local loop still works. If production has no scoreboard, the gate fails closed instead of pretending blind dispatch is safe.<sup><a href="#code-esi-scoreboard-resolver">2</a></sup>

The current gate has a pre-dispatch step before any request leaves the app. It asks the scoreboard for the effective remaining error budget, any active retry block for that route, and any stored ETag metadata for that URL. The error budget is intentionally pessimistic: it combines the app’s own recent error count with the lowest remaining-budget header any instance observed. Under-counting is the dangerous failure mode. Over-counting means the app backs off early, which is annoying but survivable.<sup><a href="#code-esi-scoreboard-model">3</a></sup><sup><a href="#code-esi-redis-scoreboard">4</a></sup>

The refusal behavior is explicit. If the scoreboard is unavailable, non-interactive work does not dispatch. Interactive callers can opt into a small per-instance trickle, which is useful for a person clicking something in the UI but not enough to let a background job stampede ESI. If a route is under a retry block or the effective error budget is below the floor, the gate throws the same budget-exhausted error shape with a reason attached. Callers then degrade in their own domain: pricing can use its fallback source, a tracker can skip that owner, and telemetry can record that the budget path was the reason.<sup><a href="#code-esi-dispatch-budget">5</a></sup><sup><a href="#code-esi-errors">6</a></sup>

When the gate does dispatch, it standardizes the request. It sets the project User-Agent if the caller did not provide one, forces the ESI compatibility date, attaches an ETag only when that request is eligible, and uses the shared timeout wrapper. The caller still receives a normal `Response`, which is important. The gate owns policy and accounting, but the consuming feature still owns the endpoint contract and the meaning of the body it asked for.<sup><a href="#code-esi-dispatch-budget">5</a></sup>

ETags are where this got subtle. Public unauthenticated GETs can use the shared cache. Authenticated requests cannot. The shared cache must never hold per-character or per-corporation data, so any request carrying `Authorization` is excluded from the gate’s ETag cache. For eligible public reads, the gate can store ETag metadata and a small body, revalidate with `If-None-Match`, and synthesize the 200 response the caller expected when ESI replies `304 Not Modified`.<sup><a href="#code-esi-entry">1</a></sup><sup><a href="#code-esi-cache-body">7</a></sup>

That cache also produced one of the more useful mistakes. The gate originally tried to decide whether a response was small enough to cache by cloning and reading the body when the size was not declared. During industry cost-index work, that showed up as intermittent “Body has already been read” failures on large streamed responses. [PR #102](https://github.com/StorminRH/lgi-tools/pull/102) fixed the root cause in the gate instead of keeping a feature-local workaround. The rule now is stricter: only fixed `Content-Length` responses at or under the cache cap are body-cached. A chunked response with no declared size is handed to the caller untouched. The lesson was that a shared gate bug is not local. If the gate mishandles a response body, every feature using ESI inherits the risk.<sup><a href="#code-esi-cache-body">7</a></sup>

[PR #93](https://github.com/StorminRH/lgi-tools/pull/93) used an admin-only ESI sandbox to prove the next boundary before building on top of it. It requested the broader character permission set once, then exercised the live authenticated endpoints through the shared gate. That caught a planned permission name that no longer existed and proved the gate could pass bearer tokens through while still applying the shared outbound policy. This is the process I want around EVE integration now: do not guess the live response shape, do not guess the permission string, and do not bypass the gate to “just test one endpoint.”

The final rail is mechanical. ESLint bans hand-written `esi.evetech.net` literals outside the gate and its tests. That is not because a string literal is dangerous by itself. It is dangerous because it is the easiest way for AI-generated code to create a second, invisible door to ESI. The rule forces future code through the same URL builder, the same budget check, the same compatibility date, and the same reporting path.<sup><a href="#code-esi-lint-rail">8</a></sup>

So the ESI gate is not just a rate limiter. It is the project’s EVE API boundary. It standardizes identity, pins the contract, centralizes budget accounting, keeps shared cache behavior away from authenticated data, fails closed when shared state is missing, and makes bypasses noisy. That is the important part for an AI-built codebase: the safe path is the obvious path, and the unsafe path has to fight the repo.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-esi-entry" file="src/lib/esi/index.ts" lines="14-35,54-90" lang="ts" -->
```ts
// Both limits are shared across every serverless instance we run, so the
// budget state lives in a shared Upstash Redis scoreboard: every esiFetch
// consults it before dispatch and reports every response's headers back to it.
// This gate is the single door — all ESI consumers route through esiFetch.
// The gate is OAuth-agnostic: headers passed via `init` go through untouched.
//
// Authenticated calls never touch the shared cache and dispatch every time.

const ESI_BASE_URL = 'https://esi.evetech.net';

export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const wantEtag = isEtagEligible(init);

  const pre = await consultPreDispatch(sb, url, wantEtag);
  enforceBudget(pre, opts);

  const liveSb = pre !== null ? sb : null;
  const etagMeta = pre !== null && wantEtag ? pre.etag : null;

  if (etagMeta !== null && liveSb !== null) {
    const cached = await serveFromExpiresWindow(url, etagMeta, liveSb);
    if (cached !== null) return cached;
  }

  return dispatch(url, init, wantEtag, liveSb, etagMeta);
}
```

<!-- uth:code id="code-esi-scoreboard-resolver" file="src/lib/esi/scoreboard/index.ts" lines="8-13,43-76" lang="ts" -->
```ts
// Shared ESI budget scoreboard. CCP's limits are per-IP / per-app — shared
// across every serverless instance we run — so the mirror of what we've spent
// must be shared too. This is the storage layer: Upstash Redis (the real,
// shared thing) with an in-process fallback for dev/test.

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

  console.error(
    '[esi] budget scoreboard not configured: set KV_REST_API_URL + KV_REST_API_TOKEN ' +
      '(Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ' +
      '(direct Upstash) — ESI dispatch is failing closed',
  );
  return null;
}
```

<!-- uth:code id="code-esi-scoreboard-model" file="src/lib/esi/scoreboard/types.ts" lines="7-24,26-31,46-82" lang="ts" -->
```ts
// Two CCP limit systems are mirrored:
//  • Legacy error limit — per-IP, ALL routes, fixed 60s window, 100 non-2xx/3xx
//    responses, then 420 everywhere. Mirrored two ways and combined
//    pessimistically: a self-count of our own error responses and an echo of
//    the lowest X-ESI-Error-Limit-Remain any instance observed.
//  • Token-bucket rate limit — per-group X-Ratelimit-* state is stored for
//    observability, and a 429's Retry-After becomes a block key on the
//    normalized route path that pre-dispatch honors.
//
// ETag state also lives in the scoreboard: per-URL meta and the cached body a
// 304 revalidation re-serves. Bodies are stored only for unauthenticated GETs.

export const ESI_ERROR_CEILING = 100;
export const BODY_CACHE_MAX_BYTES = 131_072;

export interface PreDispatchState {
  effectiveRemaining: number;
  blockedRetryAfter: number | null;
  etag: CachedEtagMeta | null;
}

export interface EsiReport {
  url: string;
  status: number;
  errorLimitRemain: number | null;
  errorLimitReset: number | null;
  rateLimitGroup: string | null;
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitUsed: number | null;
  retryAfter: number | null;
  etagToStore: (CachedEtagMeta & { body: string }) | null;
  refreshEtag: CachedEtagMeta | null;
}
```

<!-- uth:code id="code-esi-redis-scoreboard" file="src/lib/esi/scoreboard/redis.ts" lines="64-91,108-184" lang="ts" -->
```ts
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
  const blockExpiry = parseStoredInt(rows[3]);
  const blockRemaining =
    blockExpiry !== null ? blockExpiry - Math.floor(Date.now() / 1000) : null;
  return {
    effectiveRemaining: Math.min(
      echo ?? ESI_ERROR_CEILING,
      ESI_ERROR_CEILING - selfCount,
    ),
    blockedRetryAfter:
      blockRemaining !== null && blockRemaining > 0 ? blockRemaining : null,
    etag: wantEtag ? parseStoredMeta(rows[4] ?? null) : null,
  };
}

private queueErrorCount(pipeline: Pipeline, report: EsiReport): boolean {
  if (report.status < 400) return false;
  const key = keyErrorCount(epochMinute());
  pipeline.incr(key);
  pipeline.expire(key, ERROR_COUNT_TTL_SECONDS);
  return true;
}

private queueRetryBlock(pipeline: Pipeline, report: EsiReport): boolean {
  if (report.status !== 429) return false;
  const retryAfter = resolveRetryAfter(report.retryAfter);
  pipeline.set(
    keyBlock(normalizeEsiPath(report.url)),
    String(Math.floor(Date.now() / 1000) + retryAfter),
    { ex: retryAfter },
  );
  return true;
}
```

<!-- uth:code id="code-esi-dispatch-budget" file="src/lib/esi/dispatch.ts" lines="26-30,68-95,237-290,105-135" lang="ts" -->
```ts
export interface EsiFetchOptions {
  interactive?: boolean;
}

// Conditional requests and body caching apply only to unauthenticated GETs:
// the shared cache must never hold per-character data.
export function isEtagEligible(init?: RequestInit): boolean {
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return false;
  return !new Headers(init?.headers).has('Authorization');
}

function buildHeaders(init?: RequestInit, etag?: string | null): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', OUTBOUND_USER_AGENT);
  }
  headers.set('X-Compatibility-Date', ESI_COMPATIBILITY_DATE);
  if (etag != null) headers.set('If-None-Match', etag);
  return headers;
}

export function enforceBudget(
  pre: PreDispatchState | null,
  opts?: EsiFetchOptions,
): void {
  if (pre === null) {
    if (opts?.interactive !== true) {
      throw new EsiBudgetExhaustedError(0, 'scoreboard_unavailable');
    }
    if (trickleCount >= TRICKLE_MAX_PER_MINUTE) {
      throw new EsiBudgetExhaustedError(0, 'trickle_capped');
    }
    trickleCount += 1;
    return;
  }
  if (pre.blockedRetryAfter !== null) {
    throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'rate_limited');
  }
  if (pre.effectiveRemaining < ESI_BUDGET_FLOOR) {
    throw new EsiBudgetExhaustedError(pre.effectiveRemaining, 'error_budget');
  }
}

export async function dispatch(
  url: string,
  init: RequestInit | undefined,
  wantEtag: boolean,
  liveSb: EsiScoreboard | null,
  etagMeta: CachedEtagMeta | null,
): Promise<Response> {
  const headers = buildHeaders(init, etagMeta?.etag ?? null);
  const res = await fetchWithTimeout(url, { ...init, headers });
  // report, error handling, and return follow...
}
```

<!-- uth:code id="code-esi-errors" file="src/lib/esi/errors.ts" lines="7-35,38-56" lang="ts" -->
```ts
// Refuse to dispatch when the effective error-budget remaining falls below
// this floor. ESI's ceiling is 100 errors per window; refusing at 20 left
// leaves slack for in-flight calls and for the egress-IP sharing that makes
// our mirror an approximation.
export const ESI_BUDGET_FLOOR = 20;

export type EsiBudgetExhaustedReason =
  | 'error_budget'
  | 'esi_420'
  | 'rate_limited'
  | 'scoreboard_unavailable'
  | 'trickle_capped';

export class EsiBudgetExhaustedError extends Error {
  constructor(
    public readonly remaining: number,
    public readonly reason: EsiBudgetExhaustedReason = 'error_budget',
  ) {
    super(
      `ESI error budget exhausted (${reason}): ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`,
    );
    this.name = 'EsiBudgetExhaustedError';
  }
}

export class EsiServerError extends Error { /* 5xx */ }
export class EsiContractError extends Error { /* malformed body */ }
```

<!-- uth:code id="code-esi-cache-body" file="src/lib/esi/dispatch.ts" lines="128-164,167-185,216-234" lang="ts" -->
```ts
// Capture the body for the shared ETag cache when it's worth storing — but only
// for a response that arrives with a fixed Content-Length at or under the cap.
//
// A no-Content-Length body can't be size-bounded without reading it, and reading
// it here via res.clone() is exactly what intermittently consumes the CALLER's
// body. Not reading it leaves the caller's body untouched.
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

function synthesizeRevalidated(
  res304: Response,
  body: string,
  meta: CachedEtagMeta,
): Response {
  const headers = new Headers(res304.headers);
  if (!headers.has('Content-Type') && meta.contentType !== null) {
    headers.set('Content-Type', meta.contentType);
  }
  headers.set('x-lgi-esi-cache', 'revalidated');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

export async function serveFromExpiresWindow(
  url: string,
  etagMeta: CachedEtagMeta,
  liveSb: EsiScoreboard,
): Promise<Response | null> {
  if (!isWithinExpiresWindow(etagMeta.expires)) return null;
  const body = await liveSb.getCachedBody(url).catch(() => null);
  if (body === null) return null;
  return synthesizeFromCache(body, etagMeta);
}
```

<!-- uth:code id="code-esi-lint-rail" file="eslint.config.mjs" lines="3-21" lang="js" -->
```js
// Banning the host literal outside src/lib/esi means the only way to target
// ESI is the gate's own exports (esiUrl + esiFetch). Scoped to the API host
// exactly: images.evetech.net stays legitimately used across the UI.
const esiHostSelectors = [
  {
    selector: String.raw`Literal[value=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget.",
  },
  {
    selector: String.raw`TemplateElement[value.raw=/esi\.evetech\.net/]`,
    message:
      "Don't hand-write ESI URLs (template literal) — build them with esiUrl() and dispatch through esiFetch (@/lib/esi): the gate owns CCP's shared per-IP error budget.",
  },
];
```
<!-- uth:code-excerpts:end -->

