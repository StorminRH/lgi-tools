import {
  systemStaticsEndpoint,
  systemStaticsParamsSchema,
} from '@/data/wh-statics/api-contract';
import { getSystemStatics } from '@/data/wh-statics/queries';
import { apiResponse } from '@/transport/api-response';

/** Serves one system's promoted static wormhole codes from the shared tagged cache. */
// authz: public
// input: path
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ systemId: string }> },
): Promise<Response> {
  const parsed = systemStaticsParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return apiResponse(systemStaticsEndpoint, 200, { statics: [] });
  }
  const promoted = await getSystemStatics();
  const statics = promoted.systems.find(
    (row) => row.systemId === parsed.data.systemId,
  )?.codes ?? [];
  return apiResponse(systemStaticsEndpoint, 200, { statics: [...statics] });
}
