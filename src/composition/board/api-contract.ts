import { z } from 'zod';
import { ATTRIBUTE_KEYS } from '@/data/eve-data/character-attributes';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import { skillQueueEntrySchema } from '@/features/skill-queue/esi-projection';
import { defineEndpoint, jsonBody } from '@/transport/endpoint';

/** What a reconnect would add, in the order the reconnect sentence names them. */
export const BOARD_GAPS = [
  'skills',
  'location',
  'wallet',
  'clones',
  'implants',
  'structures',
  'industry',
] as const;
export type BoardGap = (typeof BOARD_GAPS)[number];

export type BoardSection<T> =
  | { state: 'ready'; refreshedAt: number; data: T }
  | { state: 'pending' }
  | { state: 'reconnect' };

const sectionOf = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion('state', [
    z.object({ state: z.literal('ready'), refreshedAt: z.number(), data }),
    z.object({ state: z.literal('pending') }),
    z.object({ state: z.literal('reconnect') }),
  ]);

const systemRefSchema = z.object({
  id: z.number(),
  name: z.string(),
  security: z.number().nullable(),
  secClass: z.enum(SECURITY_CLASSES),
});
export type SystemRef = z.infer<typeof systemRefSchema>;

const placeRefSchema = z.object({
  kind: z.enum(['station', 'structure']),
  id: z.number(),
  name: z.string().nullable(),
  system: systemRefSchema.nullable(),
});
export type PlaceRef = z.infer<typeof placeRefSchema>;

const entityRefSchema = z.object({ id: z.number(), name: z.string().nullable() });

const skillLevelSchema = z.number().int().min(0).max(5);

const skillsDataSchema = z.object({
  totalSp: z.number(),
  unallocatedSp: z.number().nullable(),
  queue: z.array(skillQueueEntrySchema),
  levels: z.record(z.string(), skillLevelSchema),
  known: z.number().int(),
  atV: z.number().int(),
});
export type BoardSkillsData = z.infer<typeof skillsDataSchema>;

const profileDataSchema = z.object({
  birthday: z.string(),
  securityStatus: z.number().nullable(),
});

const statusDataSchema = z.object({
  online: z.boolean(),
  lastLogin: z.string().nullable(),
  system: systemRefSchema,
  dock: placeRefSchema.nullable(),
  ship: z.object({ typeId: z.number(), typeName: z.string(), name: z.string() }),
});

const attributesDataSchema = z.object({
  values: z.array(z.object({ key: z.enum(ATTRIBUTE_KEYS), base: z.number(), implant: z.number() })),
  bonusRemaps: z.number(),
  lastRemapDate: z.string().nullable(),
  nextRemapDate: z.string().nullable(),
});

const implantsDataSchema = z.object({
  implants: z.array(z.object({ typeId: z.number(), name: z.string(), slot: z.number().nullable() })),
});

const clonesDataSchema = z.object({
  home: placeRefSchema.nullable(),
  lastJumpDate: z.string().nullable(),
  jumpClones: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullable(),
      location: placeRefSchema,
      implantCount: z.number().int(),
    }),
  ),
});

const walletDataSchema = z.object({ balance: z.number() });

const journalDataSchema = z.object({
  windowStart: z.string(),
  inflow: z.number(),
  outflow: z.number(),
  series: z.array(z.object({ t: z.number(), balance: z.number() })),
  recent: z.array(
    z.object({
      id: z.number(),
      date: z.string(),
      refLabel: z.string(),
      amount: z.number(),
      description: z.string(),
    }),
  ),
});

const industryDataSchema = z.object({
  active: z.number().int(),
  ready: z.number().int(),
  slots: z.object({ used: z.number().int(), max: z.number().int() }),
});
export type BoardIndustryData = z.infer<typeof industryDataSchema>;

export const boardCharacterSchema = z.object({
  characterId: z.number(),
  name: z.string(),
  portraitUrl: z.string(),
  corporation: entityRefSchema.nullable(),
  alliance: entityRefSchema.nullable(),
  gaps: z.array(z.enum(BOARD_GAPS)),
  skills: sectionOf(skillsDataSchema),
  profile: sectionOf(profileDataSchema),
  status: sectionOf(statusDataSchema),
  attributes: sectionOf(attributesDataSchema),
  implants: sectionOf(implantsDataSchema),
  clones: sectionOf(clonesDataSchema),
  wallet: sectionOf(walletDataSchema),
  journal: sectionOf(journalDataSchema),
  industry: sectionOf(industryDataSchema),
});
export type BoardCharacter = z.infer<typeof boardCharacterSchema>;

const skillCatalogGroupSchema = z.object({
  groupId: z.number(),
  name: z.string(),
  skills: z.array(z.object({ typeId: z.number(), name: z.string(), rank: z.number() })),
});
export type SkillCatalogGroup = z.infer<typeof skillCatalogGroupSchema>;

export const boardResponseSchema = z.object({
  characters: z.array(boardCharacterSchema),
  skillCatalog: z.array(skillCatalogGroupSchema),
});
export type BoardResponse = z.infer<typeof boardResponseSchema>;

export const boardEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/board',
  request: null,
  responses: {
    200: jsonBody(boardResponseSchema),
  },
});
