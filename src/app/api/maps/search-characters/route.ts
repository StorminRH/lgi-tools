import { runMutationRoute } from '@/app/api/mutation-route';
import { searchMapCharacters } from '@/composition/map-character-search';
import {
  searchCharactersEndpoint,
  searchCharactersRequestSchema,
} from '@/data/maps/api-contract';
import { dependencyUnavailableFailure } from '@/lib/failure';
import { checkUserId } from '@/composition/route-guards';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMutationRoute(request, {
    capability: 'maps.search-characters',
    authorize: checkUserId,
    parse: (incoming) => readJsonBody(incoming, searchCharactersRequestSchema),
    handle: async ({ userId }, body) => {
      try {
        const response = await searchMapCharacters(userId, body.search);
        return apiResponse(searchCharactersEndpoint, 200, response);
      } catch (cause) {
        return apiResponse(
          searchCharactersEndpoint,
          503,
          dependencyUnavailableFailure('character_search_unavailable', 503, {
            cause,
            detail: 'EVE character search is temporarily unavailable',
          }),
        );
      }
    },
  });
}
