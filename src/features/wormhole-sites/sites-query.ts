import type { z } from 'zod';
import { validationFailure, type AppFailure } from '@/lib/failure';
import { sitesQuerySchema } from './api-contract';
import { SITE_TYPES, WORMHOLE_CLASSES } from './schema';

/** Validated catalogue query containing normalized filters, sort key, and sort direction. */
export type SitesQueryParse =
  | { ok: true; data: z.infer<typeof sitesQuerySchema> }
  | { ok: false; failure: AppFailure };

/**
 * Query-param validation for GET /api/sites, extracted pure so the Zod-issue →
 * "Must be one of …" 400 formatting is unit-testable without a request. Returns
 * the parsed filters, or a validation failure preserving the existing detail.
 */
export function parseSitesQuery(
  type: string | null,
  wormholeClass: string | null,
): SitesQueryParse {
  const parsed = sitesQuerySchema.safeParse({
    type: type ?? undefined,
    class: wormholeClass ?? undefined,
  });
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
