import type { SystemsResponse } from '@/data/eve-data/api-contract';
import { getSystemSearchIndex } from '@/data/eve-data/queries';

// GET /api/industry/systems
// No user input — returns the full cached universe system index (every
// persistent solar system: K-space, Pochven, J-space) that feeds the lazy
// systems search source; the build-location pickers and the structure-pin
// control query it via searchAll(['systems']) and match client-side.
// (Validation invariant: no input to validate.)
// authz: public
export async function GET(): Promise<Response> {
  const systems = await getSystemSearchIndex();
  return Response.json({ systems } satisfies SystemsResponse);
}
