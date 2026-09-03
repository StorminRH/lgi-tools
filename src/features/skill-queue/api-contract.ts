import { z } from 'zod';
import { defineEndpoint, jsonBody } from '@/transport/endpoint';
import { skillQueueEntrySchema } from './esi-projection';

const characterSkillDataSchema = z.object({
  entries: z.array(skillQueueEntrySchema),
  totalSp: z.number(),
  unallocatedSp: z.number().optional(),
});

const viewerSkillsSchema = z.object({
  characterId: z.number(),
  data: characterSkillDataSchema.nullable(),
  lastRefreshedAt: z.number().nullable(),
});

const skillsResponseSchema = z.object({
  characters: z.array(viewerSkillsSchema),

  names: z.record(z.string(), z.string()),
});

export type SkillsResponse = z.infer<typeof skillsResponseSchema>;

export const skillsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/skills',
  request: null,
  responses: {
    200: jsonBody(skillsResponseSchema),
  },
});
