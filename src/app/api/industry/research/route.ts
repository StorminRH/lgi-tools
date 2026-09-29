import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { ON_DEMAND_HISTORY_LIMIT_PER_MINUTE } from '@/data/market-history/constants';
import { getLiveHistory } from '@/data/market-history/refresh-on-view';
import { researchEndpoint, researchRequestSchema } from '@/features/industry-planner/api-contract';
import { getResearchEconomics } from '@/features/industry-planner/queries';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/** History for stale products is one ESI call each, as on the history refresh. */
export const maxDuration = 60;

// authz: public
export const POST = capabilityRoute('planner.read-research', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, researchRequestSchema);
  if (!parsed.ok) return apiResponse(researchEndpoint, 400, parsed.failure);

  const limited = await checkRateLimit(request, {
    name: 'industry-research',
    perMinute: ON_DEMAND_HISTORY_LIMIT_PER_MINUTE,
  });
  if (!limited.ok) return apiResponse(researchEndpoint, 429, limited.failure);

  const blueprintIds = Array.from(new Set(parsed.data.blueprintTypeIds));
  const economics = await Promise.all(blueprintIds.map((id) => getResearchEconomics(id)));
  const productIds = economics.flatMap((entry) => (entry === null ? [] : [entry.productTypeId]));
  const history = await getLiveHistory(productIds);
  const seriesDays = parsed.data.seriesDays;

  return apiResponse(researchEndpoint, 200, {
    items: blueprintIds.map((blueprintTypeId, i) => {
      const entry = economics[i] ?? null;
      const productId = entry?.productTypeId;
      const rows = productId === undefined ? [] : (history.rows.get(productId) ?? []);
      return {
        blueprintTypeId,
        economics: entry,
        history: productId === undefined ? null : (history.inputs.get(productId) ?? null),
        series: [...rows]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-seriesDays)
          .map((row) => ({ ...row, volume: Number(row.volume) })),
      };
    }),
  });
}
