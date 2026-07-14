// Error types the ESI gate throws and its consumers branch on. Kept in their
// own module (importing nothing from the slice) so both the gate and the data
// slices that re-throw them share one definition with no import cycle.

// Refuse to dispatch when the effective error-budget remaining falls below
// this floor. ESI's ceiling is 100 errors per window; refusing at 20 left
// (80% spent) leaves slack for in-flight calls and for the egress-IP sharing
// that makes our mirror an approximation.
export const ESI_BUDGET_FLOOR = 20;

// Why dispatch was refused (or aborted on a 420). One error class for every
// reason: the market-prices bulk path re-throws error types it doesn't
// recognize, so a refusal must always be an EsiBudgetExhaustedError to reach
// the Fuzzwork fallback.
export type EsiBudgetExhaustedReason =
  | 'error_budget'
  | 'esi_420'
  | 'rate_limited'
  | 'scoreboard_unavailable'
  | 'trickle_capped';

// Thrown when the gate refuses to dispatch (or ESI answers 420). Caller
// should stop dispatching ESI calls and degrade.
export class EsiBudgetExhaustedError extends Error {
  constructor(
    public readonly remaining: number,
    public readonly reason: EsiBudgetExhaustedReason = 'error_budget',
    public readonly retryAfterSeconds: number | null = null,
    public readonly resource: string | null = null,
  ) {
    super(
      `ESI error budget exhausted (${reason}): ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`,
    );
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
