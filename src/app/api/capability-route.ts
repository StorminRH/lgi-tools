import {
  capabilityResultForError,
  capabilityResultForResponse,
  recordCapabilityOutcome,
  type CapabilityId,
} from '@/data/telemetry/capability';
import { withCorrelationScope } from '@/transport/correlation';

export function capabilityRoute<TRequest extends Request>(
  capability: CapabilityId,
  handler: (request: TRequest) => Promise<Response>,
): (request: TRequest) => Promise<Response> {
  return (request) => runCapabilityRoute(capability, () => handler(request));
}

export function runCapabilityRoute(
  capability: CapabilityId,
  work: () => Promise<Response>,
): Promise<Response> {
  return withCorrelationScope(async () => {
    const startedAt = performance.now();
    try {
      const response = await work();
      recordCapabilityOutcome(capability, {
        ...capabilityResultForResponse(response),
        durationMs: performance.now() - startedAt,
        retry: null,
      });
      return response;
    } catch (error) {
      recordCapabilityOutcome(capability, {
        ...capabilityResultForError(error),
        durationMs: performance.now() - startedAt,
        retry: null,
      });
      throw error;
    }
  });
}
