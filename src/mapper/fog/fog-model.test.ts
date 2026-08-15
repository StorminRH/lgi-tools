import { expect, test } from 'vitest';
import {
  SYSTEM_FRAME_HEIGHT,
  SYSTEM_FRAME_WIDTH,
  type ChainNode,
} from '../canvas/SystemNode';
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

/** A presentation node at a frame top-left, with the declared widget frame. */
function node(
  id: number,
  x: number,
  y: number,
  extra: Partial<ChainNode['data']> = {},
): ChainNode {
  return {
    id: String(id),
    type: 'chainSystem',
    width: SYSTEM_FRAME_WIDTH,
    height: SYSTEM_FRAME_HEIGHT,
    position: { x, y },
    data: { name: `S${id}`, className: null, ...extra },
  };
}

function edge(
  id: string,
  source: number,
  target: number,
  data: Partial<ChainEdge['data']> = {},
): ChainEdge {
  return {
    id,
    source: String(source),
    target: String(target),
    data: { loop: false, ...data },
  };
}

const TIMING = fogTimingOf(DEFAULT_MOTION_CONFIG, false);
const REDUCED = fogTimingOf(DEFAULT_MOTION_CONFIG, true);

test('deriveFogReveals membership: discs, fogged exclusion, and stroke endpoints', () => {
  expect(
    deriveFogReveals(
      [
        node(1, 0, 0),
        node(2, 200, 100, { motion: { phase: 'departing', heavy: true } }),
      ],
      [],
    ).discs,
  ).toEqual([
    { key: 'd:1', x: SYSTEM_FRAME_WIDTH / 2, y: SYSTEM_FRAME_HEIGHT / 2, phase: 'steady', heavy: false },
    { key: 'd:2', x: 200 + SYSTEM_FRAME_WIDTH / 2, y: 100 + SYSTEM_FRAME_HEIGHT / 2, phase: 'departing', heavy: true },
  ]);

  expect(
    deriveFogReveals(
      [
        node(1, 0, 0, { halo: { ring: 1, fogged: false } }),
        node(2, 200, 0, { halo: { ring: 3, fogged: true } }),
      ],
      [],
    ).discs.map((disc) => disc.key),
  ).toEqual(['d:1']);

  const strokes = deriveFogReveals(
    [
      node(1, 0, 0),
      node(2, 200, 0),
      node(3, 400, 0, { halo: { ring: 3, fogged: true } }),
    ],
    [edge('a', 1, 2), edge('halo:2>3', 2, 3, { halo: true }), edge('b', 1, 9)],
  );
  expect(strokes.strokes.map((stroke) => stroke.key)).toEqual(['s:a']);
  expect(strokes.strokes[0]).toMatchObject({
    x1: SYSTEM_FRAME_WIDTH / 2,
    y1: SYSTEM_FRAME_HEIGHT / 2,
    x2: 200 + SYSTEM_FRAME_WIDTH / 2,
    y2: SYSTEM_FRAME_HEIGHT / 2,
  });

  expect(
    deriveFogReveals(
      [node(1, 0, 0), node(2, 200, 0)],
      [
        edge('a', 1, 2, {
          motion: { phase: 'departing', flavor: 'fade', reverse: false, heavy: true },
        }),
      ],
    ).strokes[0],
  ).toMatchObject({ phase: 'departing', heavy: true });
});

