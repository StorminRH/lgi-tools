import { describe, expect, it } from 'vitest';
import type { ChainNode } from '../canvas/SystemNode';
import type { ChainEdge } from '../chain/nodes';
import { DEFAULT_MOTION_CONFIG } from '../motion/motion-contract';
import {
  advanceFogFrame,
  advanceFogTimeline,
  advanceFogWake,
  DEFAULT_FOG_CONFIG,
  deriveFogReveals,
  EMPTY_FOG_FRAME_STATE,
  EMPTY_FOG_TIMELINE,
  EMPTY_FOG_WAKE,
  FOG_WAKE_SPACING,
  fogTimingOf,
  snapFogFrame,
  type FogRevealSet,
} from './fog-model';

/** A presentation node at a frame top-left, with the declared 120×88 frame. */
function node(
  id: number,
  x: number,
  y: number,
  extra: Partial<ChainNode['data']> = {},
): ChainNode {
  return {
    id: String(id),
    type: 'chainSystem',
    width: 120,
    height: 88,
    position: { x, y },
    data: { name: `S${id}`, className: null, ...extra },
  };
}

function edge(id: string, source: number, target: number, data: Partial<ChainEdge['data']> = {}): ChainEdge {
  return {
    id,
    source: String(source),
    target: String(target),
    data: { loop: false, ...data },
  };
}

const TIMING = fogTimingOf(DEFAULT_MOTION_CONFIG, false);
const REDUCED = fogTimingOf(DEFAULT_MOTION_CONFIG, true);

// ── Reveal membership (SC-3.2's exclusion rules as units) ────────────────────
describe('deriveFogReveals', () => {
  it('reveals a disc per rendered node at its frame center, ghosts included', () => {
    const reveals = deriveFogReveals(
      [
        node(1, 0, 0),
        node(2, 200, 100, { motion: { phase: 'departing', heavy: true } }),
      ],
      [],
    );

    expect(reveals.discs).toEqual([
      { key: 'd:1', x: 60, y: 44, phase: 'steady', heavy: false },
      { key: 'd:2', x: 260, y: 144, phase: 'departing', heavy: true },
    ]);
  });

  it('excludes fogged-ring discs — their cover IS the missing reveal', () => {
    const reveals = deriveFogReveals(
      [
        node(1, 0, 0, { halo: { ring: 1, fogged: false } }),
        node(2, 200, 0, { halo: { ring: 3, fogged: true } }),
      ],
      [],
    );

    expect(reveals.discs.map((disc) => disc.key)).toEqual(['d:1']);
  });

  it('strokes only edges with both endpoints revealed', () => {
    const reveals = deriveFogReveals(
      [
        node(1, 0, 0),
        node(2, 200, 0),
        node(3, 400, 0, { halo: { ring: 3, fogged: true } }),
      ],
      [
        edge('a', 1, 2),
        edge('halo:2>3', 2, 3, { halo: true }),
        edge('b', 1, 9),
      ],
    );

    expect(reveals.strokes.map((stroke) => stroke.key)).toEqual(['s:a']);
    expect(reveals.strokes[0]).toMatchObject({ x1: 60, y1: 44, x2: 260, y2: 44 });
  });

  it('carries edge motion into the stroke phase', () => {
    const reveals = deriveFogReveals(
      [node(1, 0, 0), node(2, 200, 0)],
      [
        edge('a', 1, 2, {
          motion: { phase: 'departing', flavor: 'fade', reverse: false, heavy: true },
        }),
      ],
    );

    expect(reveals.strokes[0]).toMatchObject({ phase: 'departing', heavy: true });
  });
});

