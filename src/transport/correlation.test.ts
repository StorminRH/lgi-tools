import { describe, expect, it } from 'vitest';
import { conflictFailure, forbiddenFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { problemResponse } from './api-response';
import {
  currentCorrelationId,
  currentDependencyTimings,
  currentStashedFailure,
  stashFailure,
  withCorrelationScope,
} from './correlation';

describe('correlation scope', () => {
  it('gives concurrent scopes independent ids, timings, and failure stashes', async () => {
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
    expect(first.dependencies).toEqual({ neon: { ms: 12, calls: 1 } });
    expect(second.dependencies).toEqual({ esi: { ms: 30, calls: 1 } });
    expect(first.failure).toEqual({ category: 'conflict', code: 'template_limit' });
    expect(second.failure).toEqual({ category: 'forbidden', code: 'forbidden' });
  });

  it('accumulates repeated calls to one dependency kind', async () => {
    const timings = await withCorrelationScope(async () => {
      addDependencyTiming('neon', 5);
      addDependencyTiming('neon', 7);
      addDependencyTiming('redis', 2);
      return { ...currentDependencyTimings() };
    });

    expect(timings).toEqual({ neon: { ms: 12, calls: 2 }, redis: { ms: 2, calls: 1 } });
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
