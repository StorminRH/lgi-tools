import { describe, expect, it } from 'vitest';
import { esiRefreshWorkerSummarySchema } from './api-contract';

const zeroSummary = {
  status: 'skipped',
  claimed: 0,
  succeeded: 0,
  deferredForBudget: 0,
  failedRetryable: 0,
  failedPermanent: 0,
  deadLettered: 0,
  recovered: 0,
  durationMs: 0,
} as const;

describe('esiRefreshWorkerSummarySchema', () => {
  it('accepts the declared busy and idle skip reasons', () => {
    expect(
      esiRefreshWorkerSummarySchema.safeParse({
        ...zeroSummary,
        reason: 'busy',
      }).success,
    ).toBe(true);
    expect(
      esiRefreshWorkerSummarySchema.safeParse({
        ...zeroSummary,
        reason: 'idle',
      }).success,
    ).toBe(true);
  });

  it('rejects skip reasons outside the declared response contract', () => {
    expect(
      esiRefreshWorkerSummarySchema.safeParse({
        ...zeroSummary,
        reason: 'quiet',
      }).success,
    ).toBe(false);
  });
});
