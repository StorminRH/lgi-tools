// Shared fail-fast timeout for outbound `fetch`. A slow or hung upstream
// would otherwise stall a serverless function until the 300s platform limit;
// the attached abort signal cancels the request (and, if still streaming, the
// body) after a bounded wait so the caller can fail over or surface an error
// fast. One mechanism for every external surface — no per-call ad hoc timers.

// Snappy fail-fast for small JSON / HEAD responses (ESI, Fuzzwork, EVE SSO,
// JWKS, Resend, Discord, the SDE version probe). If one of these hasn't
// answered in 10s it is effectively dead — fall back rather than wait.
export const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;

// The SDE download streams a multi-MB .bz2 body. The abort signal caps the
// whole transfer, not just the time-to-headers, so a slow-but-healthy
// download needs more room than the small-response default.
export const SDE_DOWNLOAD_TIMEOUT_MS = 60_000;

// Wraps `fetch`, attaching an abort signal that fires after `timeoutMs`.
// Callers keep setting their own headers. If a caller (e.g. jose's
// `customFetch` hook, which forwards jose's own `init`) already supplied a
// `signal`, its abort is forwarded so either it or the timeout can abort the
// request — the timeout never silently drops a caller's cancellation.
//
// Deliberately built from `AbortController` + `setTimeout` rather than the
// `AbortSignal.timeout`/`AbortSignal.any` statics: Convex's default runtime
// implements the controller and timers but not those statics, and this module
// sits under the ESI gate, which must stay runtime-portable (Decision
// Record 11) so Convex actions can dispatch through it. Semantics are
// identical — the timeout rejection is the same `TimeoutError` DOMException,
// and the timer is cleared as soon as the fetch settles.
export function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs: number = OUTBOUND_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('signal timed out', 'TimeoutError'));
  }, timeoutMs);
  const callerSignal = init?.signal;
  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal != null) {
    if (callerSignal.aborted) forwardAbort();
    else callerSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  });
}
