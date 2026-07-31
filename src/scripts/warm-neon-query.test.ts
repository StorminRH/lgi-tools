import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmNeon } from './warm-neon-query';

function neonDbError(message: string, extras: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { name: 'NeonDbError', ...extras });
}

describe('warmNeon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns on the first successful read', async () => {
    const read = vi.fn(async () => [{ ok: 1 }]);
    await warmNeon(read);
    expect(read).toHaveBeenCalledOnce();
  });

  it('retries TimeoutError then succeeds', async () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError');
    const read = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce([{ ok: 1 }]);

    const done = warmNeon(read);
    await vi.runAllTimersAsync();
    await done;

    expect(read).toHaveBeenCalledTimes(2);
  });

  it('retries Neon cold-start connection errors then succeeds', async () => {
    const cold = neonDbError('Error connecting to database: fetch failed');
    const read = vi.fn().mockRejectedValueOnce(cold).mockResolvedValueOnce([{ ok: 1 }]);

    const done = warmNeon(read);
    await vi.runAllTimersAsync();
    await done;

    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-connection SQL failures', async () => {
    const sqlError = neonDbError('syntax error', { code: '42601' });
    const read = vi.fn().mockRejectedValueOnce(sqlError);
    await expect(warmNeon(read)).rejects.toBe(sqlError);
    expect(read).toHaveBeenCalledOnce();
  });

  it('rethrows after exhausting timeout retries', async () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError');
    const read = vi.fn().mockRejectedValue(timeout);

    const done = warmNeon(read);
    const expectation = expect(done).rejects.toBe(timeout);
    await vi.runAllTimersAsync();
    await expectation;
    expect(read).toHaveBeenCalledTimes(4);
  });
});
