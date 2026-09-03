import { z } from 'zod';
import { defineEndpoint, jsonBody } from '@/transport/endpoint';
import { industryJobSchema } from './esi-projection';

const characterJobsDataSchema = z.object({
  jobs: z.array(industryJobSchema),
});

const viewerJobsSchema = z.object({
  characterId: z.number(),
  data: characterJobsDataSchema.nullable(),
  lastRefreshedAt: z.number().nullable(),
});

const jobsResponseSchema = z.object({
  characters: z.array(viewerJobsSchema),

  names: z.record(z.string(), z.string()),
});

export type JobsResponse = z.infer<typeof jobsResponseSchema>;

export const industryJobsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/industry-jobs',
  request: null,
  responses: {
    200: jsonBody(jobsResponseSchema),
  },
});

const viewerCorpJobsSchema = z.object({
  corporationId: z.number(),
  data: characterJobsDataSchema.nullable(),
  lastRefreshedAt: z.number().nullable(),
  syncError: z.string().nullable(),
});

const corpJobsResponseSchema = z.object({
  corporations: z.array(viewerCorpJobsSchema),
  names: z.record(z.string(), z.string()),
});

export type CorpJobsResponse = z.infer<typeof corpJobsResponseSchema>;

export const corpIndustryJobsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/corp-industry-jobs',
  request: null,
  responses: {
    200: jsonBody(corpJobsResponseSchema),
  },
});

const slotCapacitySchema = z.object({
  manufacturing: z.number().int(),
  science: z.number().int(),
  reactions: z.number().int(),
});

const viewerSlotsSchema = z.object({
  characterId: z.number(),
  slots: slotCapacitySchema,
  synced: z.boolean(),
});

const industrySlotsResponseSchema = z.object({
  characters: z.array(viewerSlotsSchema),
});

export type ViewerSlots = z.infer<typeof viewerSlotsSchema>;

export type IndustrySlotsResponse = z.infer<typeof industrySlotsResponseSchema>;

export const industrySlotsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/industry-slots',
  request: null,
  responses: {
    200: jsonBody(industrySlotsResponseSchema),
  },
});
