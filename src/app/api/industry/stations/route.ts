import { stationsEndpoint } from '@/data/eve-data/api-contract';
import { getManufacturingStationIndex } from '@/data/eve-data/queries';
import { apiResponse } from '@/transport/api-response';

// authz: public
// input: none
export async function GET(): Promise<Response> {
  const stations = await getManufacturingStationIndex();
  return apiResponse(stationsEndpoint, 200, { stations });
}
