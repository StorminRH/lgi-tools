import { afterEach, describe, expect, it, vi } from 'vitest';

// loadSection delegates framework-signal handling to next/navigation's
// unstable_rethrow, so we stub it: a no-op leaves a genuine error to degrade to
// the sentinel; a throwing stub stands in for a real PPR/redirect signal that
// must propagate. (vi.hoisted so the mock factory can reference the spy.)
const { rethrow } = vi.hoisted(() => ({ rethrow: vi.fn() }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: (err: unknown) => rethrow(err),
}));

import { loadSection, SECTION_LOAD_FAILED } from './load-section';

describe('loadSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rethrow.mockReset();
  });

  it('passes a successful load result straight through', async () => {
    const result = await loadSection('test', async () => ({ count: 7 }));

    expect(result).toEqual({ count: 7 });
    expect(rethrow).not.toHaveBeenCalled();
  });

  it('degrades a genuine data failure to the sentinel and logs it', async () => {
    const err = new Error('db down');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loadSection('users', async () => {
      throw err;
    });

    expect(result).toBe(SECTION_LOAD_FAILED);
    // The framework-signal guard is consulted before anything is logged or degraded.
    expect(rethrow).toHaveBeenCalledWith(err);
    expect(consoleError).toHaveBeenCalledWith('[admin] users section unavailable', err);
  });

  it('re-throws a framework control-flow signal instead of swallowing it', async () => {
    const signal = new Error('NEXT_REDIRECT');
    // Stand in for unstable_rethrow recognizing a framework signal and re-throwing.
    rethrow.mockImplementation((err: unknown) => {
      throw err;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      loadSection('kpi', async () => {
        throw signal;
      }),
    ).rejects.toBe(signal);
    // A propagated signal is neither degraded to the sentinel nor logged as an app error.
    expect(consoleError).not.toHaveBeenCalled();
  });
});
