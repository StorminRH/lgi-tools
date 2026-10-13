import { expect, test, vi } from 'vitest';
import { createFrameCoalescer, observeSize } from './frame-coalescer';

function fakeFrames() {
  const pending = new Map<number, () => void>();
  let next = 0;
  const scheduler = {
    schedule: vi.fn((callback: () => void) => {
      next += 1;
      pending.set(next, callback);
      return next;
    }),
    cancel: vi.fn((handle: number) => {
      pending.delete(handle);
    }),
  };
  const flush = () => {
    const due = [...pending.values()];
    pending.clear();
    for (const callback of due) callback();
  };
  return { pending, scheduler, flush };
}

test('a burst of requests runs once per frame and the next request schedules again', () => {
  const frames = fakeFrames();
  const run = vi.fn();
  const frame = createFrameCoalescer(run, frames.scheduler);

  frame.request();
  frame.request();
  frame.request();
  expect(frames.scheduler.schedule).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();

  frames.flush();
  expect(run).toHaveBeenCalledTimes(1);
  expect(frames.pending.size).toBe(0);

  frame.request();
  frame.request();
  expect(frames.scheduler.schedule).toHaveBeenCalledTimes(2);
  frames.flush();
  expect(run).toHaveBeenCalledTimes(2);
});

test('a request made while running schedules the following frame', () => {
  const frames = fakeFrames();
  let passes = 0;
  const frame = createFrameCoalescer(() => {
    passes += 1;
    if (passes < 3) frame.request();
  }, frames.scheduler);

  frame.request();
  frames.flush();
  expect(passes).toBe(1);
  expect(frames.pending.size).toBe(1);

  frames.flush();
  frames.flush();
  expect(passes).toBe(3);
  expect(frames.pending.size).toBe(0);
});

test('cancel drops the pending frame without latching', () => {
  const frames = fakeFrames();
  const run = vi.fn();
  const frame = createFrameCoalescer(run, frames.scheduler);

  frame.request();
  frame.cancel();
  expect(frames.scheduler.cancel).toHaveBeenCalledExactlyOnceWith(1);
  frames.flush();
  expect(run).not.toHaveBeenCalled();

  frame.cancel();
  expect(frames.scheduler.cancel).toHaveBeenCalledTimes(1);

  frame.request();
  expect(frames.pending.size).toBe(1);
  frames.flush();
  expect(run).toHaveBeenCalledTimes(1);
});

test('without a scheduler the coalescer uses the browser animation frame', () => {
  const callbacks: (() => void)[] = [];
  const requestFrame = vi.fn((callback: () => void) => callbacks.push(callback) + 40);
  const cancelFrame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  try {
    const run = vi.fn();
    const frame = createFrameCoalescer(run);

    frame.request();
    frame.cancel();
    expect(cancelFrame).toHaveBeenCalledExactlyOnceWith(41);

    frame.request();
    expect(requestFrame).toHaveBeenCalledTimes(2);
    callbacks[1]?.();
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('observeSize is a no-op without ResizeObserver and otherwise observes until stopped', () => {
  const element = {} as HTMLElement;
  const onSize = vi.fn();
  vi.stubGlobal('ResizeObserver', undefined);
  try {
    const stopUnobserved = observeSize(element, onSize);
    stopUnobserved();
    expect(onSize).not.toHaveBeenCalled();

    const observers: FakeResizeObserver[] = [];
    class FakeResizeObserver {
      readonly observe = vi.fn();
      readonly disconnect = vi.fn();
      constructor(readonly notify: (entries: readonly unknown[]) => void) {
        observers.push(this);
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const stop = observeSize(element, onSize);
    const [observer] = observers;
    expect(observers).toHaveLength(1);
    expect(observer?.observe).toHaveBeenCalledExactlyOnceWith(element);

    observer?.notify([{ target: element }]);
    expect(onSize).toHaveBeenCalledExactlyOnceWith();

    stop();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
