import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

// Wrapper around `fetch` that enforces ESI's error-limit budget. Every ESI
// response carries X-ESI-Error-Limit-Remain (a count, not a percentage)
// and X-ESI-Error-Limit-Reset (seconds until the window resets). The
// remaining count decrements on every error response (4xx/5xx) and resets
// on the window boundary. At zero, ESI returns 420 and starts banning the
// caller's IP for ~24h.
//
// The limit is per-IP and shared across every ESI call the app makes, so
// this gate is the single door: all ESI consumers route through esiFetch
// (a second wrapper with its own budget state would under-count the shared
// limit). The gate is OAuth-agnostic — headers passed via `init` (e.g. a
// per-call Authorization token) go through untouched.
//
// Strategy: track the latest remaining count in module-level state, and
// refuse to dispatch new calls when it dips below ESI_BUDGET_FLOOR. Callers
// catch the refusal and degrade their own way (market-prices falls back to
// its Fuzzwork mirror for the affected batch).

// Refuse to dispatch new ESI calls when X-ESI-Error-Limit-Remain falls
// below this floor. ESI's actual ceiling is 100 errors per rolling
// window; a 20-error pre-ban margin gives us enough slack to log and
// degrade before the next request would trip the ban.
export const ESI_BUDGET_FLOOR = 20;

// Thrown when the budget remaining drops below ESI_BUDGET_FLOOR. Caller
// should stop dispatching ESI calls and degrade.
export class EsiBudgetExhaustedError extends Error {
  constructor(public readonly remaining: number) {
    super(`ESI error budget exhausted: ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`);
    this.name = 'EsiBudgetExhaustedError';
  }
}

// Thrown when ESI returns a 5xx. Caller may retry or degrade. Treated
// as a transient single-call failure, not a global outage — e.g. the
// market-prices bulk path upgrades repeated 5xx to a Fuzzwork-fallback
// escalation.
export class EsiServerError extends Error {
  constructor(public readonly status: number) {
    super(`ESI server error: ${status}`);
    this.name = 'EsiServerError';
  }
}

// Thrown when an ESI response body fails its boundary schema (a shape change
// or an unexpected error body). Callers route it the same way they route an
// HTTP error — a malformed body is no more usable than a 5xx.
export class EsiContractError extends Error {
  constructor() {
    super('ESI response failed boundary validation');
    this.name = 'EsiContractError';
  }
}

// Latest X-ESI-Error-Limit-Remain seen across all calls. Initialized to
// Infinity so the first call always dispatches (no info → assume healthy).
// Module-level, so per-Lambda: each cold Vercel instance starts fresh at
// Infinity and concurrent invocations don't share this knowledge. Fine given
// pricing's hourly cron cadence and ESI's ~60s reset window — not shared
// global state. CARRY-FORWARD: per-user character syncs (3.4.6+) break that
// cadence assumption — many short-lived invocations each start blind at
// Infinity and can collectively overshoot the shared per-IP budget. Resolved
// by Decision Record 11: the budget moves to a shared atomic scoreboard
// (Upstash Redis) in 3.4.5, which upgrades this gate in place.
let latestRemaining = Number.POSITIVE_INFINITY;

// Read the budget remaining; intended for diagnostics + tests, not for
// callers to gate dispatch (esiFetch already does that).
export function getBudgetRemaining(): number {
  return latestRemaining;
}

// Reset module-level state between Vitest cases. Not for runtime callers.
export function __resetBudgetForTests(): void {
  latestRemaining = Number.POSITIVE_INFINITY;
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (latestRemaining < ESI_BUDGET_FLOOR) {
    throw new EsiBudgetExhaustedError(latestRemaining);
  }

  // Identify ourselves on every ESI call. Default (set-if-absent) so a
  // deliberate caller could override, while no call goes out anonymous.
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', OUTBOUND_USER_AGENT);
  }
  // Pin the ESI contract date (forced — the app speaks one route and the date
  // is a single reviewed constant; a per-call override would un-pin it).
  headers.set('X-Compatibility-Date', ESI_COMPATIBILITY_DATE);

  const res = await fetchWithTimeout(url, { ...init, headers });

  const remainHeader = res.headers.get('X-ESI-Error-Limit-Remain');
  if (remainHeader !== null) {
    const parsed = Number.parseInt(remainHeader, 10);
    if (Number.isFinite(parsed)) {
      latestRemaining = parsed;
    }
  }

  // 420 is ESI's "you hit the limit, back off now" sentinel. Treat as
  // exhausted regardless of header value — the header arrives stale on
  // these responses.
  if (res.status === 420) {
    throw new EsiBudgetExhaustedError(latestRemaining);
  }

  if (res.status >= 500) {
    throw new EsiServerError(res.status);
  }

  return res;
}
