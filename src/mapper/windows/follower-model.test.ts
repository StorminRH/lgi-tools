import { describe, expect, it, vi } from 'vitest';
import {
  NODE_CARD_FALLBACK,
  computeFollowerTransform,
  createNodeFollower,
  nearestCardPoint,
  placeAnchoredCard,
  type FollowerState,
  type FollowerWrite,
} from './follower-model';

function node(x = 10, y = 20, width = 72, height = 72) {
  return {
    measured: { width, height },
    internals: { positionAbsolute: { x, y } },
  };
}

/** A chain node before its first measurement: declared frame dims only. */
function declaredNode(x: number, y: number, width = 44, height = 44) {
  return {
    measured: {},
    internals: { positionAbsolute: { x, y } },
    width,
    height,
  };
}

function state(anchor = node()): FollowerState {
  return {
    domNode: {
      clientWidth: 800,
      clientHeight: 600,
    } as HTMLElement,
    transform: [100, 50, 2],
    nodeLookup: new Map([['2', anchor]]),
  };
}

function cardElement(size = NODE_CARD_FALLBACK): HTMLElement {
  return {
    offsetWidth: size.width,
    offsetHeight: size.height,
    style: { setProperty: vi.fn() },
  } as unknown as HTMLElement;
}

describe('placeAnchoredCard', () => {
  it('flips left when the anchor is on the right half and keeps viewport padding', () => {
    const placed = placeAnchoredCard({
      anchor: { x: 700, y: 300 },
      card: { width: 288, height: 208 },
      viewport: { width: 800, height: 600 },
    });
    expect(placed.side).toBe('left');
    expect(placed.left).toBe(700 - 40 - 288);
    expect(placed.top).toBe(300 - 208 / 2);
    expect(placed.leader).not.toBeNull();
  });

  it('flips right when the anchor is on the left half', () => {
    const placed = placeAnchoredCard({
      anchor: { x: 100, y: 300 },
      card: { width: 288, height: 208 },
      viewport: { width: 800, height: 600 },
    });
    expect(placed.side).toBe('right');
    expect(placed.left).toBe(100 + 40);
    expect(placed.top).toBe(300 - 208 / 2);
  });

  it('keeps a sticky side across the midline by pushing instead of flipping', () => {
    const card = { width: 288, height: 208 };
    const viewport = { width: 800, height: 600 };
    const first = placeAnchoredCard({
      anchor: { x: 100, y: 300 },
      card,
      viewport,
    });
    expect(first.side).toBe('right');
    expect(first.left).toBe(140);

    const pushed = placeAnchoredCard({
      anchor: { x: 700, y: 300 },
      card,
      viewport,
      side: first.side,
    });
    // Sticky right would prefer 740; clamp pushes to the padded max instead of
    // flipping to the left-of-anchor seat (700 - 40 - 288 = 372).
    expect(pushed.side).toBe('right');
    expect(pushed.left).toBe(800 - 288 - 16);
    expect(pushed.left).not.toBe(700 - 40 - 288);
  });

  it('clamps into the padded viewport instead of clipping or hugging the edge', () => {
    // Preferred left-of-anchor seat overflows a narrow viewport → pin to padding.
    const placed = placeAnchoredCard({
      anchor: { x: 300, y: 10 },
      card: { width: 288, height: 208 },
      viewport: { width: 320, height: 600 },
    });
    expect(placed.left).toBe(16);
    expect(placed.top).toBe(16);
  });

  it('omits the leader when the card rim already sits on the anchor', () => {
    const placed = placeAnchoredCard({
      anchor: { x: 200, y: 200 },
      card: { width: 100, height: 100 },
      viewport: { width: 800, height: 600 },
      gap: 0,
      leaderMinDistance: 12,
    });
    // With gap 0 and left-half preference, card starts at x=200 — rim on the anchor.
    expect(
      nearestCardPoint(placed.left, placed.top, { width: 100, height: 100 }, {
        x: 200,
        y: 200,
      }),
    ).toEqual({ x: 200, y: 200 });
    expect(placed.leader).toBeNull();
  });
});

describe('node follower model', () => {
  it('writes a viewport-aware transform on first arm and skips an identical frame', () => {
    const layer = { width: 800, height: 600 };
    const card = NODE_CARD_FALLBACK;
    // Anchor center at tx+(x+w/2)*zoom = 100+(10+36)*2 = 192, ty+(y+h/2)*zoom = 50+(20+36)*2 = 162
    const first = computeFollowerTransform(
      null,
      '2',
      [100, 50, 2],
      node(),
      true,
      card,
      layer,
    );
    expect(first?.write.transform).toBe('translate(232px, 58px)');
    expect(first?.write.leader).not.toBeNull();
    expect(
      computeFollowerTransform(
        first?.baseline ?? null,
        '2',
        [100, 50, 2],
        node(),
        true,
        card,
        layer,
      ),
    ).toBeNull();
  });

  it('writes for viewport, anchor, and retarget changes and guards unmeasured anchors', () => {
    const layer = { width: 800, height: 600 };
    const card = NODE_CARD_FALLBACK;
    const first = computeFollowerTransform(
      null,
      '2',
      [0, 0, 1],
      node(),
      true,
      card,
      layer,
    );
    expect(
      computeFollowerTransform(
        first?.baseline ?? null,
        '2',
        [1, 0, 1],
        node(),
        true,
        card,
        layer,
      ),
    ).not.toBeNull();
    expect(
      computeFollowerTransform(
        first?.baseline ?? null,
        '2',
        [0, 0, 1],
        node(11),
        true,
        card,
        layer,
      ),
    ).not.toBeNull();
    expect(
      computeFollowerTransform(
        first?.baseline ?? null,
        '3',
        [0, 0, 1],
        node(),
        true,
        card,
        layer,
      ),
    ).not.toBeNull();
    expect(
      computeFollowerTransform(null, '2', [0, 0, 1], undefined, false, card, layer),
    ).toBeNull();
  });

  it('positions from declared frame dimensions before measurement lands', () => {
    const layer = { width: 800, height: 600 };
    const card = NODE_CARD_FALLBACK;
    // Declared 120×88 frame: center (60, 44) → screen (60, 44) at identity camera.
    const first = computeFollowerTransform(
      null,
      '2',
      [0, 0, 1],
      declaredNode(0, 0, 120, 88),
      true,
      card,
      layer,
    );
    expect(first?.write.transform).toBe('translate(100px, 16px)');
    expect(first?.baseline.width).toBe(120);
    expect(first?.baseline.height).toBe(88);
  });
});

const noopSizeObserver = () => () => undefined;

function testScheduler() {
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  return {
    frames,
    scheduler: {
      schedule: (callback: () => void) => {
        const id = nextFrame;
        nextFrame += 1;
        frames.set(id, callback);
        return id;
      },
      cancel: (id: number) => {
        frames.delete(id);
      },
    },
  };
}

describe('node follower store lifecycle', () => {
  it('arms immediately, coalesces updates, and stops after dispose', () => {
    let current = state();
    const listeners = new Set<(next: FollowerState, previous: FollowerState) => void>();
    const { frames, scheduler } = testScheduler();
    const write = vi.fn<(payload: FollowerWrite) => void>();
    const dispose = createNodeFollower(
      {
        getState: () => current,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      '2',
      cardElement(),
      write,
      scheduler,
      noopSizeObserver,
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
