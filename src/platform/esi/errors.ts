/**
 * Refuse to dispatch when the effective error-budget remaining falls below
 * this floor. ESI's ceiling is 100 errors per window; refusing at 20 left
 * (80% spent) leaves slack for in-flight calls and for the egress-IP sharing
 * that makes our mirror an approximation.
 */
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
    public readonly retryAfterSeconds: number | null = null,
    public readonly resource: string | null = null,
  ) {
    super(
      `ESI error budget exhausted (${reason}): ${remaining} remaining (floor ${ESI_BUDGET_FLOOR})`,
    );
    this.name = 'EsiBudgetExhaustedError';
  }
}

export class EsiServerError extends Error {
  constructor(public readonly status: number) {
    super(`ESI server error: ${status}`);
    this.name = 'EsiServerError';
  }
}

export class EsiContractError extends Error {
  constructor() {
    super('ESI response failed boundary validation');
    this.name = 'EsiContractError';
  }
}
