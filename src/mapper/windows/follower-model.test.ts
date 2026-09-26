import { describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_DISC_SIZE,
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
} from '../canvas/SystemNode';
import {
  CARD_ANCHOR_GAP,
  CARD_ANCHOR_RISE,
  CARD_ATTACH_Y,
  NODE_CARD_FALLBACK,
  anchoredLeader,
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
    expect(left.left).toBe(700 - CARD_ANCHOR_GAP - 288);
    expect(left.top).toBe(300 - CARD_ANCHOR_RISE - CARD_ATTACH_Y);
    expect(left.lift).toBe('up');

    const right = placeAnchoredCard({
      anchor: { x: 100, y: 300 },
      card,
      viewport,
    });
    expect(right.side).toBe('right');
    expect(right.left).toBe(100 + CARD_ANCHOR_GAP);
    expect(right.top).toBe(300 - CARD_ANCHOR_RISE - CARD_ATTACH_Y);
    expect(right.lift).toBe('up');

    const pushed = placeAnchoredCard({
      anchor: { x: 700, y: 300 },
      card,
      viewport,
      side: right.side,
    });
    expect(pushed.side).toBe('right');
    expect(pushed.left).toBe(800 - 288 - 16);
    expect(pushed.leader).toBeNull();

    const low = placeAnchoredCard({
      anchor: { x: 100, y: 40 },
      card,
      viewport,
    });
    expect(low.lift).toBe('down');
    expect(low.top).toBe(40 + CARD_ANCHOR_RISE - CARD_ATTACH_Y);

    // A remembered lift gives way once the disc is panned against that edge.
    const panned = placeAnchoredCard({ anchor: { x: 100, y: 40 }, card, viewport, lift: 'up' });
    expect(panned.lift).toBe('down');
    const kept = placeAnchoredCard({ anchor: { x: 100, y: 300 }, card, viewport, lift: 'down' });
    expect(kept.lift).toBe('down');

    const clamped = placeAnchoredCard({
      anchor: { x: 300, y: 10 },
      card,
      viewport: { width: 320, height: 600 },
    });
    expect(clamped.left).toBe(16);
    expect(clamped.top).toBe(10 + CARD_ANCHOR_RISE - CARD_ATTACH_Y);
  });

  it('runs the callout off the rim at 45° into the card header and drops it when covered', () => {
    expect(
      placeAnchoredCard({
        anchor: { x: 200, y: 200 },
        card: { width: 100, height: 100 },
        viewport: { width: 800, height: 600 },
        gap: 0,
        discRadius: 80,
      }).leader,
    ).toBeNull();

    const discRadius = 27.5;
    const placed = placeAnchoredCard({
      anchor: { x: 100, y: 300 },
      card: { width: 288, height: 208 },
      viewport: { width: 800, height: 600 },
      discRadius,
    });
    const rise = Math.max(CARD_ANCHOR_RISE, discRadius + 12);
    expect(placed.left).toBe(100 + discRadius + CARD_ANCHOR_GAP);
    expect(placed.top).toBe(300 - rise - CARD_ATTACH_Y);
    const leader = placed.leader;
    if (leader === null) throw new Error('expected a leader');
    expect(leader.end).toEqual({ x: placed.left, y: placed.top + CARD_ATTACH_Y });
    expect(Math.hypot(leader.start.x - 100, leader.start.y - 300)).toBeCloseTo(discRadius);
    expect(leader.start.x - 100).toBeCloseTo(300 - leader.start.y);
    expect(leader.d.startsWith('M ')).toBe(true);
    expect(leader.d).toContain(' Q ');

    const level = anchoredLeader({
      anchor: { x: 100, y: 300 },
      attach: { x: 200, y: 300 },
      side: 'right',
      discRadius,
    });
    expect(level?.start).toEqual({ x: 100 + discRadius, y: 300 });
    expect(level?.d).not.toContain(' Q ');

    const zoomed = placeAnchoredCard({
      anchor: { x: 400, y: 400 },
      card: { width: 288, height: 208 },
      viewport: { width: 1440, height: 900 },
      discRadius: 27.5 * 2.5,
    });
    expect(zoomed.leader).not.toBeNull();
    expect(zoomed.leader?.d).toContain(' Q ');
  });
});

describe('node follower model', () => {
  it('writes a viewport-aware transform on first arm and skips an identical frame', () => {
    const layer = { width: 800, height: 600 };
    const card = NODE_CARD_FALLBACK;
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
      `translate(${192 + (SYSTEM_DISC_SIZE / 2) * 2 + CARD_ANCHOR_GAP}px, ${162 - ((SYSTEM_DISC_SIZE / 2) * 2 + 12) - CARD_ATTACH_Y}px)`,
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
    const first = computeFollowerTransform(
      null,
      '2',
      [0, 0, 1],
      declaredNode(0, 0, SYSTEM_FRAME_WIDTH, SYSTEM_FRAME_HEIGHT),
      true,
      card,
      layer,
    );
    // Too close to the top to lift, so the card drops below the disc.
    const rise = Math.max(CARD_ANCHOR_RISE, SYSTEM_DISC_SIZE / 2 + 12);
    expect(first?.write.transform).toBe(
      `translate(${SYSTEM_FRAME_WIDTH / 2 + SYSTEM_DISC_SIZE / 2 + CARD_ANCHOR_GAP}px, ${SYSTEM_FRAME_HEIGHT / 2 + rise - CARD_ATTACH_Y}px)`,
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
