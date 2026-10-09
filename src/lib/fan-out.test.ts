import { describe, expect, it, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';
import { mapByIdDroppingNulls, mapConcurrent } from './fan-out';

describe('mapByIdDroppingNulls', () => {
  it('keeps only the ids whose getter returns non-null, keyed by id', async () => {
    const map = await mapByIdDroppingNulls([1, 2, 3], async (id) =>
      id === 2 ? null : { value: id * 10 },
    );

    expect([...map.entries()]).toEqual([
      [1, { value: 10 }],
      [3, { value: 30 }],
    ]);
    expect(map.has(2)).toBe(false);
  });

  it('returns an empty map for no ids', async () => {
    const map = await mapByIdDroppingNulls([], async () => ({ value: 1 }));
    expect(map.size).toBe(0);
  });

  it('returns an empty map when every owner is unsynced (all null)', async () => {
    const map = await mapByIdDroppingNulls([1, 2], async () => null);
    expect(map.size).toBe(0);
  });

  it('keeps a falsy-but-non-null value (0, empty string) — only null is dropped', async () => {
    const map = await mapByIdDroppingNulls<number>([1, 2], async (id) => (id === 1 ? 0 : 5));
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(5);
  });

  it('runs the getters concurrently (Promise.all), not sequentially', async () => {
    let active = 0;
    let maxActive = 0;
    await mapByIdDroppingNulls([1, 2, 3], async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { value: id };
    });
    expect(maxActive).toBeGreaterThan(1);
  });
});

/** A worker whose calls stay in flight until the test settles each one by index. */
function gatedWorker() {
  const started: number[] = [];
  const settles: ((outcome: { value: string } | { error: Error }) => void)[] = [];
  let active = 0;
  let peak = 0;
  const worker = (item: string, index: number) => {
    started.push(index);
    active += 1;
    peak = Math.max(peak, active);
    return new Promise<string>((resolve, reject) => {
      settles[index] = (outcome) => {
        active -= 1;
        if ('error' in outcome) reject(outcome.error);
        else resolve(outcome.value);
      };
    });
  };
  return {
    worker,
    started,
    peak: () => peak,
    resolve: (index: number) => settles[index]!({ value: `done ${index}` }),
    reject: (index: number, error: Error) => settles[index]!({ error }),
  };
}

describe('mapConcurrent', () => {
  it('keeps at most `limit` calls in flight and returns results in input order', async () => {
    const pool = gatedWorker();
    const run = mapConcurrent(['a', 'b', 'c', 'd', 'e'], 2, pool.worker);
    expect(pool.started).toEqual([0, 1]);

    pool.resolve(1);
    await vi.waitFor(() => expect(pool.started).toEqual([0, 1, 2]));
    pool.resolve(2);
    await vi.waitFor(() => expect(pool.started).toEqual([0, 1, 2, 3]));
    pool.resolve(0);
    await vi.waitFor(() => expect(pool.started).toEqual([0, 1, 2, 3, 4]));
    pool.resolve(4);
    pool.resolve(3);

    expect(await run).toEqual(['done 0', 'done 1', 'done 2', 'done 3', 'done 4']);
    expect(pool.peak()).toBe(2);
  });

  it('passes each item with its index to the worker', async () => {
    const seen: [string, number][] = [];
    const results = await mapConcurrent(['x', 'y'], 4, async (item, index) => {
      seen.push([item, index]);
      return `${item}${index}`;
    });
    expect(results).toEqual(['x0', 'y1']);
    expect(seen).toEqual([['x', 0], ['y', 1]]);
  });

  it('returns [] for no items without calling the worker', async () => {
    const worker = vi.fn(async () => 'unused');
    expect(await mapConcurrent([], 3, worker)).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('starts every item at once when the limit exceeds the item count', async () => {
    const pool = gatedWorker();
    const run = mapConcurrent(['a', 'b', 'c'], 10, pool.worker);
    expect(pool.started).toEqual([0, 1, 2]);
    pool.resolve(2);
    pool.resolve(0);
    pool.resolve(1);
    expect(await run).toEqual(['done 0', 'done 1', 'done 2']);
  });

  it('rethrows the first rejection and claims no item after it', async () => {
    const pool = gatedWorker();
    const run = mapConcurrent(['a', 'b', 'c', 'd', 'e'], 2, pool.worker);
    expect(pool.started).toEqual([0, 1]);

    pool.reject(1, new Error('upstream down'));
    await expect(run).rejects.toThrow('upstream down');

    pool.resolve(0);
    await settle();
    expect(pool.started).toEqual([0, 1]);
  });

  it('runs one call at a time when the limit is 0 or NaN', async () => {
    for (const limit of [0, Number.NaN]) {
      const pool = gatedWorker();
      const run = mapConcurrent(['a', 'b'], limit, pool.worker);
      expect(pool.started).toEqual([0]);
      pool.resolve(0);
      await vi.waitFor(() => expect(pool.started).toEqual([0, 1]));
      pool.resolve(1);
      expect(await run).toEqual(['done 0', 'done 1']);
    }
  });
});
