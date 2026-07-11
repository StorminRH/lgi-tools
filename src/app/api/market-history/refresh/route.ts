import type { NextRequest } from 'next/server';
import {
  refreshHistoryRequestSchema,
  type RefreshHistoryBadRequest,
  type RefreshHistoryResponse,
} from '@/data/market-history/api-contract';
import { ON_DEMAND_HISTORY_LIMIT_PER_MINUTE } from '@/data/market-history/constants';
import { getLiveHistory } from '@/data/market-history/refresh-on-view';
import { rateLimitGuard } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/route-body';

// POST /api/market-history/refresh
// Body: { typeIds: number[] }
//
// On-demand daily-history read. Consumed by the Industry Planner client when a
// user opens a blueprint (the product type). Runs the stale-gated refresh-on-
// view engine: serve warm types from the stored series, fetch only types past
// their ESI Expires boundary, return the typed scoring inputs, and persist the
// freshly fetched series behind the response. Inherits the prod bot-protection
// Challenge Mode (non-browser callers get a 429 challenge) — accepted, the
// consumer is the browser-side planner hook; no firewall bypass needed.
//
// Rate-limited per client IP; the threshold lives in the slice constants so
// post-ship tuning is one config change.
//
// Degradation (ESI budget exhausted → some stale types kept their stored
// series) is logged to runtime logs only; a telemetry action is deliberately
// not added in 3.5.3a (history degradation is low-stakes — stored data is
// served — and the shared ESI gate already governs the budget).
// authz: public

// History is one ESI call per stale type at concurrency 10; the on-view trigger
// asks for a single product type. 60 bounds a hang well under the 300s default.
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, refreshHistoryRequestSchema, {
    invalidJson: () =>
      Response.json({ error: 'invalid_json' } satisfies RefreshHistoryBadRequest, { status: 400 }),
    invalidBody: (error) =>
      Response.json(
        { error: 'invalid_request', issues: error.issues } satisfies RefreshHistoryBadRequest,
        { status: 400 },
      ),
  });
  if (!parsed.ok) return parsed.response;

  const limit = await rateLimitGuard(request, {
    name: 'market-history-refresh',
    perMinute: ON_DEMAND_HISTORY_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) return limit.response;

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const { inputs, degraded } = await getLiveHistory(typeIds);

  if (degraded.budgetExhausted) {
    console.warn(
      JSON.stringify({
        scope: 'market-history/refresh',
        budgetExhausted: true,
        fetched: degraded.fetched,
      }),
    );
  }

  return Response.json({
    inputs: typeIds
      .map((typeId) => inputs.get(typeId))
      .filter((row): row is NonNullable<typeof row> => row !== undefined),
  } satisfies RefreshHistoryResponse);
}
