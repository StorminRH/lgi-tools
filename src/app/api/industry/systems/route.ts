import type { SystemsResponse } from '@/features/industry-planner/api-contract';
import { getSystemSearchIndex } from '@/features/industry-planner/queries';

// GET /api/industry/systems
// No user input — returns the full cached build-system search index (every solar
// system with an industry-capable NPC station) that feeds the lazy build-location
// selector. Filtered client-side. (Validation invariant: no input to validate.)
// authz: public
export async function GET(): Promise<Response> {
  const systems = await getSystemSearchIndex();
  return Response.json({ systems } satisfies SystemsResponse);
}
