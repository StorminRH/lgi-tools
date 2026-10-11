import {
  capabilityResultForError,
  capabilityResultForResponse,
  recordCapabilityOutcome,
  type CapabilityId,
  type CapabilityResult,
} from '@/data/telemetry/capability';
import { withCorrelationScope } from '@/transport/correlation';

export function capabilityRoute<TRequest extends Request>(
  capability: CapabilityId,
  handler: (request: TRequest) => Promise<Response>,
): (request: TRequest) => Promise<Response> {
  return (request) => runCapabilityRoute(capability, () => handler(request), request.signal);
}

/**
 * Runs `work` and records its outcome against `capability`. A failure once
 * `signal` has aborted is not recorded: the client hung up and never saw it,
 * and counting it would read a cancelled request (a superseded typeahead
 * search, say) as an outage in the success rates.
 */
export function runCapabilityRoute(
  capability: CapabilityId,
  work: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  return withCorrelationScope(async () => {
    const startedAt = performance.now();
    const record = (result: CapabilityResult): void => {
      if (signal?.aborted === true && result.outcome !== 'succeeded') return;
      recordCapabilityOutcome(capability, {
        ...result,
        durationMs: performance.now() - startedAt,
        retry: null,
      });
    };
    try {
      const response = await work();
      record(capabilityResultForResponse(response));
      return response;
    } catch (error) {
      record(capabilityResultForError(error));
      throw error;
    }
  });
}
