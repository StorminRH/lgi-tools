import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMapWithMinimumInterstitial,
  handoffCreatedMap,
  MAP_CREATION_INTERSTITIAL_MIN_MS,
  mapCreationFailureMessage,
} from './map-creation-client';

const INPUT = { name: 'Home chain', grants: [] };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createMapWithMinimumInterstitial', () => {
  it('holds a fast success for the full five-second minimum', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ mapId: 'map-1' }, 201)),
    );

    let settled = false;
    const pending = createMapWithMinimumInterstitial(INPUT).then((outcome) => {
      settled = true;
      return outcome;
    });
    await vi.advanceTimersByTimeAsync(MAP_CREATION_INTERSTITIAL_MIN_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({
      ok: true,
      status: 201,
      data: { mapId: 'map-1' },
    });
  });

  it('does not add five seconds after a slower request has already met the minimum', async () => {
    vi.useFakeTimers();
    let deliver: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          deliver = resolve;
        }),
      ),
    );

    const pending = createMapWithMinimumInterstitial(INPUT);
    await vi.advanceTimersByTimeAsync(12_000);
    deliver?.(jsonResponse({ mapId: 'map-2' }, 201));

    await expect(pending).resolves.toMatchObject({
      ok: true,
      data: { mapId: 'map-2' },
    });
  });

  it('waits before exposing compensated failure and gives it fresh-create copy', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            type: 'https://lgi.tools/problems/dependency-unavailable',
            title: 'Dependency unavailable',
            status: 503,
            code: 'map_projection_unavailable',
            correlationId: 'correlation-id',
          },
          503,
        ),
      ),
    );

    const pending = createMapWithMinimumInterstitial(INPUT);
    await vi.advanceTimersByTimeAsync(5_000);
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    expect(mapCreationFailureMessage(outcome)).toContain('rolled back');
  });
});

describe('handoffCreatedMap', () => {
  it('resets and closes the persistent dialog before query navigation', () => {
    const events: string[] = [];

    handoffCreatedMap('map/one', {
      reset: () => events.push('reset'),
      close: () => events.push('close'),
      onCreated: (mapId) => events.push(`created:${mapId}`),
      navigate: (href) => events.push(`navigate:${href}`),
    });

    expect(events).toEqual([
      'reset',
      'close',
      'created:map/one',
      'navigate:/atlas?map=map%2Fone',
    ]);
  });
});
