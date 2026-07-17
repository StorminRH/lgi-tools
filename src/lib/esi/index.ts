import {
  consultPreDispatch,
  dispatch,
  enforceBudget,
  getScoreboard,
  isEtagEligible,
  serveFromExpiresWindow,
  type EsiFetchOptions,
} from './dispatch';

// Wrapper around `fetch` that enforces CCP's ESI limits. Two systems apply
// (verified live 2026-06-11):
//
//  • The legacy error limit — per-IP, ALL routes, fixed 60s window, 100
//    non-2xx/3xx responses, then 420 everywhere and (repeated) a permanent
//    IP ban. Headers: X-ESI-Error-Limit-Remain / -Reset.
//  • The token-bucket rate limit (rolling out per route group) — 2 tokens per
//    2xx, 1 per 3xx (so a 304 costs half a 200), 5 per 4xx, 0 per 5xx, ~15-min
//    floating window. Headers: X-Ratelimit-Group/-Limit/-Remaining/-Used;
//    429 + Retry-After when exhausted. A response carries one header system
//    or the other, never both — so the error-limit mirror can't rely on
//    header echo alone.
//
// Both limits are shared across every serverless instance we run, so the
// budget state lives in a shared Upstash Redis scoreboard (scoreboard/,
// Decision Record 11): every esiFetch consults it before dispatch and reports
// every response's headers back to it. This gate is the single door — all ESI
// consumers route through esiFetch (the esi.evetech.net host literal is
// lint-banned outside this slice; build URLs with esiUrl). The gate is
// OAuth-agnostic: headers passed via `init` (e.g. a per-call Authorization
// token) go through untouched. The dispatch machinery, budget enforcement, and
// per-instance fallback state live in ./dispatch; the error types in ./errors.
//
// Posture: fail closed. If the scoreboard is unreachable, non-interactive
// dispatch refuses (callers degrade their own way — market-prices falls back
// to its Fuzzwork mirror) and `interactive: true` callers get a hard-capped
// per-instance trickle. ETags are used aggressively: a stored ETag rides out
// as If-None-Match, and a 304 is re-served from the cached body as a normal
// 200 (cache circumvention is a documented bannable offense; conditional
// requests are the documented good citizenship). One step further: while ESI's
// own cache window (the stored Expires) is still open and the body is in hand,
// an unauthenticated ETag-eligible GET is served from that cached body with no
// dispatch at all — the conditional round-trip would only return data we
// already hold and already know is fresh. Authenticated calls never touch the
// shared cache and dispatch every time.
//
// The `budgetExhausted` signal callers thread into telemetry now covers every
// refusal reason (error budget, 420, a 429 Retry-After block, scoreboard
// unreachable, trickle cap) — same flag, same degradation path.

// The public error surface and the budget floor live in ./errors; re-exported
// here so every consumer keeps importing them from '@/lib/esi'.
export {
  EsiBudgetExhaustedError,
  EsiServerError,
  EsiContractError,
  ESI_BUDGET_FLOOR,
  type EsiBudgetExhaustedReason,
} from './errors';
// Test seams + the options type live with the engine in ./dispatch.
export { __resetEsiGateForTests, __setScoreboardForTests } from './dispatch';
export type { EsiFetchOptions } from './dispatch';

// Label-less by design: CCP warns against the `/latest` label (it can shift
// behavior when they bump what it points at), so we drop it and pin the
// contract via the X-Compatibility-Date header instead (src/config/esi.ts).
const ESI_BASE_URL = 'https://esi.evetech.net';

/**
 * The only sanctioned way to construct an ESI URL — the host literal is
 * lint-banned outside this slice so every consumer arrives here, where
 * esiFetch (and the shared budget) is the only dispatch on offer.
 */
export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

/**
 * Dispatches one ESI request through the sole shared budget, cache, retry, and telemetry gate;
 * callers retain endpoint-specific parsing.
 */
export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  const sb = getScoreboard();
  const wantEtag = isEtagEligible(init);

  const pre = await consultPreDispatch(sb, url, wantEtag);
  enforceBudget(pre, url, opts);

  // Non-null only when this call's pre-dispatch actually consulted the shared
  // scoreboard — a report never goes where a check didn't come from.
  const liveSb = pre !== null ? sb : null;
  const etagMeta = pre !== null && wantEtag ? pre.etag : null;

  // Still inside ESI's own cache window with the body in hand: hand back our
  // copy, no conditional round-trip. Falls through to a normal dispatch when
  // the window has closed or the body was evicted.
  if (etagMeta !== null && liveSb !== null) {
    const cached = await serveFromExpiresWindow(url, etagMeta, liveSb);
    if (cached !== null) return cached;
  }

  return dispatch(url, init, wantEtag, liveSb, etagMeta);
}
