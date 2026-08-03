import { describe, expect, it, vi } from 'vitest';
import {
  computeFollowerTransform,
  createNodeFollower,
  type FollowerState,
} from './follower-model';

function node(x = 10, y = 20, width = 72, height = 72) {
  return {
    measured: { width, height },
    internals: { positionAbsolute: { x, y } },
  };
}

function state(anchor = node()): FollowerState {
  return {
    domNode: {} as HTMLElement,
    transform: [100, 50, 2],
    nodeLookup: new Map([['2', anchor]]),
  };
}

describe('node follower model', () => {
  it('writes on first arm and skips an identical frame', () => {
    const first = computeFollowerTransform(null, '2', [100, 50, 2], node(), true);
    expect(first?.transform).toBe('translate(276px, 90px)');
    expect(
      computeFollowerTransform(first?.baseline ?? null, '2', [100, 50, 2], node(), true),
    ).toBeNull();
  });

  it('writes for viewport, anchor, and retarget changes and guards unmeasured anchors', () => {
    const first = computeFollowerTransform(null, '2', [0, 0, 1], node(), true);
    expect(
      computeFollowerTransform(first?.baseline ?? null, '2', [1, 0, 1], node(), true),
    ).not.toBeNull();
    expect(
      computeFollowerTransform(first?.baseline ?? null, '2', [0, 0, 1], node(11), true),
    ).not.toBeNull();
    expect(
      computeFollowerTransform(first?.baseline ?? null, '3', [0, 0, 1], node(), true),
    ).not.toBeNull();
    expect(computeFollowerTransform(null, '2', [0, 0, 1], undefined, false)).toBeNull();
  });
});

describe('node follower store lifecycle', () => {
  it('arms immediately, coalesces updates, and stops after dispose', () => {
    let current = state();
    const listeners = new Set<(next: FollowerState, previous: FollowerState) => void>();
    const frames = new Map<number, () => void>();
    let nextFrame = 1;
    const write = vi.fn();
    const dispose = createNodeFollower(
      {
        getState: () => current,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      '2',
      write,
      {
        schedule: (callback) => {
          const id = nextFrame;
          nextFrame += 1;
          frames.set(id, callback);
          return id;
        },
        cancel: (id) => {
          frames.delete(id);
        },
      },
    );

    expect(write).toHaveBeenCalledTimes(1);
    const previous = current;
    current = { ...current, transform: [110, 50, 2] };
    for (const listener of listeners) listener(current, previous);
    for (const callback of [...frames.values()]) callback();
    frames.clear();
    expect(write).toHaveBeenCalledTimes(2);

    dispose();
    const beforeDisposedUpdate = current;
    current = { ...current, transform: [120, 50, 2] };
    for (const listener of listeners) listener(current, beforeDisposedUpdate);
    expect(write).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(0);
  });
});
