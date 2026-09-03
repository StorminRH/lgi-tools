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

export const whStaticsAdminFormSchema = z.union([
  snapshotActionSchema,
  refreshActionSchema,
]);

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

export type CronRefreshWhStaticsResponse = WhStaticsRefreshResult;

export const systemStaticsParamsSchema = z.object({
  systemId: z.coerce.number().int().positive().safe(),
});

const systemStaticsResponseSchema = z.object({
  statics: z.array(z.string()),
});

export const systemStaticsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/statics/[systemId]',
  request: null,
  params: systemStaticsParamsSchema,
  responses: {
    200: jsonBody(systemStaticsResponseSchema),
  },
});
