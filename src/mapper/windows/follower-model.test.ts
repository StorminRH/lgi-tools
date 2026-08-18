import { describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_DISC_SIZE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
} from '../canvas/SystemNode';
import {
  CARD_ANCHOR_GAP,
  NODE_CARD_FALLBACK,
  computeFollowerTransform,
  createNodeFollower,
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
  it('flips around the disc, sticks across the midline, and clamps into the padded viewport', () => {
    const card = { width: 288, height: 208 };
    const viewport = { width: 800, height: 600 };

    const left = placeAnchoredCard({
      anchor: { x: 700, y: 300 },
      card,
      viewport,
    });
    expect(left.side).toBe('left');
    expect(left.left).toBe(700 - 40 - 288);
    expect(left.top).toBe(300 - 208 / 2);
    expect(left.lift).toBe('up');
    expect(left.leader).toEqual({
      x1: 700 - 40,
      y1: 300 - 40,
      x2: 700,
      y2: 300,
    });

    const right = placeAnchoredCard({
      anchor: { x: 100, y: 300 },
      card,
      viewport,
    });
    expect(right.side).toBe('right');
    expect(right.left).toBe(100 + 40);
    expect(right.top).toBe(300 - 208 / 2);
    expect(right.lift).toBe('up');
    expect(right.leader).toEqual({
      x1: 100 + 40,
      y1: 300 - 40,
      x2: 100,
      y2: 300,
    });

    const pushed = placeAnchoredCard({
      anchor: { x: 700, y: 300 },
      card,
      viewport,
      side: right.side,
    });
    // Sticky right would prefer 740; clamp pushes to the padded max instead of
    // flipping to the left-of-anchor seat (700 - 40 - 288 = 372).
    expect(pushed.side).toBe('right');
    expect(pushed.left).toBe(800 - 288 - 16);
    expect(pushed.left).not.toBe(700 - 40 - 288);

    // Preferred left-of-anchor seat overflows a narrow viewport → pin to padding.
    const clamped = placeAnchoredCard({
      anchor: { x: 300, y: 10 },
      card,
      viewport: { width: 320, height: 600 },
    });
    expect(clamped.left).toBe(16);
    expect(clamped.top).toBe(16);
  });

  it('clips the 45° leader to the disc rim, omits it when covered, and keeps it at max zoom', () => {
    expect(
      placeAnchoredCard({
        anchor: { x: 200, y: 200 },
        card: { width: 100, height: 100 },
        viewport: { width: 800, height: 600 },
        gap: 0,
        discRadius: 80,
        leaderMinDistance: 12,
      }).leader,
    ).toBeNull();

    const discRadius = 27.5;
    const placed = placeAnchoredCard({
      anchor: { x: 100, y: 300 },
      card: { width: 288, height: 208 },
      viewport: { width: 800, height: 600 },
      discRadius,
    });
    const clearance = discRadius + CARD_ANCHOR_GAP;
    expect(placed.side).toBe('right');
    expect(placed.left).toBe(100 + clearance);
    expect(placed.lift).toBe('up');
    const hitX = 100 + clearance;
    const hitY = 300 - clearance;
    const dist = Math.hypot(clearance, clearance);
    expect(placed.leader).toEqual({
      x1: hitX,
      y1: hitY,
      x2: expect.closeTo(100 + clearance * (discRadius / dist), 10),
      y2: expect.closeTo(300 - clearance * (discRadius / dist), 10),
    });

    const zoomed = placeAnchoredCard({
      anchor: { x: 400, y: 400 },
      card: { width: 288, height: 208 },
      viewport: { width: 1440, height: 900 },
      discRadius: 27.5 * 2.5,
    });
    expect(zoomed.leader).not.toBeNull();
    if (zoomed.leader === null) {
      throw new Error('expected a leader line at maximum zoom');
    }
    expect(Math.abs(zoomed.leader.x1 - zoomed.leader.x2)).toBeCloseTo(
      Math.abs(zoomed.leader.y1 - zoomed.leader.y2),
    );
  });
});

describe('node follower model', () => {
  it('writes a viewport-aware transform on first arm and skips an identical frame', () => {
    const layer = { width: 800, height: 600 };
    const card = NODE_CARD_FALLBACK;
    // Anchor center at tx+(x+w/2)*zoom = 100+(10+36)*2 = 192, ty+(y+h/2)*zoom = 50+(20+36)*2 = 162
    // Card sits past the zoomed disc rim: 192 + 27.5*2 + 40 = 287.
    const first = computeFollowerTransform(
      null,
      '2',
      [100, 50, 2],
      node(),
      true,
      card,
      layer,
    );
    expect(first?.write.transform).toBe(
      `translate(${192 + (SYSTEM_DISC_SIZE / 2) * 2 + CARD_ANCHOR_GAP}px, 58px)`,
    );
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
    // Declared widget frame: center sits at half the frame; identity camera.
    const first = computeFollowerTransform(
      null,
      '2',
      [0, 0, 1],
      declaredNode(0, 0, SYSTEM_FRAME_WIDTH, SYSTEM_FRAME_HEIGHT),
      true,
      card,
      layer,
    );
    expect(first?.write.transform).toBe(
      `translate(${SYSTEM_FRAME_WIDTH / 2 + SYSTEM_DISC_SIZE / 2 + CARD_ANCHOR_GAP}px, 16px)`,
    );
    expect(first?.baseline.width).toBe(SYSTEM_FRAME_WIDTH);
    expect(first?.baseline.height).toBe(SYSTEM_FRAME_HEIGHT);
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
