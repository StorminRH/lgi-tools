import { describe, expect, it } from 'vitest';
import {
  classifyMovement,
  type MovementFacts,
  type MovementGeography,
  type MovementVerdict,
} from './movement-classification';

const JITA = 30_000_142;
const PERIMETER = 30_000_144;
const AMARR = 30_002_187;
const J100001 = 31_000_001;
const J100002 = 31_000_002;

const gateLinks = new Set([
  `${JITA}:${PERIMETER}`,
  `${PERIMETER}:${JITA}`,
]);
const wormholeSystems = new Set([J100001, J100002]);
const geography: MovementGeography = {
  gateLinked: (from, to) => gateLinks.has(`${from}:${to}`),
  isWormholeSpace: (systemId) => wormholeSystems.has(systemId),
};

function facts(overrides: Partial<MovementFacts> = {}): MovementFacts {
  return {
    fromSolarSystemId: JITA,
    toSolarSystemId: PERIMETER,
    prevFresh: true,
    shipBecameCapsule: false,
    sameSystemStateChange: false,
    ...overrides,
  };
}

interface MovementCase {
  readonly name: string;
  readonly facts: MovementFacts;
  readonly expected: MovementVerdict;
}

const MOVEMENT_CASES: readonly MovementCase[] = [
  {
    name: 'unchanged location',
    facts: facts({ toSolarSystemId: JITA }),
    expected: 'stationary',
  },
  {
    name: 'same-system dock or station change',
    facts: facts({ toSolarSystemId: JITA, sameSystemStateChange: true }),
    expected: 'same-system-state',
  },
  {
    name: 'known SDE gate pair',
    facts: facts(),
    expected: 'gate-placement',
  },
  {
    name: 'known SDE gate pair in reverse',
    facts: facts({ fromSolarSystemId: PERIMETER, toSolarSystemId: JITA }),
    expected: 'gate-placement',
  },
  {
    name: 'non-adjacent known-space pair',
    facts: facts({ toSolarSystemId: AMARR }),
    expected: 'hole-crossing',
  },
  {
    name: 'known space to J-space',
    facts: facts({ toSolarSystemId: J100001 }),
    expected: 'hole-crossing',
  },
  {
    name: 'J-space to known space',
    facts: facts({ fromSolarSystemId: J100001, toSolarSystemId: JITA }),
    expected: 'hole-crossing',
  },
  {
    name: 'J-space to J-space',
    facts: facts({ fromSolarSystemId: J100001, toSolarSystemId: J100002 }),
    expected: 'hole-crossing',
  },
  {
    name: 'first sample',
    facts: facts({ fromSolarSystemId: null }),
    expected: 're-anchor',
  },
  {
    name: 'stale sample gap across a known gate',
    facts: facts({ prevFresh: false }),
    expected: 're-anchor',
  },
  {
    name: 'capsule after a non-adjacent transition',
    facts: facts({ toSolarSystemId: AMARR, shipBecameCapsule: true }),
    expected: 're-anchor',
  },
];

describe('classifyMovement', () => {
  it.each(MOVEMENT_CASES)('$name -> $expected', ({ facts: input, expected }) => {
    expect(classifyMovement(input, geography)).toBe(expected);
  });
});
