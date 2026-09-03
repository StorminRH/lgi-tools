import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { SITE_TYPES, WORMHOLE_CLASSES } from './schema';

export const sitesQuerySchema = z.object({
  type: z.enum(SITE_TYPES).optional(),
  class: z.enum(WORMHOLE_CLASSES).optional(),
});

const siteMetadataShape = {
  id: z.number(),
  name: z.string(),
  siteType: z.enum(SITE_TYPES),
  wormholeClass: z.enum(WORMHOLE_CLASSES).nullable(),
  signatureLabel: z.string(),
  sourceTab: z.string(),
  blueLootIsk: z.number().nullable(),
  iskPerEhp: z.number().nullable(),
};

const siteListApiItemSchema = z.object({
  ...siteMetadataShape,
  sheetResourceValueIsk: z.number().nullable(),
});

export const sitesListResponseSchema = z.array(siteListApiItemSchema);

export type SiteListApiItem = z.infer<typeof siteListApiItemSchema>;

export const sitesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/sites',
  request: null,
  query: sitesQuerySchema,
  responses: {
    200: jsonBody(sitesListResponseSchema),
    400: problem('invalid_query'),
  },
});

const npcSchema = z.object({
  id: z.number(),
  orderInWave: z.number(),
  triggerLabel: z.string().nullable(),
  quantity: z.number(),
  sleeperName: z.string(),
  sleeperClassCode: z.string(),
  scram: z.number().nullable(),
  web: z.number().nullable(),
  neut: z.number().nullable(),
  rrep: z.number().nullable(),
  sig: z.number().nullable(),
  speed: z.number().nullable(),
  distance: z.number().nullable(),
  velocity: z.number().nullable(),
  dps: z.number().nullable(),
  alpha: z.number().nullable(),
  ehp: z.number().nullable(),
});

const waveSchema = z.object({
  id: z.number(),
  waveNumber: z.number(),
  waveLabel: z.string(),
  ewScram: z.number().nullable(),
  ewWeb: z.number().nullable(),
  ewNeut: z.number().nullable(),
  ewRrep: z.number().nullable(),
  dpsTotal: z.number(),
  alphaTotal: z.number(),
  ehpTotal: z.number(),
  npcs: z.array(npcSchema),
});

const siteResourceSchema = z.object({
  id: z.number(),
  orderInSite: z.number(),
  resourceKind: z.string(),
  resourceName: z.string(),
  units: z.number().nullable(),
  volumeM3: z.number().nullable(),
  iskPerM3: z.number().nullable(),
  totalIsk: z.number().nullable(),
  typeId: z.number().nullable(),
  liveIsk: z.number().nullable(),
  effectiveIsk: z.number().nullable(),
  liveEligible: z.boolean(),
});

export const siteDetailSchema = z.object({
  ...siteMetadataShape,
  resourceValueIsk: z.number().nullable(),
  waves: z.array(waveSchema),
  resources: z.array(siteResourceSchema),
});

export type Npc = z.infer<typeof npcSchema>;

export type Wave = z.infer<typeof waveSchema>;

export type SiteResource = z.infer<typeof siteResourceSchema>;

export type SiteDetail = z.infer<typeof siteDetailSchema>;

// Postgres `serial` is signed 32-bit, so site IDs cannot exceed this. Reject

const PG_SERIAL_MAX = 2_147_483_647;

const siteIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(PG_SERIAL_MAX)),
});

export const siteDetailEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/sites/[id]',
  request: null,
  params: siteIdParamSchema,
  responses: {
    200: jsonBody(siteDetailSchema),
    400: problem('invalid_query'),
    404: problem('not_found'),
  },
});
