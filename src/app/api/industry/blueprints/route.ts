import { getBlueprintSearchIndex } from '@/features/industry-planner/queries';

// GET /api/industry/blueprints
// No user input — returns the full cached blueprint search index that feeds the
// lazy Blueprints search source. (Validation invariant: no input to validate.)
// authz: public
export async function GET(): Promise<Response> {
  const blueprints = await getBlueprintSearchIndex();
  return Response.json({ blueprints });
}
