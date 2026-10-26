import { expect, test, vi } from 'vitest';
import {
  dependencyUnavailableFailure,
  validationFailure,
} from '@/lib/failure';
import { problemBody, serializeProblem, type ProblemBody } from '@/lib/problem';
import {
  createMapWithMinimumInterstitial,
  handoffCreatedMap,
  mapCreationFailureMessage,
  runMapCreationSubmit,
} from './map-creation-client';

const MAP_ID = '11111111-1111-4111-8111-111111111111';
const INPUT = { name: 'Home chain', creatorCharacterIds: [7], grants: [] };

/** The create's outcome, which the test expects to have failed. */
function failed<TOutcome extends { ok: boolean }>(outcome: TOutcome): Extract<TOutcome, { ok: false }> {
  if (outcome.ok) throw new Error('expected the create to fail');
  return outcome as Extract<TOutcome, { ok: false }>;
}

test('a create holds a fast success for the five-second minimum but adds nothing once a slow one has met it', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ mapId: MAP_ID }, { status: 201 }))));
    let settled = false;
    const fast = createMapWithMinimumInterstitial(INPUT).then((outcome) => {
      settled = true;
      return outcome;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(fast).resolves.toEqual({ ok: true, status: 201, data: { mapId: MAP_ID } });

    let deliver: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { deliver = resolve; })));
    const slow = createMapWithMinimumInterstitial(INPUT);
    await vi.advanceTimersByTimeAsync(12_000);
    deliver?.(Response.json({ mapId: MAP_ID }, { status: 201 }));
    await expect(slow).resolves.toMatchObject({ ok: true, data: { mapId: MAP_ID } });
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test('a failed create names its refusal by code and keeps the connection line for everything else', async () => {
  vi.useFakeTimers();
  try {
    const refusal = (code: string) => serializeProblem(problemBody(validationFailure(code), 'correlation-id'));
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(refusal('not_linked'))
        .mockResolvedValueOnce(refusal('invalid_body'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const settled = async () => {
      const pending = createMapWithMinimumInterstitial(INPUT);
      await vi.advanceTimersByTimeAsync(5_000);
      return mapCreationFailureMessage(failed(await pending));
    };

    // Naming someone else's character is not a connection problem.
    expect(await settled()).toBe('Choose one of your own linked characters.');
    // A malformed request keeps the owner-approved line rather than repeating the dialog title.
    expect(await settled()).toBe('Check your connection and try again.');
    expect(await settled()).toBe('Check your connection and try again.');
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test('handoffCreatedMap resets and closes the persistent dialog before query navigation', () => {
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

test('runMapCreationSubmit walks ignore, invalid, failed, and created outcomes through the dialog actions', async () => {
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
  const created: unknown[] = [];
  await runMapCreationSubmit(false, { ok: true, input: INPUT }, async (input) => {
    created.push(input);
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
  expect(created).toEqual([INPUT]);
  expect(events).toEqual([
    'begin',
    "failed:Couldn't set up map access. Try again.",
  ]);

  events.length = 0;
  await runMapCreationSubmit(false, { ok: true, input: INPUT }, async () => {
    return { ok: true, status: 201 as const, data: { mapId: 'map-9' } };
  }, actions);
  expect(events).toEqual(['begin', 'created:map-9']);
});
