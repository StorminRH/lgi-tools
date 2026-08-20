// VENDOR RESILIENCE REGISTRY (3.10.2.4) — the sibling of
// data-ownership-registry.ts. The ownership registry answers "who owns this
// table"; this one answers "when we call out of the process, what bounds the
// call, what may be retried, and what happens when it fails".
//
// Every field records live behavior rather than an aspiration: the registry is a
// description of the shipped code, and its census
// (src/esi-datasets/vendor-resilience.test.ts) fails when the description and
// the tree disagree. Adding a vendor means adding its entry here.
//
// Test-only, exactly like its sibling: no runtime module imports it. Timeout and
// retry values are enforced at their call sites, not read from this file — a
// registry that configured behavior could drift silently into being the only
// place a bound existed.

/**
 * Closed set of external integrations this app talks to. Adding a vendor means adding its policy
 * here; the census rejects a declared wrapper that does not exist and a construction site that no
 * declared wrapper owns.
 */
export type VendorIntegrationId =
  | 'eve-esi'
  | 'eve-sso'
  | 'better-auth'
  | 'convex'
  | 'upstash-redis'
  | 'neon-postgres'
  | 'vercel-platform'
  | 'github-tooling'
  | 'github-issues'
  | 'google-search-console'
  | 'discord-webhooks'
  | 'fuzzwork'
  | 'ccp-static-data'
  | 'eve-news-feed'
  | 'ccp-image-cdn'
  | 'anoik-statics';

/**
 * One integration's declared resilience policy — the eight recorded facts. `wrapper` names the
 * module and exported symbol every call must route through, which the census resolves against the
 * real tree.
 */
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

/**
 * An integration with no programmatic call surface records that fact instead of a fabricated
 * policy, so an empty policy can never be mistaken for an unaudited one.
 */
export interface NoProgrammaticSurface {
  noProgrammaticSurface: true;
  fact: string;
}

/** One registry entry: a declared policy, or the recorded absence of any call surface. */
export type VendorResilienceEntry = VendorResiliencePolicy | NoProgrammaticSurface;

/**
 * Narrows a registry entry to the recorded-absence shape; the census uses it to apply the
 * eight-field completeness rule only to entries that actually have a call surface.
 */
export function isNoProgrammaticSurface(
  entry: VendorResilienceEntry,
): entry is NoProgrammaticSurface {
  return 'noProgrammaticSurface' in entry;
}

function policy(
  module: string,
  symbol: string,
  timeout: string,
  retryableErrors: string,
  backoff: string,
  rateLimit: string,
  idempotency: string,
  degradation: string,
  telemetryFields: string,
): VendorResiliencePolicy {
  return {
    wrapper: { module, symbol },
    timeout,
    retryableErrors,
    backoff,
    rateLimit,
    idempotency,
    degradation,
    telemetryFields,
  };
}

function noSurface(fact: string): NoProgrammaticSurface {
  return { noProgrammaticSurface: true, fact };
}

