import { describe, expect, it } from 'vitest';
import { recordMerge, runWithMergeTracking } from './merge-context';

describe('runWithMergeTracking', () => {
  it('reports a merge recorded inside the tracked callback and nothing otherwise', async () => {
    await expect(
      runWithMergeTracking(async () => {
        await Promise.resolve();
        recordMerge();
        return 'done';
      }),
    ).resolves.toEqual({ result: 'done', merged: true });
    await expect(runWithMergeTracking(async () => 42)).resolves.toEqual({ result: 42, merged: false });
  });

  it('ignores a record outside any tracked request and keeps concurrent requests apart', async () => {
    expect(() => recordMerge()).not.toThrow();
    const [a, b] = await Promise.all([
      runWithMergeTracking(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'a';
      }),
      runWithMergeTracking(async () => {
        recordMerge();
        return 'b';
      }),
    ]);
    expect([a, b]).toEqual([
      { result: 'a', merged: false },
      { result: 'b', merged: true },
    ]);
  });
});
