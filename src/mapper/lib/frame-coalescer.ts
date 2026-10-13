/** Schedules and cancels one animation frame; tests inject a fake. */
export interface FrameScheduler {
  readonly schedule: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

export const BROWSER_FRAME_SCHEDULER: FrameScheduler = {
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Closures, no `this`, so `request` can be handed straight to a listener. */
export interface FrameCoalescer {
  /** Runs once on the next frame, however many times it is called before then. */
  readonly request: () => void;
  /** Drops a pending frame. It does not latch: a later request schedules again. */
  readonly cancel: () => void;
}

/**
 * Folds bursts of requests into one `run` per frame. The pending handle is
 * cleared before `run`, so `run` may request the next frame itself.
 */
export function createFrameCoalescer(
  run: () => void,
  frames: FrameScheduler = BROWSER_FRAME_SCHEDULER,
): FrameCoalescer {
  let handle: number | null = null;
  return {
    request: () => {
      if (handle !== null) return;
      handle = frames.schedule(() => {
        handle = null;
        run();
      });
    },
    cancel: () => {
      if (handle === null) return;
      frames.cancel(handle);
      handle = null;
    },
  };
}

export type SizeObserver = (
  element: HTMLElement,
  onSize: () => void,
) => () => void;

/** Calls `onSize` when `element` resizes; a no-op where ResizeObserver is missing. */
export const observeSize: SizeObserver = (element, onSize) => {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  const observer = new ResizeObserver(() => onSize());
  observer.observe(element);
  return () => observer.disconnect();
};
