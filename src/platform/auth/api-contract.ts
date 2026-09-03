import { z } from 'zod';
import { CHARACTER_ROLES } from '@/config/character-roles';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';

const userIdField = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);

export const eveTokenRequestSchema = z.object({
  userId: userIdField,
  characterId: z.number().int().positive(),
});

const eveTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.number().int().positive(),
});

export type EveTokenOkResponse = z.infer<typeof eveTokenResponseSchema>;

export const eveTokenEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/internal/eve-token',
  request: eveTokenRequestSchema,
  responses: {
    200: jsonBody(eveTokenResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    404: problem('not_found'),
    409: problem('reauth_required'),
    500: problem('not_configured'),
    502: problem('upstream_error'),
  },
});

export const eveCharactersRequestSchema = z.object({
  userId: userIdField,
});

const eveCharacterEntrySchema = z.object({
  characterId: z.number().int().positive(),
  name: z.string(),
  hasRefreshToken: z.boolean(),
  missingScopes: z.array(z.string()),

  corporationId: z.number().int().positive().nullable(),
});
const eveCharactersResponseSchema = z.object({
  characters: z.array(eveCharacterEntrySchema),
});

export type EveCharactersResponse = z.infer<typeof eveCharactersResponseSchema>;

export const eveCharactersEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/internal/eve-characters',
  request: eveCharactersRequestSchema,
  responses: {
    200: jsonBody(eveCharactersResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    500: problem('not_configured'),
  },
});

export type CronRefreshAffiliationsResponse =
  | { status: 'busy' }
  | { status: 'refreshed'; stale: number; refreshed: number };

export const switchCharacterFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

export const unlinkCharacterFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

export const ADMIN_ACCESS_QUERY_MAX_LENGTH = 200;

export const adminRoleFormSchema = z.object({
  userId: userIdField,
  nextRole: z.enum(CHARACTER_ROLES),
  q: z.string().max(ADMIN_ACCESS_QUERY_MAX_LENGTH * 4).optional(),
});

export const adminUnlinkFormSchema = z.object({
  userId: userIdField,
  characterId: z.coerce.number().int().positive(),
});

export const adminReassignFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
  fromUserId: userIdField,
});

export const adminRevokeSessionsFormSchema = z.object({
  userId: userIdField,
});

const accountCharacterSchema = z.object({
  characterId: z.number().int().positive(),
  name: z.string(),
  portraitUrl: z.string(),
  needsReconnect: z.boolean(),
});
const accountCharactersResponseSchema = z.object({
  characters: z.array(accountCharacterSchema),
});

export type AccountCharactersResponse = z.infer<typeof accountCharactersResponseSchema>;

export const accountCharactersEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/characters',
  request: null,
  responses: {
    200: jsonBody(accountCharactersResponseSchema),
  },
});

export const purgeCharacterRequestSchema = z.object({
  characterId: z.number().int().positive(),
});

const purgeCharacterResponseSchema = z.object({ accountEmptied: z.boolean() });

export const purgeCharacterEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/purge-character',
  request: purgeCharacterRequestSchema,
  responses: {
    200: jsonBody(purgeCharacterResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'not_linked'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    429: problem('rate_limited'),
  },
});

const accountDeleteResponseSchema = z.object({ ok: z.literal(true) });

export const accountDeleteEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/delete',
  request: null,
  responses: {
    200: jsonBody(accountDeleteResponseSchema),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    429: problem('rate_limited'),
  },
});

const sessionsRevokeResponseSchema = z.object({ revoked: z.number() });

export const sessionsRevokeEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/sessions/revoke',
  request: null,
  responses: {
    200: jsonBody(sessionsRevokeResponseSchema),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    429: problem('rate_limited'),
  },
});
