import { describe, expect, it, vi } from 'vitest';
import {
  addDependencyTiming,
  setDependencyTimingSink,
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

  it('passes a call status through to the sink', () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);

    addDependencyTiming('esi', 9, { status: 404 });

    expect(sink).toHaveBeenCalledWith('esi', 9, { status: 404 });
  });

  it('times wrapped work as one call whether it resolves or throws', async () => {
    const sink = vi.fn();
    setDependencyTimingSink(sink);

    await expect(timeDependency('convex', async () => 'ok')).resolves.toBe('ok');
    await expect(
      timeDependency('sso', async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');

    expect(sink.mock.calls.map(([kind]) => kind)).toEqual(['convex', 'sso']);
    for (const [, ms] of sink.mock.calls) expect(ms).toBeGreaterThanOrEqual(0);
  });
});
