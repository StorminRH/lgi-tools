import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getBlueprintDirectInputs } from '@/features/industry-planner/catalog-queries';

// GET /api/industry/inputs?blueprint=<id>
// One blueprint's direct, priced inputs — the data a fanned browse-cascade
// column renders. Reuses the cached `getBlueprintDirectInputs` (reads
// market_prices only; never refreshes), so browsing the production graph fires
// no ESI calls.

const SDE_TYPE_ID_MAX = 2_147_483_647; // SDE type IDs are 32-bit signed.

// Plain positive decimal only — no signs, leading zeros, or trailing garbage.
const querySchema = z.object({
  blueprint: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(SDE_TYPE_ID_MAX)),
});

// authz: public
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = querySchema.safeParse({
    blueprint: request.nextUrl.searchParams.get('blueprint') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid blueprint id' }, { status: 400 });
  }

  const view = await getBlueprintDirectInputs(parsed.data.blueprint);
  if (!view) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(view);
}
