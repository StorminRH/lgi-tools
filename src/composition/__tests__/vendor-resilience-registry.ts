export type VendorIntegrationId =
  | 'eve-esi'
  | 'eve-sso'
  | 'better-auth'
  | 'convex'
  | 'upstash-redis'
  | 'neon-postgres'
  | 'vercel-platform'
  | 'github-tooling'
  | 'linear-issues'
  | 'google-search-console'
  | 'discord-webhooks'
  | 'fuzzwork'
  | 'ccp-static-data'
  | 'eve-news-feed'
  | 'ccp-image-cdn'
  | 'anoik-statics';

export interface VendorResiliencePolicy {
  wrapper: { module: string; symbol: string };
  timeout: string;
  retryableErrors: string;
  backoff: string;
  rateLimit: string;
  idempotency: string;
  degradation: string;
  telemetryFields: string;
}

export interface NoProgrammaticSurface {
  noProgrammaticSurface: true;
  fact: string;
}

export type VendorResilienceEntry = VendorResiliencePolicy | NoProgrammaticSurface;

function policy(entry: VendorResiliencePolicy): VendorResiliencePolicy {
  return entry;
}

function noSurface(fact: string): NoProgrammaticSurface {
  return { noProgrammaticSurface: true, fact };
}

const eveEsi = policy({
  wrapper: { module: 'src/platform/esi/index.ts', symbol: 'esiFetch' },
  timeout: '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors:
    'None at the dispatch layer. A 304 whose cached body has been evicted triggers one unconditional re-request — a cache repair, not an error retry.',
  backoff:
    'No client backoff. CCP 429s and 420s become a Redis-recorded block on the normalized path, and the pre-dispatch gate refuses calls until it expires.',
  rateLimit:
    "The shared Redis scoreboard owns CCP's per-IP error budget: two-minute-bucket self counts plus the server's error-limit echo, evaluated before dispatch. Refusals are recorded by markRecentBudgetExhaustion.",
  idempotency:
    'Read-only ESI operations only: GET queries plus public POST resolvers whose JSON bodies name lookup inputs and perform no mutation, so a repeat is safe.',
  degradation:
    'Per caller: background and price reads fall back to stored data or Fuzzwork; interactive character search returns its declared unavailable problem when scoped or exact live resolution cannot complete.',
  telemetryFields:
    "'price_source_degraded', 'public_esi_budget_alert_claimed', 'public_esi_budget_alerted'.",
});
const eveSso = policy({
  wrapper: {
    module: 'src/platform/auth/eve-sso.ts',
    symbol: 'exchangeCodeForToken',
  },
  timeout: '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors:
    'None. A token exchange or refresh is attempted once; the outcome is classified and recorded instead.',
  backoff: 'None — no retry to space out.',
  rateLimit: 'No app-side limiter; EVE SSO owns its own limits.',
  idempotency:
    'Non-idempotent: an authorization code is single-use and a refresh may rotate the stored token, so a blind retry can invalidate a live grant.',
  degradation:
    'Failure surfaces to the sign-in or token-vend caller as a classified reason; the stored token is left untouched unless EVE explicitly rejected it.',
  telemetryFields:
    "'eve_token_refresh_invalid_grant', 'eve_token_refresh_timeout', 'eve_token_refresh_connection', 'eve_token_refresh_provider_5xx', 'eve_token_refresh_unexpected', 'eve_token_refresh_race'.",
});
const betterAuth = policy({
  wrapper: { module: 'src/composition/auth.ts', symbol: 'auth' },
  timeout:
    "Bounded indirectly: the vendor orchestrates the flow, but its outbound EVE legs are overridden onto fetchWithTimeout (10s), and its database access runs through the Drizzle adapter on Neon's bounds.",
  retryableErrors: 'None added; the SDK owns its own request lifecycle.',
  backoff: 'None added.',
  rateLimit:
    'Auth-adjacent routes are limited by checkRateLimit (src/lib/rate-limit.ts) ahead of the handler.',
  idempotency:
    'Session and account mutations are non-idempotent and never auto-retried.',
  degradation:
    'Errors surface as sign-in failures; one Better Auth user always represents one human, so no partial-identity fallback exists.',
  telemetryFields: "'auth_login', 'auth_logout', 'auth_absorb', 'account_purge'.",
});
const convexLive = policy({
  wrapper: { module: 'src/data/convex/client.ts', symbol: 'convexClient' },
  timeout:
    'None available on the browser client: it holds a WebSocket subscription with no per-call timeout knob. Server-side calls in the other direction (Convex to our first-party API) are bounded at 10s by src/platform/auth/service-client.ts.',
  retryableErrors:
    'The vendor client owns socket reconnection; the app adds no retry.',
  backoff: "The vendor client's own reconnect schedule.",
  rateLimit:
    'None; Convex is first-party infrastructure with no shared budget to protect.',
  idempotency:
    'Live projections are fully regenerable and Convex never writes to Neon, so a replayed sync is safe by construction.',
  degradation:
    'A null client (NEXT_PUBLIC_CONVEX_URL unset) disables live reads and every consumer renders its non-live path; the rest of the site is unaffected.',
  telemetryFields:
    "'cron_sync_sweeper' (the watchdog that detects a lagging Convex scan).",
});
const upstashRedis = policy({
  wrapper: { module: 'src/lib/upstash.ts', symbol: 'createUpstashClient' },
  timeout:
    'Explicit per client: 1500ms for the ESI scoreboard (on the go/no-go path of every ESI call), 2000ms for the rate limiter and the two hint writers. Enforced by a portable AbortController signal the SDK invokes once per request.',
  retryableErrors:
    'Transient non-abort network errors only. A timeout abort is rethrown immediately by SDK design, so the bound is never multiplied by the retry count.',
  backoff:
    "The SDK's exponential backoff, reached only by the rate limiter's single retry; the other three clients declare zero retries.",
  rateLimit:
    'This integration is itself the rate-limit backend (sliding window via @upstash/ratelimit) and the ESI budget store.',
  idempotency:
    'The hint writes are idempotent (a set, and an eval that only lowers a stored timestamp). Rate-limit counters are intentionally incrementing, so a retried increment would over-count — which is why a timeout is never retried.',
  degradation:
    "Per call site and unchanged by this policy: unconfigured or failed hint writes are swallowed (the durable Neon queue stays authoritative), the exhaustion marker answers 'unknown' so callers keep their Neon fallback, the scoreboard falls back to its local budget, and the rate limiter bypasses in non-production but fails closed in production.",
  telemetryFields:
    "None of its own; it appears in consumers' outcomes ('price_source_degraded', 'cron_esi_refresh_jobs').",
});
const neonPostgres = policy({
  wrapper: { module: 'src/db/index.ts', symbol: 'db' },
  timeout:
    'HTTP driver: 30000ms per query, installed as the driver-global neonConfig.fetchFunction inside the lazy client builder (the driver exposes no per-client hook; there is exactly one neon() consumer, so the global bounds only this client). postgres-js: connect_timeout 30s, establishment only. No statement timeout — advisory-lock holders and ingest legitimately run long.',
  retryableErrors:
    "Connection-class only, per isNeonColdStartError: the driver's fetch-rejection wrap, a proxy 5xx, SQLSTATE class 08, and 57P03. Explicitly excluded is a wrap caused by our own timeout abort, which would otherwise multiply one bounded 30s wait into the full retry envelope.",
  backoff:
    'Exponential across at most 4 attempts (500ms / 1s / 2s), sized to stay under Next’s prerender cache-fill ceiling. Applies only to prerender-reachable cached reads via withColdStartRetry.',
  rateLimit: 'None; connection ceilings are managed by pool sizing per client.',
  idempotency:
    'Retries are confined to connection-class failures, where no statement reached the server, so a retried read cannot double-apply work.',
  degradation:
    'None by design: a retry-exhausted read rethrows so a genuinely broken build fails loudly rather than caching an empty result into a long-lived entry.',
  telemetryFields: "'neon_cold_start_retry' (outcome, attempts, totalDelayMs).",
});
const vercelPlatform = noSurface('The app makes no Vercel API call. Its only src artifact is the build-injected @vercel/speed-insights beacon component in src/app/layout.tsx, which reports from the browser and exposes no app-controlled request. Deployment and environment actions are operator CLI work, outside the request path.');
const githubTooling = policy({
  wrapper: { module: 'tools/delivery/github_api.py', symbol: 'request' },
  timeout:
    'Explicit on every call: 30s (github_api.py, and _FETCH_TIMEOUT in update_watch_collect.py). Outside ESLint scope, so the census asserts the timeout argument directly.',
  retryableErrors: 'None; a failed call is a named failure the tooling reports.',
  backoff: 'None.',
  rateLimit:
    "GitHub's own limits; the tooling makes single low-volume calls and passes a token when one is present.",
  idempotency:
    'Reads are idempotent. Mutations (opening or closing an issue) are never auto-retried, which is why no retry policy exists here.',
  degradation:
    'Fail-closed: a missing binary, an unreadable repo identity, or a failed request is a refusal, never a crash and never a silently-clean result.',
  telemetryFields: "None; outcomes are the routine's own reported verdict.",
});
const linearIssues = policy({
  wrapper: {
    module: 'src/features/feedback/create-linear-issue.ts',
    symbol: 'createFeedbackLinearIssue',
  },
  timeout: '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors: 'None.',
  backoff: 'None.',
  rateLimit:
    "Linear's authenticated GraphQL limits; delivery volume is user feedback submissions already capped at 5/min per IP.",
  idempotency:
    'Non-idempotent — a retry would open a duplicate issue, which is why none is attempted.',
  degradation:
    'Unset LINEAR_API_KEY surfaces 503 feedback_unconfigured; Linear transport or rejection surfaces 502 linear_failed to the submitter and skips telemetry.',
  telemetryFields: "'feedback_submitted'.",
});
const googleSearchConsole = policy({
  wrapper: {
    module: 'src/data/gsc/source.ts',
    symbol: 'querySearchAnalytics',
  },
  timeout:
    '10s on both legs: the API request through fetchWithTimeout, and the SDK’s own token acquisition through the JWT transporterOptions timeout.',
  retryableErrors: 'None; a failed sync surfaces to the cron.',
  backoff: 'None.',
  rateLimit: "Google's own quotas; the daily cron makes a bounded number of calls.",
  idempotency:
    'Read-only (search analytics, sitemaps, URL inspection), so a repeat is safe.',
  degradation:
    'The daily cron records a failed outcome and the dashboard keeps serving the last successful ingest; no user-facing surface depends on a live call.',
  telemetryFields: "'cron_gsc' (synced / skipped / failed).",
});
const discordWebhooks = policy({
  wrapper: { module: 'src/lib/discord.ts', symbol: 'postDiscordWebhook' },
  timeout: '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors: 'None.',
  backoff: 'None.',
  rateLimit: "Discord's own webhook limits; delivery volume is operator alerts only.",
  idempotency:
    'Non-idempotent — a retry would post a duplicate message, which is why none is attempted.',
  degradation:
    'Fire-and-forget: an unset DISCORD_ALERT_WEBHOOK_URL skips delivery silently while telemetry still records.',
  telemetryFields: "'public_esi_budget_alerted'.",
});
const fuzzworkPrices = policy({
  wrapper: {
    module: 'src/data/market-prices/source-fallback.ts',
    symbol: 'fetchPricesFromFuzzwork',
  },
  timeout: '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors: 'None.',
  backoff: 'None.',
  rateLimit:
    'No app-side limiter; this is the low-volume fallback source, not the primary.',
  idempotency: 'Read-only price aggregates.',
  degradation:
    'This integration is itself the degradation target for ESI prices. A non-OK response or a body that fails boundary validation throws, and the caller keeps the last persisted prices.',
  telemetryFields: "'price_source_degraded', 'market_price_refresh' (source mix).",
});
const ccpStaticData = policy({
  wrapper: {
    module: 'src/data/eve-data/source.ts',
    symbol: 'downloadSdeJsonl',
  },
  timeout:
    '60s for the SDE download (SDE_DOWNLOAD_TIMEOUT_MS — the abort caps the whole multi-MB transfer, not just time-to-headers) and 10s for the version/manifest probes.',
  retryableErrors: 'None; the daily cron run is the retry.',
  backoff: 'None.',
  rateLimit: "None; CCP's static export is fetched at most once per day.",
  idempotency:
    'Read-only download. The ingest it feeds is a full rebuild guarded by an advisory lock, so a repeat converges on the same dataset.',
  degradation:
    'The deploy-time bootstrap soft-fails so a failed ingest cannot fail a build, and the existing SDE tables keep serving.',
  telemetryFields: "'cron_sde' (refreshed / skipped).",
});
const eveNewsFeed = policy({
  wrapper: { module: 'src/data/eve-news/queries.ts', symbol: 'getEveNews' },
  timeout: '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors: 'None.',
  backoff: 'None.',
  rateLimit: 'None; the read is cached and shared across requests.',
  idempotency: 'Read-only RSS.',
  degradation:
    'Failure is caught inside the cache boundary and cached as an empty list on a short-lived profile — an error crossing a use-cache boundary during build prerender fails the deploy even when the consumer catches it — so the news card renders its empty state and self-heals within minutes.',
  telemetryFields: 'None.',
});
const ccpImageCdn = policy({
  wrapper: { module: 'src/components/eve-image.tsx', symbol: 'EveImage' },
  timeout:
    'None available: the browser owns the image fetch, and no app-controlled timeout or abort signal exists for it. Recorded rather than omitted so the absence is a decision, not a gap.',
  retryableErrors: "The browser's own image loading; the app adds none.",
  backoff: 'None.',
  rateLimit:
    "CCP's image server limits; requests go direct and never through the Vercel optimizer.",
  idempotency: 'Read-only, cacheable image GETs.',
  degradation:
    'A failed load renders as a broken or empty image inside the wrapper’s reserved layout box; no data path depends on it.',
  telemetryFields: 'None; client-side asset loading is not instrumented.',
});
const anoikStatics = policy({
  wrapper: {
    module: 'src/data/wh-statics/source.ts',
    symbol: 'fetchStaticsFeed',
  },
  timeout: '10s per request (WH_STATICS_FETCH_TIMEOUT_MS via fetchWithTimeout).',
  retryableErrors:
    'None. The weekly schedule or an operator-triggered refresh is the next attempt.',
  backoff: 'None.',
  rateLimit:
    'No app-side limiter; one weekly conditional GET plus explicit operator-triggered requests.',
  idempotency:
    'Read-only conditional GET. A changed body enters a pending snapshot and never promotes automatically.',
  degradation:
    'Network, timeout and non-200 outcomes become feed-unavailable while the last promoted Neon copy keeps serving.',
  telemetryFields:
    "'cron_wh_statics' outcomes (unchanged, feed-unavailable, stale-observation, snapshot-pending).",
});

export const vendorResilienceRegistry: Record<
  VendorIntegrationId,
  VendorResilienceEntry
> = {
  'eve-esi': eveEsi,
  'eve-sso': eveSso,
  'better-auth': betterAuth,
  convex: convexLive,
  'upstash-redis': upstashRedis,
  'neon-postgres': neonPostgres,
  'vercel-platform': vercelPlatform,
  'github-tooling': githubTooling,
  'linear-issues': linearIssues,
  'google-search-console': googleSearchConsole,
  'discord-webhooks': discordWebhooks,
  fuzzwork: fuzzworkPrices,
  'ccp-static-data': ccpStaticData,
  'eve-news-feed': eveNewsFeed,
  'ccp-image-cdn': ccpImageCdn,
  'anoik-statics': anoikStatics,
};
