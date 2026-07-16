import { describe, expect, it, vi } from 'vitest';
import { createResourceRead } from './resource-read';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createResourceRead', () => {
  it('lets only the latest started read apply, even when the older read resolves successfully', async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    const signals: AbortSignal[] = [];
    let call = 0;
    const onData = vi.fn();
    const resource = createResourceRead({
      read: (signal) => {
        signals.push(signal);
        return call++ === 0 ? first.promise : second.promise;
      },
      onData,
    });

    const slow = resource.start();
    const fast = resource.start();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    second.resolve('new');
    await fast;
    first.resolve('old');
    await slow;

    expect(onData).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenCalledWith('new');
  });

  it('aborts the active signal and ignores a late resolution after cancel', async () => {
    const pending = deferred<string | null>();
    let signal: AbortSignal | undefined;
    const onData = vi.fn();
    const resource = createResourceRead({
      read: (activeSignal) => {
        signal = activeSignal;
        return pending.promise;
      },
      onData,
    });

    const running = resource.start();
    resource.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve('late');
    await running;

    expect(onData).not.toHaveBeenCalled();
  });

  it('propagates abort to a read that rejects from its signal', async () => {
    const onData = vi.fn();
    const resource = createResourceRead({
      read: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
      onData,
    });

    const running = resource.start();
    resource.cancel();

    await expect(running).resolves.toBeUndefined();
    expect(onData).not.toHaveBeenCalled();
  });

  it('settles thrown failures silently', async () => {
    const onData = vi.fn();
    const resource = createResourceRead({
      read: async () => {
        throw new Error('network down');
      },
      onData,
    });

    await expect(resource.start()).resolves.toBeUndefined();
    expect(onData).not.toHaveBeenCalled();
  });

  it('settles a null result without applying data', async () => {
    const onData = vi.fn();
    const resource = createResourceRead({
      read: async () => null,
      onData,
    });

    await resource.start();
    expect(onData).not.toHaveBeenCalled();
  });

  it('does not hide an application error from the data callback', async () => {
    const resource = createResourceRead({
      read: async () => 'data',
      onData: () => {
        throw new Error('state mapping failed');
      },
    });

    await expect(resource.start()).rejects.toThrow('state mapping failed');
  });
});
