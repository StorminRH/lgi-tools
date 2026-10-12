import { observeCostPromise, startCostTimer } from '@/data/telemetry/cost-metrics';
import type { EndpointContract } from '@/transport/endpoint';

export interface MeasuredOwnedDataRead<T> {
  endpoint: Pick<EndpointContract, 'path'>;
  requested?: number;
  read: () => Promise<T>;
  returned: (result: T) => number;
}

export function measureOwnedDataRead<T>({
  endpoint,
  requested,
  read,
  returned,
}: MeasuredOwnedDataRead<T>): Promise<T> {
  // Started before read() so the timer also covers its synchronous part.
  const timer = startCostTimer();
  return observeCostPromise(
    read(),
    'owned_data_read',
    { endpoint: endpoint.path, ...(requested === undefined ? {} : { requested }) },
    timer,
    (value) => ({ returned: returned(value) }),
  );
}
