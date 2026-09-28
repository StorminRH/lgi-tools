import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationTrackingMergeError, mergeLocationTrackingState } from './merge';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'svc-secret');
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  vi.unstubAllEnvs();
});

describe('mergeLocationTrackingState', () => {
  it('POSTs source and survivor to /merge-user-state with the bearer secret and returns the counts', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ trackingMoved: 2, trackingDropped: 1, deleted: 5 }), { status: 200 }),
    );
    await expect(mergeLocationTrackingState('src', 'surv')).resolves.toEqual({
      trackingMoved: 2,
      trackingDropped: 1,
      deleted: 5,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://example.convex.site/merge-user-state');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer svc-secret');
    expect(JSON.parse(init?.body as string)).toEqual({ sourceUserId: 'src', survivorUserId: 'surv' });
  });

  it('rejects a non-2xx answer and an off-contract body as LocationTrackingMergeError', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(mergeLocationTrackingState('src', 'surv')).rejects.toBeInstanceOf(
      LocationTrackingMergeError,
    );
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ moved: 1 }), { status: 200 }));
    await expect(mergeLocationTrackingState('src', 'surv')).rejects.toThrow('invalid contract');
  });

  it('rejects when Convex is not configured instead of pretending to have moved anything', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    await expect(mergeLocationTrackingState('src', 'surv')).rejects.toThrow('service secret is unset');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
