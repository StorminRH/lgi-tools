import { describe, expect, it } from 'vitest';
import type { ChainPosition } from './intents';
import {
  GRID_COLUMNS,
  GRID_SPACING_X,
  GRID_SPACING_Y,
  gridAssigner,
  positionOfSlot,
  type PlacementCandidate,
} from './placement';

const JITA = 30_000_142;
const AMARR = 30_002_187;

function candidate(
  systemId: number,
  position: ChainPosition | null = null,
  locked = false,
): PlacementCandidate {
  return { systemId, position, locked };
}

function place(candidates: readonly PlacementCandidate[]) {
  return gridAssigner({ systems: candidates, connections: [] });
}

describe('provisional grid placement', () => {
  it('walks slots row-major and wraps at the column count', () => {
    expect(positionOfSlot(0)).toEqual({ x: 0, y: 0 });
    expect(positionOfSlot(1)).toEqual({ x: GRID_SPACING_X, y: 0 });
    expect(positionOfSlot(GRID_COLUMNS)).toEqual({ x: 0, y: GRID_SPACING_Y });
    expect(positionOfSlot(GRID_COLUMNS + 1)).toEqual({
      x: GRID_SPACING_X,
      y: GRID_SPACING_Y,
    });
  });

  it('gives consecutive first appearances consecutive slots', () => {
    const proposals = place([candidate(JITA), candidate(AMARR)]);

    expect(proposals.get(JITA)).toEqual(positionOfSlot(0));
    expect(proposals.get(AMARR)).toEqual(positionOfSlot(1));
  });

  it('returns an already-placed node its current position unchanged', () => {
    const held = positionOfSlot(3);
    const proposals = place([candidate(JITA, held)]);

    // This is why the grid never produces a `system-moved` in production.
    expect(proposals.get(JITA)).toEqual(held);
  });

  it('skips a slot an already-placed node occupies', () => {
    const proposals = place([candidate(JITA, positionOfSlot(0)), candidate(AMARR)]);

    expect(proposals.get(AMARR)).toEqual(positionOfSlot(1));
  });

  it.each([
    { label: 'off-grid', position: { x: 17, y: 42 } },
    {
      label: 'beyond the last column',
      position: { x: GRID_SPACING_X * (GRID_COLUMNS + 1), y: 0 },
    },
    { label: 'negative column', position: { x: -GRID_SPACING_X, y: 0 } },
    { label: 'negative row', position: { x: 0, y: -GRID_SPACING_Y } },
  ])('reserves no cell for a $label position', ({ position }) => {
    // A user-dragged node lands anywhere, so it holds no grid cell — OOS-1 permits the collision.
    const proposals = place([candidate(JITA, position), candidate(AMARR)]);

    expect(proposals.get(JITA)).toEqual(position);
    expect(proposals.get(AMARR)).toEqual(positionOfSlot(0));
  });

  it('proposes a position for every candidate it was given', () => {
    const proposals = place([
      candidate(JITA),
      candidate(AMARR, positionOfSlot(4), true),
    ]);

    expect([...proposals.keys()].toSorted()).toEqual([JITA, AMARR].toSorted());
  });
});
