import { describe, expect, it, vi } from 'vitest';
import { readWithRetries } from './read-with-retries';

const NO_WAIT = [0, 0];

describe('readWithRetries', () => {
  it('takes the first read that succeeds', async () => {
    const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('fees');
    await expect(readWithRetries(read, undefined, NO_WAIT)).resolves.toBe('fees');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('counts a thrown read as a failed attempt', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('fees');
    await expect(readWithRetries(read, undefined, NO_WAIT)).resolves.toBe('fees');
  });

  it('gives up after three attempts', async () => {
    const read = vi.fn().mockResolvedValue(null);
    await expect(readWithRetries(read, undefined, NO_WAIT)).resolves.toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('waits longer before each retry', async () => {
    vi.useFakeTimers();
    try {
      const read = vi.fn().mockResolvedValue(null);
      const done = readWithRetries(read);
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(599);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1800);
      expect(read).toHaveBeenCalledTimes(3);
      await expect(done).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops retrying as soon as the read is abandoned', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const read = vi.fn().mockResolvedValue(null);
      const done = readWithRetries(read, controller.signal);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await expect(done).resolves.toBeNull();
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads nothing once already abandoned', async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn().mockResolvedValue('fees');
    await expect(readWithRetries(read, controller.signal, NO_WAIT)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