test('fog timeline opens, closes, vanishes, and reopens across motion windows', () => {
  const steadySet = (): FogRevealSet =>
    deriveFogReveals([node(1, 0, 0), node(2, 200, 0)], [edge('a', 1, 2)]);

  expect(REDUCED.ease(0.25)).toBe(0.25);
  expect(REDUCED.ease(0.5)).toBe(0.5);
  expect(TIMING.ease(0.5)).toBeGreaterThan(0.5);

  const first = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 1000, TIMING);
  expect(first.animating).toBe(false);
  expect(first.discs.map((disc) => disc.strength)).toEqual([1, 1]);
  expect(first.strokes.map((stroke) => stroke.strength)).toEqual([1]);

  const grown = deriveFogReveals(
    [node(1, 0, 0), node(2, 200, 0), node(3, 0, 200)],
    [edge('a', 1, 2)],
  );
  const start = advanceFogTimeline(first.timeline, grown, 1000, TIMING);
  const newDisc = (frame: typeof start) => frame.discs.find((disc) => disc.key === 'd:3');
  expect(start.animating).toBe(true);
  expect(newDisc(start)).toBeUndefined();

  const mid = advanceFogTimeline(start.timeline, grown, 1500, TIMING);
  const midStrength = newDisc(mid)?.strength ?? 0;
  expect(midStrength).toBeGreaterThan(0);
  expect(midStrength).toBeLessThan(1);

  const done = advanceFogTimeline(mid.timeline, grown, 2100, TIMING);
  expect(newDisc(done)?.strength).toBe(1);
  expect(done.animating).toBe(false);

  const timing = fogTimingOf(
    { ...DEFAULT_MOTION_CONFIG, tempo: { fast: 250, mid: 400, slow: 1200 } },
    false,
  );
  const seeded = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, timing);
  const departing = deriveFogReveals(
    [
      node(1, 0, 0, { motion: { phase: 'departing' } }),
      node(2, 200, 0, { motion: { phase: 'departing', heavy: true } }),
    ],
    [],
  );
  const closing = advanceFogTimeline(seeded.timeline, departing, 0, timing);
  const late = advanceFogTimeline(closing.timeline, departing, 600, timing);
  expect(late.discs.find((disc) => disc.key === 'd:1')).toBeUndefined();
  const heavy = late.discs.find((disc) => disc.key === 'd:2');
  expect(heavy).toBeDefined();
  expect(heavy?.strength).toBeGreaterThan(0);
  expect(heavy?.strength).toBeLessThan(1);
  expect(late.animating).toBe(true);

  const vanishBase = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, TIMING);
  const gone = advanceFogTimeline(
    vanishBase.timeline,
    deriveFogReveals([node(1, 0, 0)], []),
    100,
    TIMING,
  );
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
  expect(fading?.x).toBe(200 + SYSTEM_FRAME_WIDTH / 2);
  expect(fading?.strength).toBeLessThan(1);
  const settled = advanceFogTimeline(
    midway.timeline,
    deriveFogReveals([node(1, 0, 0)], []),
    1300,
    TIMING,
  );
  expect(settled.discs.find((disc) => disc.key === 'd:2')).toBeUndefined();
  expect(settled.animating).toBe(false);

  const reopenBase = advanceFogTimeline(EMPTY_FOG_TIMELINE, steadySet(), 0, TIMING);
  const reopenDeparting = deriveFogReveals(
    [node(1, 0, 0), node(2, 200, 0, { motion: { phase: 'departing' } })],
    [],
  );
  const reopenClosing = advanceFogTimeline(reopenBase.timeline, reopenDeparting, 0, TIMING);
  const reopened = advanceFogTimeline(
    reopenClosing.timeline,
    deriveFogReveals([node(1, 0, 0), node(2, 200, 0)], []),
    400,
    TIMING,
  );
  const strength = reopened.discs.find((disc) => disc.key === 'd:2')?.strength ?? 0;
  expect(strength).toBeGreaterThan(0);
  expect(strength).toBeLessThan(1);
  expect(reopened.animating).toBe(true);
  expect(
    advanceFogTimeline(
      reopened.timeline,
      deriveFogReveals([node(1, 0, 0), node(2, 200, 0)], []),
      1500,
      TIMING,
    ).discs.find((disc) => disc.key === 'd:2')?.strength,
  ).toBe(1);

  const snap = snapFogFrame(
    deriveFogReveals(
      [node(1, 0, 0), node(2, 200, 0, { motion: { phase: 'departing' } })],
      [edge('a', 1, 2)],
    ),
    42,
  );
  expect(snap.animating).toBe(false);
  expect(snap.discs).toEqual([
    { key: 'd:1', x: SYSTEM_FRAME_WIDTH / 2, y: SYSTEM_FRAME_HEIGHT / 2, strength: 1 },
  ]);
  expect(snap.strokes.map((stroke) => stroke.strength)).toEqual([1]);
});

test('fog wake stamps movement, fades orphans, and skips stationary discs', () => {
  const disc = (x: number, y: number) => ({ key: 'd:1', x, y, strength: 1 });

  const seeded = advanceFogWake(EMPTY_FOG_WAKE, [disc(0, 0)], 0, 500);
  expect(seeded.stamps).toEqual([]);
  expect(seeded.animating).toBe(false);

  const moved = advanceFogWake(seeded.state, [disc(FOG_WAKE_SPACING * 3, 0)], 16, 500);
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

  const trail = advanceFogWake(EMPTY_FOG_WAKE, [disc(0, 0)], 0, 500);
  const movedOnce = advanceFogWake(trail.state, [disc(FOG_WAKE_SPACING, 0)], 10, 500);
  expect(movedOnce.stamps.length).toBe(1);
  const orphaned = advanceFogWake(movedOnce.state, [], 200, 500);
  expect(orphaned.stamps.length).toBe(1);
  expect(orphaned.animating).toBe(true);
  const drained = advanceFogWake(orphaned.state, [], 600, 500);
  expect(drained.stamps).toEqual([]);
  expect(drained.state.size).toBe(0);
  expect(drained.animating).toBe(false);

  const stillSeeded = advanceFogWake(EMPTY_FOG_WAKE, [disc(50, 50)], 0, 500);
  const still = advanceFogWake(stillSeeded.state, [disc(50, 50)], 100, 500);
  expect(still.stamps).toEqual([]);
  expect(still.animating).toBe(false);
});

test('advanceFogFrame runs dynamic, reduced-motion, and static tiers', () => {
  const reveals = () => deriveFogReveals([node(1, 0, 0), node(2, 300, 0)], []);

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

  const reducedFirst = advanceFogFrame(
    EMPTY_FOG_FRAME_STATE,
    reveals(),
    DEFAULT_FOG_CONFIG,
    DEFAULT_MOTION_CONFIG,
    true,
    0,
  );
  const reducedMoved = advanceFogFrame(
    reducedFirst.state,
    deriveFogReveals([node(1, 200, 0), node(2, 300, 0)], []),
    DEFAULT_FOG_CONFIG,
    DEFAULT_MOTION_CONFIG,
    true,
    16,
  );
  expect(reducedMoved.wakeStamps).toEqual([]);
  expect(reducedMoved.alphaOnly).toBe(true);

  const staticFrame = advanceFogFrame(
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
  expect(staticFrame.animating).toBe(false);
  expect(staticFrame.frame.discs.map((disc) => disc.key)).toEqual(['d:1']);
  expect(staticFrame.wakeStamps).toEqual([]);
});
