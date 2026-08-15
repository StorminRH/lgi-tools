// API wire contracts owned by the wormhole-sites feature (3.10.2.1.2).
import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { SITE_TYPES, WORMHOLE_CLASSES } from './schema';

// ── GET /api/sites ──────────────────────────────────────────────────────

/**
 * Boundary validator for sites query schema; successful parsing yields the normalized wormhole
 * sites input consumed internally.
 */
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

/** One catalogue row returned without the detail route's live price overlay. */
const siteListApiItemSchema = z.object({
  ...siteMetadataShape,
  sheetResourceValueIsk: z.number().nullable(),
});

/** Full response validator for the wormhole-site catalogue. */
export const sitesListResponseSchema = z.array(siteListApiItemSchema);

/** Catalogue row with its source-sheet resource value made explicit. */
export type SiteListApiItem = z.infer<typeof siteListApiItemSchema>;

/** Typed contract for the filterable wormhole-site catalogue. */
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

// ── GET /api/sites/[id] ─────────────────────────────────────────────────

/** One NPC row nested in a wormhole-site wave. */
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

/** One ordered wave and its nested NPC groups. */
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

/** One harvestable site resource and its static or live value inputs. */
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

/** Complete detail response including nested combat waves and resources. */
export const siteDetailSchema = z.object({
  ...siteMetadataShape,
  resourceValueIsk: z.number().nullable(),
  waves: z.array(waveSchema),
  resources: z.array(siteResourceSchema),
});

/** One NPC nested in a site-detail response. */
export type Npc = z.infer<typeof npcSchema>;
/** One wave nested in a site-detail response. */
export type Wave = z.infer<typeof waveSchema>;
/** One resource nested in a site-detail response. */
export type SiteResource = z.infer<typeof siteResourceSchema>;
/** Complete wormhole-site detail response. */
export type SiteDetail = z.infer<typeof siteDetailSchema>;

// Postgres `serial` is signed 32-bit, so site IDs cannot exceed this. Reject
// anything outside that range up-front so we don't hand the DB a number it'll
// refuse with a 500.
const PG_SERIAL_MAX = 2_147_483_647;

/**
 * Plain positive decimal only — no leading zeros, no signs, no whitespace,
 * no hex/scientific notation, no trailing garbage that parseInt would
 * silently strip.
 */
const siteIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(PG_SERIAL_MAX)),
});

/** Typed contract for one wormhole-site detail lookup. */
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
