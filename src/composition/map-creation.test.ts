import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectedMap } from './map-creation';

const INPUT = {
  name: 'Home chain',
  grants: [{ ownerType: 'character' as const, ownerId: 42, role: 'editor' as const }],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createProjectedMap', () => {
  it('returns the durable map immediately when the first projection succeeds', async () => {
    const createMap = vi.fn().mockResolvedValue('map-1');
    const project = vi.fn().mockResolvedValue(undefined);
    const compensate = vi.fn();
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(
      createProjectedMap('user-1', INPUT, { createMap, project, compensate, publish }),
    ).resolves.toEqual({ ok: true, mapId: 'map-1' });
    expect(createMap).toHaveBeenCalledWith('user-1', 'Home chain', INPUT.grants);
    expect(project).toHaveBeenCalledWith(
      'map-1',
      expect.objectContaining({ timeoutMs: 2_000, signal: expect.any(AbortSignal) }),
    );
    expect(publish).toHaveBeenCalledWith('map-1');
    expect(compensate).not.toHaveBeenCalled();
  });

  it('uses the 0/2/5/10 second ladder and compensates after projection exhaustion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    const startedAt = Date.now();
    const attempts: Array<{ at: number; timeoutMs: number | undefined }> = [];
    const project = vi.fn(async (_mapId: string, options?: { timeoutMs?: number }) => {
      attempts.push({ at: Date.now() - startedAt, timeoutMs: options?.timeoutMs });
      throw new Error('projection unavailable');
    });
    const compensate = vi.fn().mockResolvedValue(undefined);

    const resultPromise = createProjectedMap('user-1', INPUT, {
      createMap: vi.fn().mockResolvedValue('map-1'),
      project,
      compensate,
      publish: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toMatchObject({ ok: false, cleanup: 'deleted' });
    expect(attempts).toEqual([
      { at: 0, timeoutMs: 2_000 },
      { at: 2_000, timeoutMs: 2_000 },
      { at: 5_000, timeoutMs: 2_000 },
      { at: 10_000, timeoutMs: 2_000 },
    ]);
    expect(compensate).toHaveBeenCalledOnce();
    expect(compensate).toHaveBeenCalledWith('map-1');
  });

  it('retries compensation and reports the durable staged recovery when deletes fail', async () => {
    const cleanupFailure = new Error('cleanup failed');
    const result = await createProjectedMap('user-1', INPUT, {
      createMap: vi.fn().mockResolvedValue('map-1'),
      project: vi.fn().mockRejectedValue(new Error('projection unavailable')),
      publish: vi.fn(),
      compensate: vi.fn().mockRejectedValue(cleanupFailure),
      pause: vi.fn().mockResolvedValue(undefined),
      now: vi.fn().mockReturnValue(0),
    });

    expect(result).toMatchObject({ ok: false, cleanup: 'queued' });
    if (result.ok) expect.unreachable('expected failed creation');
    expect(result.cause).toBeInstanceOf(AggregateError);
  });

  it('bounds stalled projection work and aborts it before compensation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    const startedAt = Date.now();
    const attempts: number[] = [];
    const project = vi.fn(
      async (_mapId: string, options?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          attempts.push(Date.now() - startedAt);
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
        }),
    );

    const resultPromise = createProjectedMap('user-1', INPUT, {
      createMap: vi.fn().mockResolvedValue('map-1'),
      project,
      publish: vi.fn(),
      compensate: vi.fn().mockResolvedValue(undefined),
    });
    await vi.advanceTimersByTimeAsync(12_000);

    await expect(resultPromise).resolves.toMatchObject({ ok: false, cleanup: 'deleted' });
    expect(attempts).toEqual([0, 2_000, 5_000, 10_000]);
    for (const [, options] of project.mock.calls) {
      expect(options?.signal?.aborted).toBe(true);
    }
  });
});
