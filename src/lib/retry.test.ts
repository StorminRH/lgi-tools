import { getEventListeners } from 'node:events';
import { expect, test, vi } from 'vitest';
import { readWithRetries, sleep } from './retry';

const NO_WAIT = [0, 0];

test('takes the first read that succeeds, counting a thrown read as a failed attempt', async () => {
  const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('fees');
  await expect(readWithRetries(read, undefined, NO_WAIT)).resolves.toBe('fees');
  expect(read).toHaveBeenCalledTimes(2);

  const thrown = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('fees');
  await expect(readWithRetries(thrown, undefined, NO_WAIT)).resolves.toBe('fees');
});

test('waits longer before each retry, and gives up after the third attempt', async () => {
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

test('stops retrying as soon as the read is abandoned, and reads nothing once already abandoned', async () => {
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

  const aborted = new AbortController();
  aborted.abort();
  const read = vi.fn().mockResolvedValue('fees');
  await expect(readWithRetries(read, aborted.signal, NO_WAIT)).resolves.toBeNull();
  expect(read).not.toHaveBeenCalled();
});

test('returns at once when the read is abandoned while it runs, without waiting out the next pause', async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const read = vi.fn(async () => {
      controller.abort();
      return null;
    });
    let result: string | null | undefined;
    void readWithRetries(read, controller.signal).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test('sleep waits out its time, then leaves no abort listener on the signal', async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    let woke = false;
    void sleep(500, controller.signal).then(() => {
      woke = true;
    });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(woke).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(woke).toBe(true);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

test('sleep ends early when its signal aborts, and at once when it already has', async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    let woke = false;
    const done = sleep(500, controller.signal).then(() => {
      woke = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(woke).toBe(false);
    controller.abort();
    await done;
    expect(vi.getTimerCount()).toBe(0);

    await expect(sleep(500, controller.signal)).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});
