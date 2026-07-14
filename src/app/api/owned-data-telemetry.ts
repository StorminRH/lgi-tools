import { emitCostMetric } from '@/data/telemetry/cost-metrics';

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
