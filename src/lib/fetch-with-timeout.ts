// Shared fail-fast timeout for outbound `fetch`. A slow or hung upstream
// would otherwise stall a serverless function until the 300s platform limit;
// `AbortSignal.timeout` aborts the request (and, if still streaming, the body)
// after a bounded wait so the caller can fail over or surface an error fast.
// One mechanism for every external surface — no per-call ad hoc timers.

// Snappy fail-fast for small JSON / HEAD responses (ESI, Fuzzwork, EVE SSO,
// JWKS, Resend, Discord, the SDE version probe). If one of these hasn't
// answered in 10s it is effectively dead — fall back rather than wait.
export const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;

// The SDE download streams a multi-MB .bz2 body. `AbortSignal.timeout` caps
// the whole transfer, not just the time-to-headers, so a slow-but-healthy
// download needs more room than the small-response default.
export const SDE_DOWNLOAD_TIMEOUT_MS = 60_000;

// Wraps `fetch`, attaching an abort signal that fires after `timeoutMs`.
// Callers keep setting their own headers. If a caller (e.g. jose's
// `customFetch` hook, which forwards jose's own `init`) already supplied a
// `signal`, it is merged with the timeout via `AbortSignal.any` so either can
// abort the request — the timeout never silently drops a caller's cancellation.
export function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs: number = OUTBOUND_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const signals = [AbortSignal.timeout(timeoutMs), init?.signal].filter(
    (s): s is AbortSignal => s != null,
  );
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
  return fetch(input, { ...init, signal });
}
