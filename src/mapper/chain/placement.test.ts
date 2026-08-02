import { describe, expect, it } from 'vitest';
import { assignerFromPositions } from './placement';

const JITA = 30_000_142;
const AMARR = 30_002_187;

describe('assignerFromPositions', () => {
  it('proposes exactly the supplied positions and ignores candidate geometry', () => {
    const positions = new Map([
      [JITA, { x: 10, y: 20 }],
      [AMARR, { x: 30, y: 40 }],
    ]);
    const assigner = assignerFromPositions(positions);
    const proposals = assigner({
      systems: [
        { systemId: JITA, position: { x: 0, y: 0 }, locked: false },
        { systemId: AMARR, position: null, locked: true },
      ],
      connections: [{ fromSystemId: JITA, toSystemId: AMARR }],
    });

    expect(proposals).toBe(positions);
    expect(proposals.get(JITA)).toEqual({ x: 10, y: 20 });
    expect(proposals.get(AMARR)).toEqual({ x: 30, y: 40 });
  });

  it('omits ids the kernel did not place so the reconciler keeps current positions', () => {
    const assigner = assignerFromPositions(new Map([[JITA, { x: 1, y: 2 }]]));
    const proposals = assigner({
      systems: [
        { systemId: JITA, position: null, locked: false },
        { systemId: AMARR, position: { x: 9, y: 9 }, locked: false },
      ],
      connections: [],
    });

    expect(proposals.has(JITA)).toBe(true);
    expect(proposals.has(AMARR)).toBe(false);
  });
});