// ── Timeline: open/close windows on the motion tempo ─────────────────────────
describe('advanceFogTimeline', () => {
  const steadySet = (): FogRevealSet =>
    deriveFogReveals([node(1, 0, 0), node(2, 200, 0)], [edge('a', 1, 2)]);

  it('snaps the first observed batch open with nothing animating', () => {
    const frame = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 1000, TIMING);

    expect(frame.animating).toBe(false);
    expect(frame.discs.map((disc) => disc.strength)).toEqual([1, 1]);
    expect(frame.strokes.map((stroke) => stroke.strength)).toEqual([1]);
  });

  it('opens a later-arriving reveal over the mid window, then settles', () => {
    const first = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, TIMING);
    const grown = deriveFogReveals(
      [node(1, 0, 0), node(2, 200, 0), node(3, 0, 200)],
      [edge('a', 1, 2)],
    );

    const start = advanceFogTimeline(first.timeline, grown, 1000, TIMING);
    const newDisc = (frame: typeof start) =>
      frame.discs.find((disc) => disc.key === 'd:3');
    expect(start.animating).toBe(true);
    expect(newDisc(start)).toBeUndefined(); // strength 0 stamps nothing yet

    const mid = advanceFogTimeline(start.timeline, grown, 1500, TIMING);
    const midStrength = newDisc(mid)?.strength ?? 0;
    expect(midStrength).toBeGreaterThan(0);
    expect(midStrength).toBeLessThan(1);

    const done = advanceFogTimeline(mid.timeline, grown, 2100, TIMING);
    expect(newDisc(done)?.strength).toBe(1);
    expect(done.animating).toBe(false);
  });

  it('closes a departing reveal over its window — heavy takes the slow tier', () => {
    // Distinct tiers so the window difference is observable (defaults tie them).
    const timing = fogTimingOf(
      { ...DEFAULT_MOTION_CONFIG, tempo: { fast: 250, mid: 400, slow: 1200 } },
      false,
    );
    const first = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, timing);
    const departing = deriveFogReveals(
      [
        node(1, 0, 0, { motion: { phase: 'departing' } }),
        node(2, 200, 0, { motion: { phase: 'departing', heavy: true } }),
      ],
      [],
    );

    const closing = advanceFogTimeline(first.timeline, departing, 0, timing);
    // Past the ordinary window (400ms), inside the heavy one (1200ms).
    const late = advanceFogTimeline(closing.timeline, departing, 600, timing);
    expect(late.discs.find((disc) => disc.key === 'd:1')).toBeUndefined();
    const heavy = late.discs.find((disc) => disc.key === 'd:2');
    expect(heavy).toBeDefined();
    expect(heavy?.strength).toBeGreaterThan(0);
    expect(heavy?.strength).toBeLessThan(1);
    expect(late.animating).toBe(true);
  });

  it('closes a vanished reveal in place from its last geometry, then drops it', () => {
    const first = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, TIMING);

    const gone = advanceFogTimeline(
      first.timeline,
      deriveFogReveals([node(1, 0, 0)], []),
      100,
      TIMING,
    );
    // The close's first frame still stamps at full strength, in place.
    expect(gone.discs.find((disc) => disc.key === 'd:2')?.strength).toBe(1);
    expect(gone.animating).toBe(true);

    const midway = advanceFogTimeline(
      gone.timeline,
      deriveFogReveals([node(1, 0, 0)], []),
      600,
      TIMING,
    );
    const fading = midway.discs.find((disc) => disc.key === 'd:2');
    expect(fading).toBeDefined();
    expect(fading?.x).toBe(260);
    expect(fading?.strength).toBeLessThan(1);

    const settled = advanceFogTimeline(
      midway.timeline,
      deriveFogReveals([node(1, 0, 0)], []),
      1300,
      TIMING,
    );
    expect(settled.discs.find((disc) => disc.key === 'd:2')).toBeUndefined();
    expect(settled.animating).toBe(false);
  });

  it('reopens from the current strength when a departure is superseded', () => {
    const first = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, TIMING);
    const departing = deriveFogReveals(
      [node(1, 0, 0), node(2, 200, 0, { motion: { phase: 'departing' } })],
      [],
    );
    const closing = advanceFogTimeline(first.timeline, departing, 0, TIMING);

    // Mid-close (partially faded), the departure is superseded: the reveal
    // ramps back up from where it stands — no pop to 0 or 1.
    const reopened = advanceFogTimeline(
      closing.timeline,
      deriveFogReveals([node(1, 0, 0), node(2, 200, 0)], []),
      400,
      TIMING,
    );
    const strength = reopened.discs.find((disc) => disc.key === 'd:2')?.strength ?? 0;
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThan(1);
    expect(reopened.animating).toBe(true);

    const settled = advanceFogTimeline(
      reopened.timeline,
      deriveFogReveals([node(1, 0, 0), node(2, 200, 0)], []),
      1500,
      TIMING,
    );
    expect(settled.discs.find((disc) => disc.key === 'd:2')?.strength).toBe(1);
  });

  it('uses linear easing under reduced motion', () => {
    expect(REDUCED.ease(0.25)).toBe(0.25);
    expect(REDUCED.ease(0.5)).toBe(0.5);
    // The dynamic ease is the settle spring, which front-loads progress.
    expect(TIMING.ease(0.5)).toBeGreaterThan(0.5);
  });
});

describe('snapFogFrame', () => {
  it('stamps everything at full strength, omits departures, never animates', () => {
    const reveals = deriveFogReveals(
      [node(1, 0, 0), node(2, 200, 0, { motion: { phase: 'departing' } })],
      [edge('a', 1, 2)],
    );
    const frame = snapFogFrame(reveals, 42);

    expect(frame.animating).toBe(false);
    expect(frame.discs).toEqual([
      { key: 'd:1', x: 60, y: 44, strength: 1 },
    ]);
    // The stroke's departing endpoint is gone from the frame, but membership
    // rules already ran at derive time; the snap keeps whatever it was given.
    expect(frame.strokes.map((stroke) => stroke.strength)).toEqual([1]);
  });
});

