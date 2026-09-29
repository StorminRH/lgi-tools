import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationTrackingMergeError, restoreMergeTracking, snapshotMergeTracking } from './merge';

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

describe('restoreMergeTracking', () => {
  it('POSTs operation and selections to /restore-merge-tracking with the bearer secret and returns the counts', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ restored: 2, skipped: 1, alreadyApplied: false }), { status: 200 }),
    );
    await expect(restoreMergeTracking('op', 'surv', [])).resolves.toEqual({
      restored: 2,
      skipped: 1,
      alreadyApplied: false,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://example.convex.site/restore-merge-tracking');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer svc-secret');
    expect(JSON.parse(init?.body as string)).toEqual({ operationId: 'op', survivorUserId: 'surv', selections: [] });
  });

  it('rejects a non-2xx answer and an off-contract body as LocationTrackingMergeError', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(restoreMergeTracking('op', 'surv', [])).rejects.toBeInstanceOf(
      LocationTrackingMergeError,
    );
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ moved: 1 }), { status: 200 }));
    await expect(restoreMergeTracking('op', 'surv', [])).rejects.toThrow('invalid contract');
  });

  it('rejects when Convex is not configured instead of pretending to have moved anything', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    await expect(restoreMergeTracking('op', 'surv', [])).rejects.toThrow('service secret is unset');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

it('captures only tracking selections before the SQL merge', async () => {
  const selections = [{ mapId: 'map', characterId: 123 }];
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ selections })));
  await expect(snapshotMergeTracking('src')).resolves.toEqual(selections);
  expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string)).toEqual({ sourceUserId: 'src' });
});
