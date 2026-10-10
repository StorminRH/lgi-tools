import { afterEach, describe, expect, it, vi } from 'vitest';
import { conflictFailure, forbiddenFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { problemResponse } from './api-response';
import {
  currentCorrelationId,
  currentDependencyTimings,
  currentDependencyWallMs,
  currentStashedFailure,
  stashFailure,
  withCorrelationScope,
} from './correlation';

/** Pins the clock each recorded call reads as its end. */
function clockAt(...ends: number[]): void {
  const spy = vi.spyOn(performance, 'now');
  for (const end of ends) spy.mockReturnValueOnce(end);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('correlation scope', () => {
  it('gives concurrent scopes independent ids, timings, and failure stashes', async () => {
    clockAt(1_000, 1_000);
    const observe = (kind: 'neon' | 'esi', ms: number) =>
      withCorrelationScope(async () => {
        const id = currentCorrelationId();
        addDependencyTiming(kind, ms);
        await Promise.resolve();
        stashFailure(kind === 'neon' ? conflictFailure('template_limit') : forbiddenFailure());
        await Promise.resolve();
        return {
          id,
          idAfterAwait: currentCorrelationId(),
          dependencies: { ...currentDependencyTimings() },
          failure: currentStashedFailure(),
        };
      });

    const [first, second] = await Promise.all([observe('neon', 12), observe('esi', 30)]);

    expect(first.id).not.toBe(second.id);
    expect(first.idAfterAwait).toBe(first.id);
    expect(second.idAfterAwait).toBe(second.id);
    expect(first.dependencies).toEqual({ neon: { ms: 12, calls: 1, wallMs: 12 } });
    expect(second.dependencies).toEqual({ esi: { ms: 30, calls: 1, wallMs: 30 } });
    expect(first.failure).toEqual({ category: 'conflict', code: 'template_limit' });
    expect(second.failure).toEqual({ category: 'forbidden', code: 'forbidden' });
  });

  it('accumulates repeated calls to one dependency kind', async () => {
    clockAt(100, 200, 300);
    const timings = await withCorrelationScope(async () => {
      addDependencyTiming('neon', 5);
      addDependencyTiming('neon', 7);
      addDependencyTiming('redis', 2);
      return { ...currentDependencyTimings() };
    });

    expect(timings).toEqual({
      neon: { ms: 12, calls: 2, wallMs: 12 },
      redis: { ms: 2, calls: 1, wallMs: 2 },
    });
  });

  it('counts overlapping calls once in wall time but in full in summed time', async () => {
    // Three 100 ms calls ending at 100, 150 and 400 cover 0-150 and 300-400.
    clockAt(100, 150, 400);
    const { timings, wallMs } = await withCorrelationScope(async () => {
      addDependencyTiming('esi', 100);
      addDependencyTiming('esi', 100);
      addDependencyTiming('redis', 100);
      return { timings: currentDependencyTimings(), wallMs: currentDependencyWallMs() };
    });

    expect(timings.esi).toEqual({ ms: 200, calls: 2, wallMs: 150 });
    expect(timings.redis).toEqual({ ms: 100, calls: 1, wallMs: 100 });
    expect(wallMs).toBe(250);
  });

  it('counts calls answered with a 4xx status', async () => {
    clockAt(10, 20, 30, 40);
    const timings = await withCorrelationScope(async () => {
      addDependencyTiming('esi', 1, { status: 200 });
      addDependencyTiming('esi', 1, { status: 404 });
      addDependencyTiming('esi', 1, { status: 400 });
      addDependencyTiming('esi', 1);
      return currentDependencyTimings();
    });

    expect(timings.esi).toEqual({ ms: 4, calls: 4, wallMs: 4, status4xx: 2 });
  });

  it('returns a snapshot that later calls do not change', async () => {
    clockAt(10, 20);
    const { snapshot, later } = await withCorrelationScope(async () => {
      addDependencyTiming('neon', 5);
      const taken = currentDependencyTimings();
      addDependencyTiming('neon', 5);
      return { snapshot: taken, later: currentDependencyTimings() };
    });

    expect(snapshot.neon).toEqual({ ms: 5, calls: 1, wallMs: 5 });
    expect(later.neon).toEqual({ ms: 10, calls: 2, wallMs: 10 });
  });

  it('reports no wall time when nothing was timed', async () => {
    expect(await withCorrelationScope(async () => currentDependencyWallMs())).toBeNull();
    expect(currentDependencyWallMs()).toBeNull();
  });

  it('mints a fresh id and reports no timings outside any scope', () => {
    expect(currentCorrelationId()).not.toBe(currentCorrelationId());
    expect(currentDependencyTimings()).toEqual({});
    expect(currentStashedFailure()).toBeNull();
  });

  it('swallows a dependency timing recorded outside any scope', () => {
    expect(() => addDependencyTiming('esi', 40)).not.toThrow();
    expect(currentDependencyTimings()).toEqual({});
  });

  it('gives two responses built inside one scope the same correlation id', async () => {
    const { first, second, recorded } = await withCorrelationScope(async () => {
      const a = problemBodySchema.parse(await problemResponse(forbiddenFailure()).json());
      const b = problemBodySchema.parse(await problemResponse(forbiddenFailure()).json());
      return { first: a.correlationId, second: b.correlationId, recorded: currentCorrelationId() };
    });

    expect(first).toBe(second);
    expect(first).toBe(recorded);
  });

  it('lets the scope owner recover a stable code the status alone cannot express', async () => {
    const { body, stashed } = await withCorrelationScope(async () => {
      const response = problemResponse(conflictFailure('template_limit'));
      return {
        body: problemBodySchema.parse(await response.json()),
        stashed: currentStashedFailure(),
      };
    });

    expect(body.status).toBe(409);
    expect(stashed).toEqual({ category: 'conflict', code: 'template_limit' });
  });
});
