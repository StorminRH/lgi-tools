import { describe, expect, it, vi } from 'vitest';
import {
  addDependencyTiming,
  isThenable,
  setDependencyTimingSink,
  startDependencyTimer,
  timeDependency,
} from './dependency-timing';

describe('dependency timing', () => {
  it('is a silent no-op before any sink is installed', () => {
    expect(() => addDependencyTiming('neon', 5)).not.toThrow();
    expect(() => addDependencyTiming('esi', 0)).not.toThrow();
  });

  it('forwards each measured call to the installed sink', () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);

    addDependencyTiming('neon', 12);
    addDependencyTiming('redis', 3);

    expect(sink.mock.calls).toEqual([
      ['neon', 12, undefined],
      ['redis', 3, undefined],
    ]);
  });

  it('lets the last installer win', () => {
    const first = vi.fn();
    const second = vi.fn();
    setDependencyTimingSink(first);
    setDependencyTimingSink(second);

    addDependencyTiming('esi', 40);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('esi', 40, undefined);
  });

  it('passes a call status through to the sink', () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);

    addDependencyTiming('esi', 9, { status: 404 });

    expect(sink).toHaveBeenCalledWith('esi', 9, { status: 404 });
  });

  it('records the elapsed monotonic time when a started timer is stopped', () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);
    vi.useFakeTimers();
    try {
      const stop = startDependencyTimer('redis');
      vi.advanceTimersByTime(7);
      expect(sink).not.toHaveBeenCalled();

      stop();
      expect(sink.mock.calls).toEqual([['redis', 7, undefined]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('times work that resolves, returning its value and recording it once', async () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);
    vi.useFakeTimers();
    try {
      const pending = timeDependency(
        'neon',
        () => new Promise<string>((resolve) => setTimeout(() => resolve('rows'), 25)),
      );
      await vi.advanceTimersByTimeAsync(25);

      await expect(pending).resolves.toBe('rows');
      expect(sink.mock.calls).toEqual([['neon', 25, undefined]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('times work that rejects, rethrowing its error and recording it once', async () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);
    vi.useFakeTimers();
    try {
      const pending = timeDependency(
        'esi',
        () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('esi down')), 40)),
      );
      const settled = expect(pending).rejects.toThrow('esi down');
      await vi.advanceTimersByTimeAsync(40);

      await settled;
      expect(sink.mock.calls).toEqual([['esi', 40, undefined]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recognises promises and hand-made thenables, and nothing else', () => {
    expect(isThenable(Promise.resolve(1))).toBe(true);
    expect(isThenable({ then: () => undefined })).toBe(true);

    expect(isThenable(null)).toBe(false);
    expect(isThenable(undefined)).toBe(false);
    expect(isThenable('then')).toBe(false);
    expect(isThenable(42)).toBe(false);
    expect(isThenable({ then: 'later' })).toBe(false);
  });
});
