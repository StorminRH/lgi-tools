import type { ProblemBodyFor } from '../endpoint';

/** A declared problem refusal, as apiFetch resolves it for the endpoint's `status` response. */
export function apiProblem<const TStatus extends number, const TCode extends string>(
  status: TStatus,
  code: TCode,
  extra: { readonly retryAfterSeconds?: number; readonly detail?: string } = {},
): { ok: false; kind: 'api'; status: TStatus; error: ProblemBodyFor<TCode> } {
  return {
    ok: false,
    kind: 'api',
    status,
    error: {
      type: 'about:blank',
      title: 'Refused',
      status,
      code,
      correlationId: 'test-correlation-id',
      ...extra,
    },
  };
}

/** A request that never got an answer. */
export function networkDown(): { ok: false; kind: 'network'; aborted: false; cause: unknown } {
  return { ok: false, kind: 'network', aborted: false, cause: new TypeError('Failed to fetch') };
}

/** An answer the endpoint does not declare, such as an unexpected 500. */
export function protocolFailure(status = 500): { ok: false; kind: 'protocol'; status: number; detail: string } {
  return { ok: false, kind: 'protocol', status, detail: 'Endpoint returned an undeclared status' };
}
