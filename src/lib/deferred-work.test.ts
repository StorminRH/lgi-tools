import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferWork, setWorkDeferrer } from './deferred-work';

afterEach(() => {
  setWorkDeferrer(null);
});

describe('deferWork', () => {
  it('runs the task now when no deferrer is installed', async () => {
    const task = vi.fn(async () => {});
    await deferWork(task);
    expect(task).toHaveBeenCalledOnce();
  });

  it('hands the task to a deferrer that accepts it without running it', async () => {
    const task = vi.fn(async () => {});
    const deferred: (() => Promise<void>)[] = [];
    setWorkDeferrer((next) => {
      deferred.push(next);
      return true;
    });

    await deferWork(task);

    expect(task).not.toHaveBeenCalled();
    expect(deferred).toEqual([task]);
  });

  it('runs the task now when the deferrer declines it', async () => {
    const task = vi.fn(async () => {});
    setWorkDeferrer(() => false);

    await deferWork(task);

    expect(task).toHaveBeenCalledOnce();
  });
});
