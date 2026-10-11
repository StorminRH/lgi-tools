import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dependencyUnavailableFailure,
  rateLimitedFailure,
  unauthenticatedFailure,
  validationFailure,
} from '@/lib/failure';
import { problemBody, serializeProblem, type ProblemBody } from '@/lib/problem';
import {
  createMapWithMinimumInterstitial,
  handoffCreatedMap,
  MAP_CREATION_INTERSTITIAL_MIN_MS,
  mapCreationFailureMessage,
  mapCreationSubmitStart,
  runMapCreationSubmit,
} from './map-creation-client';

const MAP_ID = '11111111-1111-4111-8111-111111111111';
const INPUT = { name: 'Home chain', creatorCharacterIds: [7], grants: [] };

/** The create's outcome, which the test expects to have failed. */
function failed<TOutcome extends { ok: boolean }>(outcome: TOutcome): Extract<TOutcome, { ok: false }> {
  if (outcome.ok) throw new Error('expected the create to fail');
  return outcome as Extract<TOutcome, { ok: false }>;
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
      vi.fn().mockResolvedValue(Response.json({ mapId: MAP_ID }, { status: 201 })),
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
      data: { mapId: MAP_ID },
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
    deliver?.(Response.json({ mapId: MAP_ID }, { status: 201 }));

    await expect(pending).resolves.toMatchObject({
      ok: true,
      data: { mapId: MAP_ID },
    });
  });

  it('waits before exposing compensated failure and gives it fresh-create copy', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        serializeProblem(
          problemBody(
            dependencyUnavailableFailure('map_projection_unavailable'),
            'correlation-id',
          ),
        ),
      ),
    );

    const pending = createMapWithMinimumInterstitial(INPUT);
    await vi.advanceTimersByTimeAsync(5_000);
    const outcome = await pending;

    expect(mapCreationFailureMessage(failed(outcome))).toContain('rolled back');
  });

  it('names each refusal by its code and keeps the connection hint for a request that got no answer', async () => {
    vi.useFakeTimers();
    const refusal = (code: string) =>
      serializeProblem(problemBody(validationFailure(code), 'correlation-id'));
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(refusal('not_linked'))
        .mockResolvedValueOnce(refusal('invalid_body'))
        .mockResolvedValueOnce(serializeProblem(problemBody(unauthenticatedFailure(), 'correlation-id')))
        .mockResolvedValueOnce(serializeProblem(problemBody(rateLimitedFailure(37), 'correlation-id')))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const settled = async () => {
      const pending = createMapWithMinimumInterstitial(INPUT);
      await vi.advanceTimersByTimeAsync(MAP_CREATION_INTERSTITIAL_MIN_MS);
      return mapCreationFailureMessage(failed(await pending));
    };

    // Naming someone else's character is not a connection problem.
    expect(await settled()).toBe('Choose one of your own linked characters.');
    expect(await settled()).toBe('The map could not be created.');
    expect(await settled()).toBe('Your session has ended. Sign in again.');
    // The wait comes from the server's retry delay, not a fixed minute.
    expect(await settled()).toBe('Too many attempts. Try again in 37 seconds.');
    expect(await settled()).toBe('The map could not be created. Check your connection and try again.');
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

describe('mapCreationSubmitStart', () => {
  it('ignores an in-flight submit, surfaces draft errors, then starts transport', () => {
    expect(mapCreationSubmitStart(true, { ok: true, input: INPUT })).toEqual({
      kind: 'ignored',
    });
    expect(
      mapCreationSubmitStart(false, { ok: false, message: 'Enter a map name.' }),
    ).toEqual({ kind: 'invalid', message: 'Enter a map name.' });
    expect(mapCreationSubmitStart(false, { ok: true, input: INPUT })).toEqual({
      kind: 'begin',
      input: INPUT,
    });
  });
});

describe('runMapCreationSubmit', () => {
  it('walks ignore, invalid, failed, and created outcomes through the dialog actions', async () => {
    const events: string[] = [];
    const actions = {
      onInvalid: (message: string) => events.push(`invalid:${message}`),
      onBegin: () => events.push('begin'),
      onFailed: (message: string) => events.push(`failed:${message}`),
      onCreated: (mapId: string) => events.push(`created:${mapId}`),
    };

    await runMapCreationSubmit(true, { ok: true, input: INPUT }, async () => {
      throw new Error('create must not run while busy');
    }, actions);
    expect(events).toEqual([]);

    await runMapCreationSubmit(
      false,
      { ok: false, message: 'Enter a map name.' },
      async () => {
        throw new Error('create must not run for an invalid draft');
      },
      actions,
    );
    expect(events).toEqual(['invalid:Enter a map name.']);

    events.length = 0;
    await runMapCreationSubmit(false, { ok: true, input: INPUT }, async () => {
      return {
        ok: false,
        kind: 'api' as const,
        status: 503 as const,
        error: problemBody(
          dependencyUnavailableFailure('map_projection_unavailable'),
          'correlation-id',
        ) as ProblemBody & { code: 'map_projection_unavailable' },
      };
    }, actions);
    expect(events).toEqual([
      'begin',
      'failed:Map access could not be projected. The attempted map was rolled back; try again.',
    ]);

    events.length = 0;
    await runMapCreationSubmit(false, { ok: true, input: INPUT }, async () => {
      return { ok: true, status: 201 as const, data: { mapId: 'map-9' } };
    }, actions);
    expect(events).toEqual(['begin', 'created:map-9']);
  });
});
