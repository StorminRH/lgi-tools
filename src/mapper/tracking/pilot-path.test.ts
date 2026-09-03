import { expect, test } from 'vitest';
import {
  arrowPilotKey,
  derivePilotPath,
  deriveOutboundArrows,
  edgeIdOfPairIndex,
  parseArrowPilotKey,
  PILOT_PATH_MAX_JUMPS,
} from './pilot-path';

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

test('derivePilotPath returns inclusive paths and nulls past the jump bound', () => {
  expect(
    derivePilotPath({
      drawnSystemIds: new Set([10, 11]),
      pilotSystemId: 21,
      neighbours,
    }),
  ).toEqual([11, 20, 21]);
  expect(
    derivePilotPath({
      drawnSystemIds: new Set([10, 11]),
      pilotSystemId: 11,
      neighbours,
    }),
  ).toEqual([11]);

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

test('deriveOutboundArrows mounts, dedupes, and keeps shared-arrow liveness honest', () => {
  const drawn = new Set([10, 11, 20]);
  const edgeIdOfPair = edgeIdOfPairIndex([
    { id: 'c1', source: '10', target: '11' },
    { id: 'c2', source: '11', target: '20' },
    { id: 'halo:20>21', source: '20', target: '21' },
  ]);

  const arrows = deriveOutboundArrows({
    pilotSystems: [{ systemId: 23, live: true }],
    drawnSystemIds: drawn,
    neighbours,
    edgeIdOfPair,
  });
  expect(arrows.size).toBe(1);
  expect(arrows.get('halo:20>21')).toEqual({ towardSystemId: 21, live: true });

  expect(
    deriveOutboundArrows({
      pilotSystems: [
        { systemId: 11, live: true },
        { systemId: 9999, live: true },
        { systemId: 40, live: true },
      ],
      drawnSystemIds: drawn,
      neighbours,
      edgeIdOfPair,
    }).size,
  ).toBe(0);

  const deduped = deriveOutboundArrows({
    pilotSystems: [
      { systemId: 24, live: false },
      { systemId: 21, live: false },
      { systemId: 23, live: false },
    ],
    drawnSystemIds: drawn,
    neighbours,
    edgeIdOfPair,
  });
  expect([...deduped.keys()]).toEqual(['halo:20>21']);
  expect(deduped.get('halo:20>21')).toEqual({ towardSystemId: 21, live: false });

  const mixed = deriveOutboundArrows({
    pilotSystems: [
      { systemId: 21, live: false },
      { systemId: 23, live: true },
    ],
    drawnSystemIds: drawn,
    neighbours,
    edgeIdOfPair,
  });
  expect(mixed.get('halo:20>21')).toEqual({ towardSystemId: 21, live: true });

  const summary = [
    { systemId: 21, live: true },
    { systemId: 40, live: false },
  ] as const;
  expect(parseArrowPilotKey(arrowPilotKey(summary))).toEqual([...summary]);
  expect(parseArrowPilotKey('')).toEqual([]);
});

test('edge pair lookup ignores synthetic non-system stub endpoints', () => {
  const lookup = edgeIdOfPairIndex([
    { id: 'stub-edge', source: '10', target: 'stub:connection' },
    { id: 'system-edge', source: '10', target: '11' },
  ]);

  expect(lookup(10, 11)).toBe('system-edge');
  expect(lookup(10, Number.NaN)).toBeNull();
});
