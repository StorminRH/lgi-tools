import { z } from 'zod';

/**
 * Boundary validator for esi refresh worker summary schema; successful parsing yields the
 * normalized esi refresh jobs input consumed internally.
 */
export const esiRefreshWorkerSummarySchema = z.object({
  status: z.enum(['drained', 'skipped']),
  reason: z.literal('busy').optional(),
  claimed: z.number().int(),
  succeeded: z.number().int(),
  deferredForBudget: z.number().int(),
  failedRetryable: z.number().int(),
  failedPermanent: z.number().int(),
  deadLettered: z.number().int(),
  recovered: z.number().int(),
  durationMs: z.number(),
});

/**
 * Bounded worker-drain summary reporting claimed, succeeded, deferred, retried, terminal, and
 * dead-letter counts.
 */
export type EsiRefreshWorkerSummary = z.infer<typeof esiRefreshWorkerSummarySchema>;

/**
 * Boundary validator for retry esi refresh job form schema; successful parsing yields the
 * normalized esi refresh jobs input consumed internally.
 */
export const retryEsiRefreshJobFormSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  range: z.string().optional(),
});
