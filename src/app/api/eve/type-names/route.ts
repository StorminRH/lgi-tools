import {
  typeNamesEndpoint,
  typeNamesRequestSchema,
} from '@/data/eve-data/api-contract';
import { capabilityRoute } from '@/app/api/capability-route';
import { getTypeNames } from '@/data/eve-data/queries';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: public
export const POST = capabilityRoute('maps.resolve-type-names', handlePost);

async function handlePost(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req, typeNamesRequestSchema);
  if (!parsed.ok) return apiResponse(typeNamesEndpoint, 400, parsed.failure);

  const nameMap = await getTypeNames(parsed.data.ids);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) {
    names[String(id)] = name;
  }
  return apiResponse(typeNamesEndpoint, 200, { names });
}
