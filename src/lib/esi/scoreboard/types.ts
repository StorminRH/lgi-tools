// Shared types and storage-policy constants for the ESI budget scoreboard.
// Declarative only — no logic — so every other scoreboard module imports its
// shapes from here without creating an import cycle.
//
// Two CCP limit systems are mirrored:
//  • Legacy error limit — per-IP, ALL routes, fixed 60s window, 100 non-2xx/3xx
//    responses, then 420 everywhere. Mirrored two ways and combined
//    pessimistically: a self-count of our own error responses (per
//    epoch-minute counters; survives routes that don't send the legacy
//    headers) and an echo of the lowest X-ESI-Error-Limit-Remain any instance
//    observed (expires at the window reset).
//  • Token-bucket rate limit (rolling out per route group since 2026-02) —
//    per-group X-Ratelimit-* state is stored for observability (the 3.4.9
//    sync engine schedules off it; nothing reads it for go/no-go yet), and a
//    429's Retry-After becomes a block key on the normalized route path that
//    pre-dispatch honors.
//
// ETag state also lives in the scoreboard: per-URL meta (etag/expires/content-
// type) and the cached body a 304 revalidation re-serves. Bodies are stored
// only for unauthenticated GETs at or under BODY_CACHE_MAX_BYTES — the shared
// cache must never hold per-character data, and the multi-hundred-KB region-dump
// pages churn every 5 minutes anyway, so caching them buys nothing.

// CCP's legacy error-limit ceiling: 100 non-2xx/3xx per 60s window.
export const ESI_ERROR_CEILING = 100;

// Cache bodies at or under this size (bytes). Per-type market responses fit;
// region-dump pages don't (deliberate — see header comment).
export const BODY_CACHE_MAX_BYTES = 131_072;

// Self-count minute keys live just past the two-bucket read window.
export const ERROR_COUNT_TTL_SECONDS = 120;
// Group state outlives the ~15-min floating window by a margin.
export const GROUP_STATE_TTL_SECONDS = 1200;
// ETag meta/body: refreshed on every revalidation, dropped after two idle days.
export const ETAG_TTL_SECONDS = 172_800;

export interface CachedEtagMeta {
  etag: string;
  expires: string | null;
  contentType: string | null;
}

export interface PreDispatchState {
  // min(echo ?? ceiling, ceiling − selfCount) — the pessimistic combination
  // of both error-limit mirrors.
  effectiveRemaining: number;
  // Seconds REMAINING on an active Retry-After block for this route, or null
  // when there is none. Remaining (not the original Retry-After duration) so
  // a scheduler can compute the retry deadline as `now + blockedRetryAfter`.
  blockedRetryAfter: number | null;
  // Stored ETag meta for this URL (only populated when the gate asked).
  etag: CachedEtagMeta | null;
}

// Everything the gate observed about one ESI response, pre-parsed. The
// scoreboard turns it into key writes; it never touches Response objects.
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
  // 200-with-ETag, eligible: store meta + body together (meta without a body
  // would make the next call burn 1 token on a 304 it can't serve — worse
  // than an unconditional 200).
  etagToStore: (CachedEtagMeta & { body: string }) | null;
  // 304: refresh the meta (new expires) and the body's TTL.
  refreshEtag: CachedEtagMeta | null;
}

export interface EsiScoreboard {
  preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState>;
  report(report: EsiReport): Promise<void>;
  getCachedBody(url: string): Promise<string | null>;
}
