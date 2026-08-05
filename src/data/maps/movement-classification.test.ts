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
  readonly sequence?: 'repeated-arrival';
}

const MOVEMENT_CASES: readonly MovementCase[] = [
  {
    name: 'unchanged location',
    facts: facts({ toSolarSystemId: JITA }),
    expected: 'stationary',
  },
  {
    name: 'dock in the current system',
    facts: facts({ toSolarSystemId: JITA, sameSystemStateChange: true }),
    expected: 'same-system-state',
  },
  {
    name: 'undock or change station in the current system',
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
    name: 'repeated arrival first crossing',
    facts: facts({ toSolarSystemId: J100001 }),
    expected: 'hole-crossing',
    sequence: 'repeated-arrival',
  },
  {
    name: 'repeated arrival return crossing',
    facts: facts({ fromSolarSystemId: J100001, toSolarSystemId: JITA }),
    expected: 'hole-crossing',
    sequence: 'repeated-arrival',
  },
  {
    name: 'repeated arrival second crossing',
    facts: facts({ toSolarSystemId: J100001 }),
    expected: 'hole-crossing',
    sequence: 'repeated-arrival',
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

const EXPECTED_VERDICT_COUNTS = {
  stationary: 1,
  'same-system-state': 2,
  'gate-placement': 2,
  'hole-crossing': 7,
  're-anchor': 3,
} satisfies Record<MovementVerdict, number>;

describe('classifyMovement', () => {
  it('keeps the complete verdict fixture matrix pinned', () => {
    const actualCounts = {
      stationary: MOVEMENT_CASES.filter(({ expected }) => expected === 'stationary').length,
      'same-system-state': MOVEMENT_CASES.filter(
        ({ expected }) => expected === 'same-system-state',
      ).length,
      'gate-placement': MOVEMENT_CASES.filter(
        ({ expected }) => expected === 'gate-placement',
      ).length,
      'hole-crossing': MOVEMENT_CASES.filter(
        ({ expected }) => expected === 'hole-crossing',
      ).length,
      're-anchor': MOVEMENT_CASES.filter(({ expected }) => expected === 're-anchor').length,
    } satisfies Record<MovementVerdict, number>;

    expect(MOVEMENT_CASES).toHaveLength(15);
    expect(actualCounts).toEqual(EXPECTED_VERDICT_COUNTS);
  });

  it.each(MOVEMENT_CASES)('$name -> $expected', ({ facts: input, expected }) => {
    expect(classifyMovement(input, geography)).toBe(expected);
  });

  it('judges repeated arrivals independently without retaining sequence state', () => {
    const verdicts = MOVEMENT_CASES.filter(
      ({ sequence }) => sequence === 'repeated-arrival',
    ).map(({ facts: input }) => classifyMovement(input, geography));

    expect(verdicts).toEqual([
      'hole-crossing',
      'hole-crossing',
      'hole-crossing',
    ]);
  });
});
