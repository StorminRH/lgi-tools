// Wire contract for the /dev/esi sandbox's read endpoint (3.4.6). Runtime-light
// by design — zod plus pure constants only — because the client island imports
// it. The endpoint table is the single source for the request enum, the route's
// path building, and the panel's section list (configuration over repetition).
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';

// ── The proving table ────────────────────────────────────────────────────
// One entry per character endpoint a requested scope unlocks. Re-scoped to the
// least-privilege EVE_SCOPES set (3.7.1.1): only the four reads gated by a
// surviving scope remain — the 3.4.6 superset's PI/standings/clones/location
// sections were dropped with their scopes, not kept as a reason to retain them.
// Trap worth keeping: /attributes is gated by read_skills (read_attributes does
// not exist). Spec-canonical paths carry no trailing slash. The co-located test
// pins every scope to a member of EVE_SCOPES so a section can never demand a
// scope sign-in doesn't request.

export const DEV_ESI_ENDPOINT_IDS = [
  'skills',
  'attributes',
  'skillqueue',
  'industry_jobs',
] as const;

export type DevEsiEndpointId = (typeof DEV_ESI_ENDPOINT_IDS)[number];

export interface DevEsiEndpointConfig {
  label: string;
  // The ESI scope that gates this read — display + drift-pinning only; ESI
  // itself enforces it against the token.
  scope: string;
  // `{characterId}` is filled by the route.
  pathTemplate: string;
}

export const DEV_ESI_ENDPOINTS: Record<DevEsiEndpointId, DevEsiEndpointConfig> = {
  skills: {
    label: 'Skills',
    scope: 'esi-skills.read_skills.v1',
    pathTemplate: '/characters/{characterId}/skills',
  },
  attributes: {
    label: 'Attributes',
    scope: 'esi-skills.read_skills.v1',
    pathTemplate: '/characters/{characterId}/attributes',
  },
  skillqueue: {
    label: 'Skill queue',
    scope: 'esi-skills.read_skillqueue.v1',
    pathTemplate: '/characters/{characterId}/skillqueue',
  },
  industry_jobs: {
    label: 'Industry jobs',
    scope: 'esi-industry.read_character_jobs.v1',
    pathTemplate: '/characters/{characterId}/industry/jobs',
  },
};

// ── POST /api/dev/esi (authz: admin on production) ──────────────────────

export const devEsiReadRequestSchema = z.object({
  characterId: z.number().int().positive(),
  endpoint: z.enum(DEV_ESI_ENDPOINT_IDS),
  // A previously observed ETag, replayed as If-None-Match so the operator
  // sees the raw 304 path. Bounded: ESI ETags are short quoted hashes.
  ifNoneMatch: z.string().min(1).max(512).optional(),
});

// Raw response-header strings the sandbox surfaces, null when absent. No
// parsing or interpretation — the page's job is to show ESI's truth verbatim.
const headerMetaSchema = z.object({
  etag: z.string().nullable(),
  expires: z.string().nullable(),
  cacheControl: z.string().nullable(),
  contentType: z.string().nullable(),
  rateLimitGroup: z.string().nullable(),
  rateLimitLimit: z.string().nullable(),
  rateLimitRemaining: z.string().nullable(),
  rateLimitUsed: z.string().nullable(),
  errorLimitRemain: z.string().nullable(),
  errorLimitReset: z.string().nullable(),
  retryAfter: z.string().nullable(),
});
export type DevEsiHeaderMeta = z.infer<typeof headerMetaSchema>;

// Every observed outcome is a 200 with a kind — an ESI 304/403/4xx, a token
// failure, or a gate refusal IS the data this page exists to show. The route's
// own 401/403/400 stay genuine HTTP errors (not yours / not valid).
export const devEsiReadResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('esi'),
    status: z.number(),
    bodyText: z.string(),
    elapsedMs: z.number(),
    headers: headerMetaSchema,
  }),
  z.object({
    kind: z.literal('token_error'),
    error: z.enum(['not_found', 'reauth_required', 'upstream_error']),
  }),
  z.object({
    kind: z.literal('budget_exhausted'),
    reason: z.string(),
    remaining: z.number(),
  }),
  z.object({
    kind: z.literal('server_error'),
    status: z.number(),
  }),
]);
export type DevEsiReadResponse = z.infer<typeof devEsiReadResponseSchema>;

export const devEsiReadEndpoint: ApiEndpoint<
  z.input<typeof devEsiReadRequestSchema>,
  DevEsiReadResponse
> = {
  method: 'POST',
  path: '/api/dev/esi',
  request: devEsiReadRequestSchema,
  response: devEsiReadResponseSchema,
};
