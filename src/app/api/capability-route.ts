import {
  capabilityResultForError,
  capabilityResultForResponse,
  recordCapabilityOutcome,
  type CapabilityId,
} from '@/data/telemetry/capability';
import { withCorrelationScope } from '@/transport/correlation';

/**
 * Wraps one route handler as a named capability, producing the handler a route exports directly.
 * The direct mutation routes and POST-bodied tool reads that deliberately sit outside the mutation
 * shell use this; `runMutationRoute` wraps its own stage ordering in `runCapabilityRoute` below.
 */
export function capabilityRoute<TRequest extends Request>(
  capability: CapabilityId,
  handler: (request: TRequest) => Promise<Response>,
): (request: TRequest) => Promise<Response> {
  return (request) => runCapabilityRoute(capability, () => handler(request));
}

/**
 * Runs one route's work as a named capability: opens the correlation scope the response builders
 * and dependency seams write into, times the run, and records exactly one outcome on the way out.
 *
 * The record is scheduled after the response, so this never extends what the user waits for, and a
 * thrown handler is recorded before the error is rethrown so the platform response is unchanged.
 */
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
