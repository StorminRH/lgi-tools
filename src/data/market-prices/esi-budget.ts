import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { ESI_BUDGET_FLOOR } from './constants';

// Wrapper around `fetch` that enforces ESI's error-limit budget. Every ESI
// response carries X-ESI-Error-Limit-Remain (a count, not a percentage)
// and X-ESI-Error-Limit-Reset (seconds until the window resets). The
// remaining count decrements on every error response (4xx/5xx) and resets
// on the window boundary. At zero, ESI returns 420 and starts banning the
// caller's IP for ~24h.
//
// Strategy: track the latest remaining count in module-level state, and
// refuse to dispatch new calls when it dips below ESI_BUDGET_FLOOR. The
// dispatcher in source.ts catches the refusal and falls back to Fuzzwork
// for the affected batch.

// Thrown when the budget remaining drops below ESI_BUDGET_FLOOR. Caller
// should stop dispatching ESI calls and fall back to Fuzzwork.
export class EsiBudgetExhaustedError extends Error {
  constructor(public readonly remaining: number) {
    super(`ESI error budget exhausted: ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`);
    this.name = 'EsiBudgetExhaustedError';
  }
}

// Thrown when ESI returns a 5xx. Caller may retry or fall back. Treated
// as a transient single-call failure, not a global outage — the bulk path
// upgrades repeated 5xx to a Fuzzwork-fallback escalation.
export class EsiServerError extends Error {
  constructor(public readonly status: number) {
    super(`ESI server error: ${status}`);
    this.name = 'EsiServerError';
  }
}

// Latest X-ESI-Error-Limit-Remain seen across all calls. Initialized to
// Infinity so the first call always dispatches (no info → assume healthy).
// Module-level, so per-Lambda: each cold Vercel instance starts fresh at
// Infinity and concurrent invocations don't share this knowledge. Fine given
// the hourly cron cadence and ESI's ~60s reset window — not shared global state.
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

  const res = await fetch(url, { ...init, headers });

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
