import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { MAX_PROFILE_NAME_LEN, profileDocumentSchema } from './profile-document';

const profileId = z.string().min(1).max(100);
const profileName = z.string().trim().min(1).max(MAX_PROFILE_NAME_LEN);

const industryProfileRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number().int(),
  document: profileDocumentSchema,
  updatedAt: z.string(),
});
export type IndustryProfileRow = z.infer<typeof industryProfileRowSchema>;

const profilesResponseSchema = z.object({
  profiles: z.array(industryProfileRowSchema),
});
const createdProfileResponseSchema = profilesResponseSchema.extend({ id: z.string() });

export const industryProfilesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/industry-profiles',
  request: null,
  responses: {
    200: jsonBody(profilesResponseSchema),
  },
});

export const createIndustryProfileRequestSchema = z.object({
  name: profileName,
  document: profileDocumentSchema,
});
export const createIndustryProfileEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/industry-profiles',
  request: createIndustryProfileRequestSchema,
  responses: {
    201: jsonBody(createdProfileResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'not_linked'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    409: problem('profile_limit'),
  },
});

export const duplicateIndustryProfileRequestSchema = z.object({
  id: profileId,
  name: profileName,
});
export const duplicateIndustryProfileEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/industry-profiles/duplicate',
  request: duplicateIndustryProfileRequestSchema,
  responses: {
    201: jsonBody(createdProfileResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    404: problem('profile_missing'),
    409: problem('profile_limit'),
  },
});

export const updateIndustryProfileRequestSchema = z.object({
  id: profileId,
  expectedRevision: z.number().int().positive(),
  name: profileName,
  document: profileDocumentSchema,
});
export const updateIndustryProfileEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/industry-profiles/update',
  request: updateIndustryProfileRequestSchema,
  responses: {
    200: jsonBody(profilesResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'not_linked'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    404: problem('profile_missing'),
    409: problem('stale_revision'),
  },
});

export const deleteIndustryProfileRequestSchema = z.object({
  id: profileId,
});
export const deleteIndustryProfileEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/industry-profiles/delete',
  request: deleteIndustryProfileRequestSchema,
  responses: {
    200: jsonBody(profilesResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});
