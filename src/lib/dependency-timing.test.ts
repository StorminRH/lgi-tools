import { describe, expect, it, vi } from 'vitest';
import {
  addDependencyTiming,
  setDependencyTimingSink,
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
      ['neon', 12],
      ['redis', 3],
    ]);
  });

  it('lets the last installer win', () => {
    const first = vi.fn();
    const second = vi.fn();
    setDependencyTimingSink(first);
    setDependencyTimingSink(second);

    addDependencyTiming('esi', 40);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('esi', 40);
  });
});
