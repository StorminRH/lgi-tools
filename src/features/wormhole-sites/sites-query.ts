import type { z } from 'zod';
import { validationFailure, type AppFailure } from '@/lib/failure';
import { parseQueryInput } from '@/transport/endpoint';
import { sitesEndpoint, sitesQuerySchema } from './api-contract';
import { SITE_TYPES, WORMHOLE_CLASSES } from './schema';

export type SitesQueryParse =
  | { ok: true; data: z.infer<typeof sitesQuerySchema> }
  | { ok: false; failure: AppFailure };

export function parseSitesQuery(searchParams: URLSearchParams): SitesQueryParse {
  const parsed = parseQueryInput(sitesEndpoint, searchParams);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.') ?? 'query';
  const expected =
    field === 'type'
      ? SITE_TYPES.join(', ')
      : field === 'class'
        ? WORMHOLE_CLASSES.join(', ')
        : '';
  return {
    ok: false,
    failure: validationFailure(
      'invalid_query',
      `Invalid ${field}. Must be one of: ${expected}`,
    ),
  };
}
