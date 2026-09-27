import { boardEndpoint } from '@/composition/board/api-contract';
import { getBoardForUserOnView } from '@/composition/board/board-view';
import { getCurrentUserId } from '@/composition/session';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(boardEndpoint, 200, { characters: [], skillCatalog: [] });
  }
  const board = await measureOwnedDataRead({
    endpoint: '/api/account/board',
    read: () => getBoardForUserOnView(userId),
    returned: (value) => value.characters.length,
  });
  return apiResponse(boardEndpoint, 200, board);
}