// ── Wake: fading stamps along a moving disc's path ───────────────────────────
describe('advanceFogWake', () => {
  const disc = (x: number, y: number) => ({ key: 'd:1', x, y, strength: 1 });

  it('drops spaced stamps along a movement and fades them out', () => {
    const seeded = advanceFogWake(EMPTY_FOG_WAKE, [disc(0, 0)], 0, 500);
    expect(seeded.stamps).toEqual([]);
    expect(seeded.animating).toBe(false);

    const moved = advanceFogWake(
      seeded.state,
      [disc(FOG_WAKE_SPACING * 3, 0)],
      16,
      500,
    );
    expect(moved.stamps.length).toBe(3);
    expect(moved.stamps.every((stamp) => stamp.key === 'w:d:1')).toBe(true);
    expect(moved.animating).toBe(true);

    const faded = advanceFogWake(moved.state, [disc(FOG_WAKE_SPACING * 3, 0)], 300, 500);
    expect(faded.stamps.length).toBe(3);
    for (const stamp of faded.stamps) {
      expect(stamp.strength).toBeLessThan(0.5);
    }

    const expired = advanceFogWake(faded.state, [disc(FOG_WAKE_SPACING * 3, 0)], 600, 500);
    expect(expired.stamps).toEqual([]);
    expect(expired.animating).toBe(false);
  });

  it('fades out the trail of a disc that vanished', () => {
    const seeded = advanceFogWake(EMPTY_FOG_WAKE, [disc(0, 0)], 0, 500);
    const moved = advanceFogWake(seeded.state, [disc(FOG_WAKE_SPACING, 0)], 10, 500);
    expect(moved.stamps.length).toBe(1);

    const orphaned = advanceFogWake(moved.state, [], 200, 500);
    expect(orphaned.stamps.length).toBe(1);
    expect(orphaned.animating).toBe(true);

    const drained = advanceFogWake(orphaned.state, [], 600, 500);
    expect(drained.stamps).toEqual([]);
    expect(drained.state.size).toBe(0);
    expect(drained.animating).toBe(false);
  });

  it('produces nothing for a stationary disc', () => {
    const seeded = advanceFogWake(EMPTY_FOG_WAKE, [disc(50, 50)], 0, 500);
    const still = advanceFogWake(seeded.state, [disc(50, 50)], 100, 500);
    expect(still.stamps).toEqual([]);
    expect(still.animating).toBe(false);
  });
});

// ── The one-call frame advance the host runs ─────────────────────────────────
describe('advanceFogFrame', () => {
  const reveals = () => deriveFogReveals([node(1, 0, 0), node(2, 300, 0)], []);

  it('runs the timeline and wake on the dynamic tier', () => {
    const first = advanceFogFrame(
      EMPTY_FOG_FRAME_STATE,
      reveals(),
      DEFAULT_FOG_CONFIG,
      DEFAULT_MOTION_CONFIG,
      false,
      0,
    );
    expect(first.animating).toBe(false);
    expect(first.alphaOnly).toBe(false);
    expect(first.state.timeline.size).toBe(2);

    // A moved disc drops wake stamps and keeps the loop alive.
    const moved = advanceFogFrame(
      first.state,
      deriveFogReveals([node(1, 200, 0), node(2, 300, 0)], []),
      DEFAULT_FOG_CONFIG,
      DEFAULT_MOTION_CONFIG,
      false,
      16,
    );
    expect(moved.wakeStamps.length).toBeGreaterThan(0);
    expect(moved.animating).toBe(true);
  });

  it('suppresses the wake under reduced motion and reports alpha-only', () => {
    const first = advanceFogFrame(
      EMPTY_FOG_FRAME_STATE,
      reveals(),
      DEFAULT_FOG_CONFIG,
      DEFAULT_MOTION_CONFIG,
      true,
      0,
    );
    const moved = advanceFogFrame(
      first.state,
      deriveFogReveals([node(1, 200, 0), node(2, 300, 0)], []),
      DEFAULT_FOG_CONFIG,
      DEFAULT_MOTION_CONFIG,
      true,
      16,
    );
    expect(moved.wakeStamps).toEqual([]);
    expect(moved.alphaOnly).toBe(true);
  });

  it('snaps and never animates on the static tier', () => {
    const frame = advanceFogFrame(
      EMPTY_FOG_FRAME_STATE,
      deriveFogReveals(
        [node(1, 0, 0), node(2, 300, 0, { motion: { phase: 'departing' } })],
        [],
      ),
      { ...DEFAULT_FOG_CONFIG, tier: 'static' },
      DEFAULT_MOTION_CONFIG,
      false,
      0,
    );
    expect(frame.animating).toBe(false);
    expect(frame.frame.discs.map((disc) => disc.key)).toEqual(['d:1']);
    expect(frame.wakeStamps).toEqual([]);
  });
});
