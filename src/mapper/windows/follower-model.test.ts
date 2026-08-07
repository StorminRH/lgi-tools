import { describe, expect, it, vi } from 'vitest';
import {
  EDGE_CARD_FALLBACK,
  NODE_CARD_FALLBACK,
  computeEdgeFollowerTransform,
  computeFollowerTransform,
  createEdgeFollower,
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

describe('edge follower model', () => {
  it('writes a viewport-aware midpoint transform and skips an identical frame', () => {
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
      EDGE_CARD_FALLBACK,
      { width: 800, height: 600 },
    );
    // Anchor on left half → card to the right at x=72+40, vertically centered.
    expect(first?.write.transform).toBe('translate(112px, 16px)');
    expect(first?.write.leader).not.toBeNull();
    expect(first?.baseline.side).toBe('right');
    expect(
      computeEdgeFollowerTransform(
        first?.baseline ?? null,
        '1',
        '2',
        [0, 0, 1],
        from,
        to,
        EDGE_CARD_FALLBACK,
        { width: 800, height: 600 },
      ),
    ).toBeNull();
  });

  it('keeps sticky side when a pan would otherwise flip across the midline', () => {
    const from = node(0, 0, 44, 44);
    const to = node(100, 0, 44, 44);
    const layer = { width: 800, height: 600 };
    const first = computeEdgeFollowerTransform(
      null,
      '1',
      '2',
      [0, 0, 1],
      from,
      to,
      EDGE_CARD_FALLBACK,
      layer,
    );
    expect(first?.baseline.side).toBe('right');
    // Midpoint was 72; pan so screen mid sits on the right half (tx + 72 = 700).
    const panned = computeEdgeFollowerTransform(
      first?.baseline ?? null,
      '1',
      '2',
      [628, 0, 1],
      from,
      to,
      EDGE_CARD_FALLBACK,
      layer,
    );
    expect(panned?.baseline.side).toBe('right');
    // Preferred seat 700+40=740 clamps to padded max rather than left-of-anchor.
    expect(panned?.write.transform).toBe(
      `translate(${800 - 288 - 16}px, 16px)`,
    );
  });

  it('positions from declared frame dimensions before measurement lands', () => {
    // Same geometry as the measured case: centers (22, 22) and (122, 22).
    const first = computeEdgeFollowerTransform(
      null,
      '1',
      '2',
      [0, 0, 1],
      declaredNode(0, 0),
      declaredNode(100, 0),
      EDGE_CARD_FALLBACK,
      { width: 800, height: 600 },
    );
    expect(first?.write.transform).toBe('translate(112px, 16px)');
  });

  it('guards unmeasured endpoints and rewrites on viewport change', () => {
    const from = node(0, 0, 44, 44);
    const to = node(100, 0, 44, 44);
    const layer = { width: 800, height: 600 };
    expect(
      computeEdgeFollowerTransform(
        null,
        '1',
        '2',
        [0, 0, 1],
        undefined,
        to,
        EDGE_CARD_FALLBACK,
        layer,
      ),
    ).toBeNull();
    const first = computeEdgeFollowerTransform(
      null,
      '1',
      '2',
      [0, 0, 1],
      from,
      to,
      EDGE_CARD_FALLBACK,
      layer,
    );
    expect(
      computeEdgeFollowerTransform(
        first?.baseline ?? null,
        '1',
        '2',
        [10, 0, 1],
        from,
        to,
        EDGE_CARD_FALLBACK,
        layer,
      ),
    ).not.toBeNull();
  });

  it('arms immediately and stops after dispose', () => {
    const current: FollowerState = {
      domNode: { clientWidth: 800, clientHeight: 600 } as HTMLElement,
      transform: [0, 0, 1],
      nodeLookup: new Map([
        ['1', node(0, 0, 44, 44)],
        ['2', node(100, 0, 44, 44)],
      ]),
    };
    const listeners = new Set<(next: FollowerState, previous: FollowerState) => void>();
    const { scheduler } = testScheduler();
    const write = vi.fn<(payload: FollowerWrite) => void>();
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
      cardElement(EDGE_CARD_FALLBACK),
      write,
      scheduler,
      noopSizeObserver,
    );

    expect(write).toHaveBeenCalledTimes(1);
    dispose();
    expect(listeners.size).toBe(0);
  });

  it('reclamps when the card grows after arm without a viewport change', () => {
    // Midpoint near the bottom so a taller card must lift to stay padded.
    const current: FollowerState = {
      domNode: { clientWidth: 800, clientHeight: 600 } as HTMLElement,
      transform: [0, 0, 1],
      nodeLookup: new Map([
        ['1', node(0, 500, 44, 44)],
        ['2', node(100, 500, 44, 44)],
      ]),
    };
    let height = 200;
    const card = {
      get offsetWidth() {
        return 288;
      },
      get offsetHeight() {
        return height;
      },
      style: { setProperty: vi.fn() },
    } as unknown as HTMLElement;
    // Boxed so tsc tracks the SizeObserver arming (closure assigns do not narrow).
    const sizeArm: { current: (() => void) | null } = { current: null };
    const write = vi.fn<(payload: FollowerWrite) => void>();
    const { scheduler } = testScheduler();
    createEdgeFollower(
      {
        getState: () => current,
        subscribe: () => () => undefined,
      },
      '1',
      '2',
      card,
      write,
      scheduler,
      (_element, callback) => {
        sizeArm.current = callback;
        return () => {
          sizeArm.current = null;
        };
      },
    );

    expect(write).toHaveBeenCalledTimes(1);
    const first = write.mock.calls[0]?.[0]?.transform;
    height = 400;
    const onSize = sizeArm.current;
    if (onSize === null) {
      throw new Error('expected size observer to arm');
    }
    onSize();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]?.[0]?.transform).not.toBe(first);
    // Tall card near the bottom edge must pin to the padded max top.
    expect(write.mock.calls[1]?.[0]?.transform).toBe(
      `translate(112px, ${600 - 400 - 16}px)`,
    );
  });
});
