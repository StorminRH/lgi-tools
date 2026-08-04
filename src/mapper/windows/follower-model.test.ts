import { describe, expect, it, vi } from 'vitest';
import {
  computeEdgeFollowerTransform,
  computeFollowerTransform,
  createEdgeFollower,
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

describe('edge follower model', () => {
  it('writes the midpoint transform and skips an identical frame', () => {
    const from = node(0, 0, 44, 44);
    const to = node(100, 0, 44, 44);
    // Centers at (22, 22) and (122, 22); midpoint (72, 22); viewport [0,0,1].
    const first = computeEdgeFollowerTransform(
      null,
      '1',
      '2',
      [0, 0, 1],
      from,
      to,
      22,
    );
    expect(first?.transform).toBe(
      'translate(calc(72px - 50%), calc(14px - 100%))',
    );
    expect(
      computeEdgeFollowerTransform(
        first?.baseline ?? null,
        '1',
        '2',
        [0, 0, 1],
        from,
        to,
        22,
      ),
    ).toBeNull();
  });

  it('guards unmeasured endpoints and rewrites on viewport change', () => {
    const from = node(0, 0, 44, 44);
    const to = node(100, 0, 44, 44);
    expect(
      computeEdgeFollowerTransform(null, '1', '2', [0, 0, 1], undefined, to, 22),
    ).toBeNull();
    const first = computeEdgeFollowerTransform(
      null,
      '1',
      '2',
      [0, 0, 1],
      from,
      to,
      22,
    );
    expect(
      computeEdgeFollowerTransform(
        first?.baseline ?? null,
        '1',
        '2',
        [10, 0, 1],
        from,
        to,
        22,
      ),
    ).not.toBeNull();
  });

  it('arms immediately and stops after dispose', () => {
    const current: FollowerState = {
      domNode: {} as HTMLElement,
      transform: [0, 0, 1],
      nodeLookup: new Map([
        ['1', node(0, 0, 44, 44)],
        ['2', node(100, 0, 44, 44)],
      ]),
    };
    const listeners = new Set<(next: FollowerState, previous: FollowerState) => void>();
    const frames = new Map<number, () => void>();
    let nextFrame = 1;
    const write = vi.fn();
    const dispose = createEdgeFollower(
      {
        getState: () => current,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      '1',
      '2',
      22,
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
    dispose();
    expect(listeners.size).toBe(0);
  });
});
