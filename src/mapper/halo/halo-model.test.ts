import { expect, test } from 'vitest';
import type { SecurityClass } from '@/data/eve-data/security';
import { deriveChainTree } from '../layout/facts';
import {
  appendHaloFacts,
  deriveHalo,
  EMPTY_HALO,
  HALO_DRAWN_RINGS,
  HALO_FOGGED_RINGS,
  haloSignature,
  type HaloInput,
} from './halo-model';

// A small deterministic k-space neighbourhood around exit 100:
//
//   ring 1: 1, 2        (gates from 100) — drawn at the pinned depth
//   ring 2: 3 (via 1), 4 (via 2) — fogged at the pinned depth
//   ring 3+: beyond the pinned extent (reachable only via deeper dials)
//
// Neighbour lists are sorted, mirroring the client asset's contract.
const ADJACENCY = new Map<number, readonly number[]>([
  [100, [1, 2]],
  [101, [3]],
  [1, [3, 100]],
  [2, [4, 100]],
  [3, [1, 5]],
  [4, [2, 7]],
  [5, [3, 6, 7]],
  [6, [5]],
  [7, [4, 5]],
]);

const CLASSES = new Map<number, SecurityClass>([
  [100, 'high'],
  [101, 'null'],
  [200, 'wormhole'],
  [1, 'high'],
  [2, 'low'],
  [3, 'null'],
  [4, 'high'],
  [5, 'high'],
  [6, 'high'],
  [7, 'high'],
]);

function inputFor(authored: readonly number[], overrides: Partial<HaloInput> = {}): HaloInput {
  return {
    authoredSystems: authored.map((systemId, order) => ({ systemId, order })),
    neighbours: (id) => ADJACENCY.get(id) ?? [],
    securityClassOf: (id) => CLASSES.get(id),
    ...overrides,
  };
}

