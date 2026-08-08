import { describe, expect, it } from 'vitest';
import {
  arrowPilotKey,
  derivePilotPath,
  deriveOutboundArrows,
  edgeIdOfPairIndex,
  parseArrowPilotKey,
  PILOT_PATH_MAX_JUMPS,
} from './pilot-path';

// A gate corridor off a two-system drawn boundary, with a branch:
//
//   drawn {10, 11} — 11–20 — 20–21 — 21–22 — … (long tail to 35)
//                       └— 40 (side spur off 20)
const CORRIDOR = new Map<number, readonly number[]>([
  [10, [11]],
  [11, [10, 20]],
  [20, [11, 21, 40]],
  [40, [20]],
]);
for (let id = 21; id <= 35; id += 1) {
  CORRIDOR.set(id, [id - 1, id + 1]);
}
CORRIDOR.set(21, [20, 22]);
CORRIDOR.set(35, [34]);

const neighbours = (id: number): readonly number[] => CORRIDOR.get(id) ?? [];

describe('derivePilotPath', () => {
  it('returns the inclusive drawn-to-pilot path over the gate adjacency', () => {
    const path = derivePilotPath({
      drawnSystemIds: new Set([10, 11]),
      pilotSystemId: 21,
      neighbours,
    });
    expect(path).toEqual([11, 20, 21]);
  });

  it('returns the one-element path for a pilot already drawn', () => {
    expect(
      derivePilotPath({
        drawnSystemIds: new Set([10, 11]),
        pilotSystemId: 11,
        neighbours,
      }),
    ).toEqual([11]);
  });

  it('returns null past the bounded depth and null with no path at all', () => {
    // 20 is 1 jump out; 35 is 16 jumps out — one past the bound.
    expect(PILOT_PATH_MAX_JUMPS).toBe(15);
    expect(
      derivePilotPath({
        drawnSystemIds: new Set([11]),
        pilotSystemId: 34,
        neighbours,
      }),
    ).not.toBeNull();
    expect(
      derivePilotPath({
        drawnSystemIds: new Set([11]),
        pilotSystemId: 35,
        neighbours,
      }),
    ).toBeNull();
    // Unmapped J-space shape: no adjacency reaches the pilot.
    expect(
      derivePilotPath({
        drawnSystemIds: new Set([10, 11]),
        pilotSystemId: 9999,
        neighbours,
      }),
    ).toBeNull();
    expect(
      derivePilotPath({ drawnSystemIds: new Set(), pilotSystemId: 20, neighbours }),
    ).toBeNull();
  });
});

describe('deriveOutboundArrows', () => {
  const drawn = new Set([10, 11, 20]);
  // Rendered lines: the drawn corridor plus the boundary line 20–21 running
  // into the fog. 21–22 and beyond render nothing.
  const edgeIdOfPair = edgeIdOfPairIndex([
    { id: 'c1', source: '10', target: '11' },
    { id: 'c2', source: '11', target: '20' },
    { id: 'halo:20>21', source: '20', target: '21' },
  ]);

  it('mounts the arrow on the outermost rendered edge of the path, aimed outward', () => {
    const arrows = deriveOutboundArrows({
      pilotSystems: [{ systemId: 23, live: true }],
      drawnSystemIds: drawn,
      neighbours,
      edgeIdOfPair,
    });
    expect(arrows.size).toBe(1);
    expect(arrows.get('halo:20>21')).toEqual({ towardSystemId: 21, live: true });
  });

  it('mounts nothing for drawn pilots, unreachable pilots, and edge-less paths', () => {
    const spurOnly = deriveOutboundArrows({
      // 40's path is [20, 40] but no 20–40 edge is rendered.
      pilotSystems: [
        { systemId: 11, live: true },
        { systemId: 9999, live: true },
        { systemId: 40, live: true },
      ],
      drawnSystemIds: drawn,
      neighbours,
      edgeIdOfPair,
    });
    expect(spurOnly.size).toBe(0);
  });

  it('deduplicates pilots sharing one boundary edge onto a single arrow', () => {
    const arrows = deriveOutboundArrows({
      pilotSystems: [
        { systemId: 24, live: false },
        { systemId: 21, live: false },
        { systemId: 23, live: false },
      ],
      drawnSystemIds: drawn,
      neighbours,
      edgeIdOfPair,
    });
    expect([...arrows.keys()]).toEqual(['halo:20>21']);
    expect(arrows.get('halo:20>21')).toEqual({ towardSystemId: 21, live: false });
  });

  it('keeps a shared arrow live when any claimant is live, and mutes it only when all are stale', () => {
    const mixed = deriveOutboundArrows({
      // 21 claims the edge first (ascending order, stale); 23's live pilot
      // must keep the shared arrow honest-green without changing direction.
      pilotSystems: [
        { systemId: 21, live: false },
        { systemId: 23, live: true },
      ],
      drawnSystemIds: drawn,
      neighbours,
      edgeIdOfPair,
    });
    expect(mixed.get('halo:20>21')).toEqual({ towardSystemId: 21, live: true });
  });
});

describe('arrowPilotKey', () => {
  it('round-trips the pilot-system summary through the content key', () => {
    const summary = [
      { systemId: 21, live: true },
      { systemId: 40, live: false },
    ] as const;
    expect(parseArrowPilotKey(arrowPilotKey(summary))).toEqual([...summary]);
    expect(parseArrowPilotKey('')).toEqual([]);
  });
});
