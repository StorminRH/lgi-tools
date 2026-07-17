import { emitCostMetric } from '@/data/telemetry/cost-metrics';

/**
 * Public App Router data contract for owned data endpoint; fields are owned here so callers do not
 * depend on the module's internal representation.
 */
export type OwnedDataEndpoint =
  | '/api/account/skills'
  | '/api/account/industry-slots'
  | '/api/account/industry-jobs'
  | '/api/account/corp-industry-jobs'
  | '/api/industry/skill-levels'
  | '/api/industry/owned-blueprints'
  | '/api/industry/owned-assets';

interface MeasuredOwnedDataRead<T> {
  endpoint: OwnedDataEndpoint;
  requested?: number;
  read: () => Promise<T>;
  returned: (result: T) => number;
}

/**
 * Runs owned data read as the App Router orchestration seam; callers provide validated inputs and
 * own handling of the declared result.
 */
export async function measureOwnedDataRead<T>({
  endpoint,
  requested,
  read,
  returned,
}: MeasuredOwnedDataRead<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await read();
    emitCostMetric('owned_data_read', {
      endpoint,
      ...(requested === undefined ? {} : { requested }),
      returned: returned(result),
      outcome: 'succeeded',
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    emitCostMetric('owned_data_read', {
      endpoint,
      ...(requested === undefined ? {} : { requested }),
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
