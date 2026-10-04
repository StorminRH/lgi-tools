import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { resolveCodexEntity, searchCodexSource } from '@/composition/codex-sources';
import { checkUserId } from '@/composition/route-guards';
import { codexSourceEntityEndpoint, codexSourceSearchEndpoint } from '@/features/codex/api-contract';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';
import { parseQueryInput } from '@/transport/endpoint';

const unknownSource = () => validationFailure('unknown_source', 'Not a Codex data source');
const invalidQuery = () => validationFailure('invalid_query', 'Invalid Codex source query');

async function search(params: URLSearchParams): Promise<Response> {
  const parsed = parseQueryInput(codexSourceSearchEndpoint, params);
  if (!parsed.success) return apiResponse(codexSourceSearchEndpoint, 400, invalidQuery());
  const hits = await searchCodexSource(parsed.data.source, parsed.data.q);
  if (hits === null) return apiResponse(codexSourceSearchEndpoint, 400, unknownSource());
  return apiResponse(codexSourceSearchEndpoint, 200, { hits });
}

async function entity(params: URLSearchParams): Promise<Response> {
  const parsed = parseQueryInput(codexSourceEntityEndpoint, params);
  if (!parsed.success) return apiResponse(codexSourceEntityEndpoint, 400, invalidQuery());
  const lookup = await resolveCodexEntity(parsed.data.source, parsed.data.key);
  switch (lookup.status) {
    case 'unknown-source':
      return apiResponse(codexSourceEntityEndpoint, 400, unknownSource());
    case 'bad-key':
      return apiResponse(codexSourceEntityEndpoint, 400, validationFailure('invalid_key', 'Not a valid key for this source'));
    case 'missing':
      return apiResponse(codexSourceEntityEndpoint, 404, notFoundFailure('entity_not_found', 'No such entity'));
    case 'found':
      return apiResponse(codexSourceEntityEndpoint, 200, { entity: lookup.entity });
  }
}

// authz: auth
// input: query
export const GET = capabilityRoute('codex.search-sources', async (request: NextRequest) => {
  const user = await checkUserId();
  if (!user.ok) return apiResponse(codexSourceSearchEndpoint, 401, user.failure);
  const params = request.nextUrl.searchParams;
  return params.has('key') ? entity(params) : search(params);
});
