import { apiFetch, type EndpointCallArgs } from './api-client';
import type { EndpointContract, OutcomeOf } from './endpoint';

/** A failed outcome in a few words for an error message: `network`, `api 500`, `protocol 200`. */
export function apiFailureLabel(failure: { readonly kind: string; readonly status?: number }): string {
  return failure.status === undefined ? failure.kind : `${failure.kind} ${failure.status}`;
}

/**
 * Calls a declared endpoint for a caller that only wants the data: a failed
 * outcome rejects with `<label> <failure>`, such as `system index api 503`.
 * Lives beside apiFetch rather than in it, so a test that mocks apiFetch
 * still drives this through the mock.
 */
export async function apiFetchData<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  label: string,
  ...args: EndpointCallArgs<TEndpoint>
): Promise<Extract<OutcomeOf<TEndpoint>, { ok: true }>['data']> {
  const result = await apiFetch(endpoint, ...args);
  if (!result.ok) throw new Error(`${label} ${apiFailureLabel(result)}`);
  return result.data;
}
