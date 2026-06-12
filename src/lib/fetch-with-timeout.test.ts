import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithTimeout,
  OUTBOUND_FETCH_TIMEOUT_MS,
} from './fetch-with-timeout';

// A fetch mock that never settles on its own, only via its abort signal —
// so the only way the promise rejects is an abort. Mirrors real fetch by
// rejecting up front when the signal arrives already aborted.
function abortAwareFetch() {
  return vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal == null) return;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );
}

describe('fetchWithTimeout', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('attaches an AbortSignal to the outgoing request', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await fetchWithTimeout('https://example.test/');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with a TimeoutError once the timeout elapses', async () => {
    // Real (tiny) timeout: a short real delay proves the timer actually fires
    // end to end, with no fake-timer plumbing to drift from the real thing.
    fetchSpy.mockImplementation(abortAwareFetch());

    await expect(fetchWithTimeout('https://example.test/', undefined, 5)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('resolves normally when the response beats the timeout', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const res = await fetchWithTimeout('https://example.test/', undefined, 5_000);
    expect(res.status).toBe(200);
  });

  it('honors a caller-provided signal alongside the timeout', async () => {
    // jose's customFetch hook forwards jose's own init, which may carry a
    // cancellation signal — aborting it must still abort the request.
    fetchSpy.mockImplementation(abortAwareFetch());
    const controller = new AbortController();

    const pending = fetchWithTimeout(
      'https://example.test/',
      { signal: controller.signal },
      5_000,
    );
    controller.abort(new Error('caller cancelled'));

    await expect(pending).rejects.toThrow('caller cancelled');
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    fetchSpy.mockImplementation(abortAwareFetch());
    const controller = new AbortController();
    controller.abort(new Error('cancelled before dispatch'));

    await expect(
      fetchWithTimeout('https://example.test/', { signal: controller.signal }, 5_000),
    ).rejects.toThrow('cancelled before dispatch');
  });

  it('defaults to OUTBOUND_FETCH_TIMEOUT_MS when no timeout is given', async () => {
    // A signal whose abort is far in the future (the default) must not have
    // fired by the time the request resolves.
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await fetchWithTimeout('https://example.test/');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.signal?.aborted).toBe(false);
    // Sanity: the default constant is a sane fail-fast bound.
    expect(OUTBOUND_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