test('deriveHalo fans rings, excludes authored, and stays deterministic', () => {
  const halo = deriveHalo(inputFor([100]));
  const byId = new Map(halo.systems.map((system) => [system.systemId, system]));

  expect(HALO_DRAWN_RINGS).toBe(1);
  expect(HALO_FOGGED_RINGS).toBe(1);
  expect([...byId.keys()].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  expect(byId.get(1)).toMatchObject({ ring: 1, fogged: false });
  expect(byId.get(2)).toMatchObject({ ring: 1, fogged: false });
  expect(byId.get(3)).toMatchObject({ ring: 2, fogged: true });
  expect(byId.get(4)).toMatchObject({ ring: 2, fogged: true });

  expect(deriveHalo(inputFor([200]))).toBe(EMPTY_HALO);
  expect(deriveHalo(inputFor([999]))).toBe(EMPTY_HALO);
  expect(deriveHalo(inputFor([]))).toBe(EMPTY_HALO);

  const withAuthored = deriveHalo(inputFor([100, 1]));
  expect(withAuthored.systems.some((system) => system.systemId === 1)).toBe(false);
  expect(
    withAuthored.links.some(
      (link) =>
        (link.a === 100 && link.b === 1) || (link.a === 1 && link.b === 100),
    ),
  ).toBe(true);

  const first = deriveHalo(inputFor([100, 101]));
  expect(JSON.stringify(deriveHalo(inputFor([100, 101])))).toBe(JSON.stringify(first));
  const singleExit = deriveHalo(inputFor([100]));
  expect(haloSignature(deriveHalo(inputFor([100])))).toBe(haloSignature(singleExit));
  expect(haloSignature(first)).not.toBe(haloSignature(singleExit));
  expect(haloSignature(EMPTY_HALO)).toBe('#');

  const permuted = deriveHalo({
    ...inputFor([101, 100]),
    authoredSystems: [
      { systemId: 101, order: 0 },
      { systemId: 100, order: 1 },
    ],
  });
  const membership = (derivation: typeof first) =>
    derivation.systems.map((system) => `${system.systemId}@${system.ring}`).toSorted();
  expect(membership(permuted)).toEqual(membership(first));
});

test('halo links claim first, omit fogged cross-links, and truncate at caps', () => {
  const halo = deriveHalo(inputFor([100]));
  const claimLinks = halo.links.slice(0, halo.systems.length);
  for (const [index, system] of halo.systems.entries()) {
    expect(claimLinks[index]?.b).toBe(system.systemId);
  }

  const deeperFog = deriveHalo(
    inputFor([100], {
      limits: {
        drawnRings: 2,
        foggedRings: 1,
        maxSystemsPerExit: 60,
        maxSystemsTotal: 150,
      },
    }),
  );
  const fogged = new Set(
    deeperFog.systems.filter((system) => system.fogged).map((system) => system.systemId),
  );
  expect(fogged).toEqual(new Set([5, 7]));
  expect(deeperFog.links.some((link) => fogged.has(link.a) && fogged.has(link.b))).toBe(
    false,
  );

  const retained = deriveHalo(
    inputFor([100], {
      limits: {
        drawnRings: 1,
        foggedRings: 2,
        maxSystemsPerExit: 60,
        maxSystemsTotal: 150,
      },
    }),
  );
  const retainedFogged = new Set(
    retained.systems.filter((system) => system.fogged).map((system) => system.systemId),
  );
  expect(
    retained.links.some((link) => retainedFogged.has(link.a) && retainedFogged.has(link.b)),
  ).toBe(true);

  expect(
    deriveHalo(
      inputFor([100], {
        limits: {
          drawnRings: 2,
          foggedRings: 1,
          maxSystemsPerExit: 3,
          maxSystemsTotal: 150,
        },
      }),
    ).systems.map((system) => system.systemId),
    // Ring order then sorted-neighbour order: 1, 2 (ring 1), then 3 (ring 2).
  ).toEqual([1, 2, 3]);

  expect(
    deriveHalo(
      inputFor([100], {
        limits: {
          drawnRings: 2,
          foggedRings: 1,
          maxSystemsPerExit: 60,
          maxSystemsTotal: 2,
        },
      }),
    ).systems.map((system) => system.systemId),
  ).toEqual([1, 2]);

  const deeper = deriveHalo(
    inputFor([100], {
      limits: {
        drawnRings: 3,
        foggedRings: 1,
        maxSystemsPerExit: 60,
        maxSystemsTotal: 150,
      },
    }),
  );
  const byId = new Map(deeper.systems.map((system) => [system.systemId, system]));
  expect(byId.get(5)).toMatchObject({ ring: 3, fogged: false });
  expect(byId.get(7)).toMatchObject({ ring: 3, fogged: false });
  expect(byId.get(6)).toMatchObject({ ring: 4, fogged: true });
});

test('appendHaloFacts appends after authored entries and preserves tree depth', () => {
  const halo = deriveHalo(inputFor([100]));
  const facts = appendHaloFacts(
    {
      systems: [{ systemId: 200 }, { systemId: 100 }],
      connections: [{ fromSystemId: 200, toSystemId: 100 }],
    },
    halo,
  );
  expect(facts.systems.slice(0, 2)).toEqual([{ systemId: 200 }, { systemId: 100 }]);
  expect(facts.systems.length).toBe(2 + halo.systems.length);
  expect(facts.connections[0]).toEqual({ fromSystemId: 200, toSystemId: 100 });
  expect(facts.connections.length).toBe(1 + halo.links.length);

  const emptyFacts = { systems: [{ systemId: 200 }], connections: [] };
  expect(appendHaloFacts(emptyFacts, EMPTY_HALO)).toBe(emptyFacts);

  const treeHalo = deriveHalo(inputFor([200, 100]));
  const tree = deriveChainTree(
    appendHaloFacts(
      {
        systems: [{ systemId: 200 }, { systemId: 100 }],
        connections: [{ fromSystemId: 200, toSystemId: 100 }],
      },
      treeHalo,
    ),
  );
  expect(tree.rootSystemId).toBe(200);
  for (const system of treeHalo.systems) {
    let depth = 0;
    let cursor: number | undefined = system.systemId;
    while (cursor !== undefined && cursor !== 100 && depth <= 10) {
      cursor = tree.parents.get(cursor);
      depth += 1;
    }
    expect(cursor).toBe(100);
    expect(depth).toBe(system.ring);
  }
});