const eveEsi = policy('src/platform/esi/index.ts', 'esiFetch', '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None at the dispatch layer. A 304 whose cached body has been evicted triggers one unconditional re-request — a cache repair, not an error retry.', 'No client backoff. CCP 429s and 420s become a Redis-recorded block on the normalized path, and the pre-dispatch gate refuses calls until it expires.', "The shared Redis scoreboard owns CCP's per-IP error budget: two-minute-bucket self counts plus the server's error-limit echo, evaluated before dispatch. Refusals are recorded by markRecentBudgetExhaustion.", 'Read-only ESI operations only: GET queries plus public POST resolvers whose JSON bodies name lookup inputs and perform no mutation, so a repeat is safe.', 'Per caller: background and price reads fall back to stored data or Fuzzwork; interactive character search returns its declared unavailable problem when scoped or exact live resolution cannot complete.', "'price_source_degraded', 'public_esi_budget_alert_claimed', 'public_esi_budget_alerted'.");
const eveSso = policy('src/platform/auth/eve-sso.ts', 'exchangeCodeForToken', '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None. A token exchange or refresh is attempted once; the outcome is classified and recorded instead.', 'None — no retry to space out.', 'No app-side limiter; EVE SSO owns its own limits.', 'Non-idempotent: an authorization code is single-use and a refresh may rotate the stored token, so a blind retry can invalidate a live grant.', 'Failure surfaces to the sign-in or token-vend caller as a classified reason; the stored token is left untouched unless EVE explicitly rejected it.', "'eve_token_refresh_invalid_grant', 'eve_token_refresh_timeout', 'eve_token_refresh_connection', 'eve_token_refresh_provider_5xx', 'eve_token_refresh_unexpected', 'eve_token_refresh_race'.");
const betterAuth = policy('src/platform/auth/auth.ts', 'auth', "Bounded indirectly: the vendor orchestrates the flow, but its outbound EVE legs are overridden onto fetchWithTimeout (10s), and its database access runs through the Drizzle adapter on Neon's bounds.", 'None added; the SDK owns its own request lifecycle.', 'None added.', 'Auth-adjacent routes are limited by checkRateLimit (src/lib/rate-limit.ts) ahead of the handler.', 'Session and account mutations are non-idempotent and never auto-retried.', 'Errors surface as sign-in failures; one Better Auth user always represents one human, so no partial-identity fallback exists.', "'auth_login', 'auth_logout', 'auth_absorb', 'account_purge'.");
const convexLive = policy('src/data/convex/client.ts', 'convexClient', 'None available on the browser client: it holds a WebSocket subscription with no per-call timeout knob. Server-side calls in the other direction (Convex to our first-party API) are bounded at 10s by src/platform/auth/service-client.ts.', 'The vendor client owns socket reconnection; the app adds no retry.', "The vendor client's own reconnect schedule.", 'None; Convex is first-party infrastructure with no shared budget to protect.', 'Live projections are fully regenerable and Convex never writes to Neon, so a replayed sync is safe by construction.', 'A null client (NEXT_PUBLIC_CONVEX_URL unset) disables live reads and every consumer renders its non-live path; the rest of the site is unaffected.', "'cron_sync_sweeper' (the watchdog that detects a lagging Convex scan).");
const upstashRedis = policy('src/lib/upstash.ts', 'createUpstashClient', 'Explicit per client: 1500ms for the ESI scoreboard (on the go/no-go path of every ESI call), 2000ms for the rate limiter and the two hint writers. Enforced by a portable AbortController signal the SDK invokes once per request.', 'Transient non-abort network errors only. A timeout abort is rethrown immediately by SDK design, so the bound is never multiplied by the retry count.', "The SDK's exponential backoff, reached only by the rate limiter's single retry; the other three clients declare zero retries.", 'This integration is itself the rate-limit backend (sliding window via @upstash/ratelimit) and the ESI budget store.', 'The hint writes are idempotent (a set, and an eval that only lowers a stored timestamp). Rate-limit counters are intentionally incrementing, so a retried increment would over-count — which is why a timeout is never retried.', "Per call site and unchanged by this policy: unconfigured or failed hint writes are swallowed (the durable Neon queue stays authoritative), the exhaustion marker answers 'unknown' so callers keep their Neon fallback, the scoreboard falls back to its local budget, and the rate limiter bypasses in non-production but fails closed in production.", "None of its own; it appears in consumers' outcomes ('price_source_degraded', 'cron_esi_refresh_jobs').");
const neonPostgres = policy('src/db/index.ts', 'db', 'HTTP driver: 30000ms per query, installed as the driver-global neonConfig.fetchFunction inside the lazy client builder (the driver exposes no per-client hook; there is exactly one neon() consumer, so the global bounds only this client). postgres-js: connect_timeout 30s, establishment only. No statement timeout — advisory-lock holders and ingest legitimately run long.', "Connection-class only, per isNeonColdStartError: the driver's fetch-rejection wrap, a proxy 5xx, SQLSTATE class 08, and 57P03. Explicitly excluded is a wrap caused by our own timeout abort, which would otherwise multiply one bounded 30s wait into the full retry envelope.", 'Exponential across at most 4 attempts (500ms / 1s / 2s), sized to stay under Next’s prerender cache-fill ceiling. Applies only to prerender-reachable cached reads via withColdStartRetry.', 'None; connection ceilings are managed by pool sizing per client.', 'Retries are confined to connection-class failures, where no statement reached the server, so a retried read cannot double-apply work.', 'None by design: a retry-exhausted read rethrows so a genuinely broken build fails loudly rather than caching an empty result into a long-lived entry.', "'neon_cold_start_retry' (outcome, attempts, totalDelayMs).");
const vercelPlatform = noSurface('The app makes no Vercel API call. Its only src artifact is the build-injected @vercel/speed-insights beacon component in src/app/layout.tsx, which reports from the browser and exposes no app-controlled request. Deployment and environment actions are operator CLI work, outside the request path.');
const githubTooling = policy('tools/delivery/github_api.py', 'request', 'Explicit on every call: 30s (github_api.py, and _FETCH_TIMEOUT in update_watch_collect.py). Outside ESLint scope, so the census asserts the timeout argument directly.', 'None; a failed call is a named failure the tooling reports.', 'None.', "GitHub's own limits; the tooling makes single low-volume calls and passes a token when one is present.", 'Reads are idempotent. Mutations (opening or closing an issue) are never auto-retried, which is why no retry policy exists here.', 'Fail-closed: a missing binary, an unreadable repo identity, or a failed request is a refusal, never a crash and never a silently-clean result.', "None; outcomes are the routine's own reported verdict.");
const githubIssues = policy('src/features/feedback/create-github-issue.ts', 'createFeedbackGithubIssue', '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None.', 'None.', "GitHub's authenticated REST limits; delivery volume is user feedback submissions already capped at 5/min per IP.", 'Non-idempotent — a retry would open a duplicate issue, which is why none is attempted.', 'Unset GITHUB_FEEDBACK_TOKEN surfaces 503 feedback_unconfigured; GitHub transport or rejection surfaces 502 github_failed to the submitter and skips telemetry.', "'feedback_submitted'.");
const googleSearchConsole = policy('src/data/gsc/source.ts', 'querySearchAnalytics', '10s on both legs: the API request through fetchWithTimeout, and the SDK’s own token acquisition through the JWT transporterOptions timeout.', 'None; a failed sync surfaces to the cron.', 'None.', "Google's own quotas; the daily cron makes a bounded number of calls.", 'Read-only (search analytics, sitemaps, URL inspection), so a repeat is safe.', 'The daily cron records a failed outcome and the dashboard keeps serving the last successful ingest; no user-facing surface depends on a live call.', "'cron_gsc' (synced / skipped / failed).");
const discordWebhooks = policy('src/lib/discord.ts', 'postDiscordWebhook', '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None.', 'None.', "Discord's own webhook limits; delivery volume is operator alerts only.", 'Non-idempotent — a retry would post a duplicate message, which is why none is attempted.', 'Fire-and-forget: an unset DISCORD_ALERT_WEBHOOK_URL skips delivery silently while telemetry still records.', "'public_esi_budget_alerted'.");
const fuzzworkPrices = policy('src/data/market-prices/source-fallback.ts', 'fetchPricesFromFuzzwork', '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None.', 'None.', 'No app-side limiter; this is the low-volume fallback source, not the primary.', 'Read-only price aggregates.', 'This integration is itself the degradation target for ESI prices. A non-OK response or a body that fails boundary validation throws, and the caller keeps the last persisted prices.', "'price_source_degraded', 'market_price_refresh' (source mix).");
const ccpStaticData = policy('src/data/eve-data/source.ts', 'downloadSdeJsonl', '60s for the SDE download (SDE_DOWNLOAD_TIMEOUT_MS — the abort caps the whole multi-MB transfer, not just time-to-headers) and 10s for the version/manifest probes.', 'None; the daily cron run is the retry.', 'None.', "None; CCP's static export is fetched at most once per day.", 'Read-only download. The ingest it feeds is a full rebuild guarded by an advisory lock, so a repeat converges on the same dataset.', 'The deploy-time bootstrap soft-fails so a failed ingest cannot fail a build, and the existing SDE tables keep serving.', "'cron_sde' (refreshed / skipped).");
const eveNewsFeed = policy('src/data/eve-news/queries.ts', 'getEveNews', '10s per request (OUTBOUND_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None.', 'None.', 'None; the read is cached and shared across requests.', 'Read-only RSS.', 'Failure is caught inside the cache boundary and cached as an empty list on a short-lived profile — an error crossing a use-cache boundary during build prerender fails the deploy even when the consumer catches it — so the news card renders its empty state and self-heals within minutes.', 'None.');
const ccpImageCdn = policy('src/components/eve-image.tsx', 'EveImage', 'None available: the browser owns the image fetch, and no app-controlled timeout or abort signal exists for it. Recorded rather than omitted so the absence is a decision, not a gap.', "The browser's own image loading; the app adds none.", 'None.', "CCP's image server limits; requests go direct and never through the Vercel optimizer.", 'Read-only, cacheable image GETs.', 'A failed load renders as a broken or empty image inside the wrapper’s reserved layout box; no data path depends on it.', 'None; client-side asset loading is not instrumented.');
const anoikStatics = policy('src/data/wh-statics/source.ts', 'fetchStaticsFeed', '10s per request (WH_STATICS_FETCH_TIMEOUT_MS via fetchWithTimeout).', 'None. The weekly schedule or an operator-triggered refresh is the next attempt.', 'None.', 'No app-side limiter; one weekly conditional GET plus explicit operator-triggered requests.', 'Read-only conditional GET. A changed body enters a pending snapshot and never promotes automatically.', 'Network, timeout and non-200 outcomes become feed-unavailable while the last promoted Neon copy keeps serving.', "'cron_wh_statics' outcomes (unchanged, feed-unavailable, stale-observation, snapshot-pending).");

/** The vendor resilience registry: every external integration's declared policy or recorded absence. */
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
  'github-issues': githubIssues,
  'google-search-console': googleSearchConsole,
  'discord-webhooks': discordWebhooks,
  fuzzwork: fuzzworkPrices,
  'ccp-static-data': ccpStaticData,
  'eve-news-feed': eveNewsFeed,
  'ccp-image-cdn': ccpImageCdn,
  'anoik-statics': anoikStatics,
};
