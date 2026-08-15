import { z } from 'zod';
import { defineEndpoint, jsonBody } from '@/transport/endpoint';

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
  | { readonly status: 'stale-observation' }
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

/** Dynamic path boundary for one promoted solar-system statics lookup. */
export const systemStaticsParamsSchema = z.object({
  systemId: z.coerce.number().int().positive().safe(),
});

/** Small picker payload for one system; an unknown system owns no statics. */
const systemStaticsResponseSchema = z.object({
  statics: z.array(z.string()),
});

/** Public read-only endpoint serving promoted statics to the Atlas type picker. */
export const systemStaticsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/statics/[systemId]',
  request: null,
  params: systemStaticsParamsSchema,
  responses: {
    200: jsonBody(systemStaticsResponseSchema),
  },
});
