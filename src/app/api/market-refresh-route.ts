import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { refreshHistoryEndpoint } from '@/data/market-history/api-contract';
import { refreshPricesEndpoint } from '@/data/market-prices/api-contract';
import type { CapabilityId } from '@/data/telemetry/capability';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

type MarketRefreshEndpoint = typeof refreshHistoryEndpoint | typeof refreshPricesEndpoint;
type MarketRefreshCapability = Extract<
  CapabilityId,
  'market.refresh-market-history' | 'market.refresh-market-prices'
>;

/**
 * Public on-demand market refresh shell: parse type ids, rate-limit, dedupe,
 * time the load, then let the slice map the typed body.
 */
export function marketRefreshRoute<TLoaded>(
  capability: MarketRefreshCapability,
  endpoint: MarketRefreshEndpoint,
  limit: { readonly name: string; readonly perMinute: number },
  load: (typeIds: number[]) => Promise<TLoaded>,
  respond: (args: {
    readonly typeIds: number[];
    readonly loaded: TLoaded;
    readonly durationMs: number;
  }) => Response,
): (request: NextRequest) => Promise<Response> {
  return capabilityRoute(capability, async (request) => {
    const parsed = await readJsonBody(request, endpoint.request);
    if (!parsed.ok) return apiResponse(endpoint, 400, parsed.failure);

    const limited = await checkRateLimit(request, limit);
    if (!limited.ok) return apiResponse(endpoint, 429, limited.failure);

    const typeIds = Array.from(new Set(parsed.data.typeIds));
    const startedAt = Date.now();
    const loaded = await load(typeIds);
    return respond({ typeIds, loaded, durationMs: Date.now() - startedAt });
  });
}
