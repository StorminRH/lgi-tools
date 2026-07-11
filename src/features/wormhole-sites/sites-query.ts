import type { z } from 'zod';
import { sitesQuerySchema } from './api-contract';
import { SITE_TYPES, WORMHOLE_CLASSES } from './schema';
import type { ApiError } from './types';

export type SitesQueryParse =
  | { ok: true; data: z.infer<typeof sitesQuerySchema> }
  | { ok: false; error: ApiError };

// Query-param validation for GET /api/sites, extracted pure so the Zod-issue →
// "Must be one of …" 400 formatting is unit-testable without a request. Returns
// the parsed filters, or the exact ApiError body the route sends back as-is.
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
  return { ok: false, error: { error: `Invalid ${field}. Must be one of: ${expected}` } };
}
