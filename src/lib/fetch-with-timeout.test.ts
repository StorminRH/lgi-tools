import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithTimeout,
  OUTBOUND_FETCH_TIMEOUT_MS,
} from './fetch-with-timeout';

// A fetch mock that never settles on its own, only when its abort signal
// fires — so the only way the promise rejects is the timeout aborting it.
function abortAwareFetch() {
  return vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject((init.signal as AbortSignal).reason);
        });
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
    // Real (tiny) timeout: AbortSignal.timeout is internal and does not honor
    // fake timers, so a short real delay is the robust way to prove it fires.
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
