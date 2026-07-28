import { z } from 'zod';

const snapshotActionSchema = z.object({
  action: z.enum(['promote', 'reject']),
  snapshotId: z.coerce.number().int().positive(),
});

const refreshActionSchema = z.object({
  action: z.literal('refresh'),
  snapshotId: z.undefined().optional(),
});

/** Boundary validator for the admin statics review form POST. */
export const whStaticsAdminFormSchema = z.union([
  snapshotActionSchema,
  refreshActionSchema,
]);

/** Response vocabulary shared by the scheduled and on-demand refresh paths. */
export type WhStaticsRefreshResult =
  | { readonly status: 'unchanged' }
  | { readonly status: 'feed-unavailable'; readonly reason: string }
  | { readonly status: 'busy' }
  | {
      readonly status: 'snapshot-pending';
      readonly snapshotId: number;
      readonly feedVersion: string;
      readonly systemCount: number;
      readonly assignmentCount: number;
      readonly totalDifferences: number;
      readonly disagreementCount: number;
    };

/** JSON response returned by the weekly statics cron. */
export type CronRefreshWhStaticsResponse = WhStaticsRefreshResult;
