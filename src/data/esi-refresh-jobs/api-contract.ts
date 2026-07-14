import { z } from 'zod';

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

export type EsiRefreshWorkerSummary = z.infer<typeof esiRefreshWorkerSummarySchema>;
