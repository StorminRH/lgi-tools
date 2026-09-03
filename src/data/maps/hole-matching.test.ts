import { describe, expect, it } from 'vitest';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  matchJump,
  type HoleMatchCandidate,
  type JumpEvidence,
  type JumpMatchOutcome,
} from './hole-matching';

const CODEX: readonly WormholeCodexEntry[] = [
  {
    code: 'C247',
    typeId: 1,
    farSide: false,
    totalMass: 2_000_000_000,
    maxJumpMass: 300_000_000,
    massRegen: 0,
    lifetimeMinutes: 960,
    sizeClass: 'L',
    targetClass: 3,
  },
  {
    code: 'Z647',
    typeId: 2,
    farSide: false,
    totalMass: 500_000_000,
    maxJumpMass: 62_000_000,
    massRegen: 0,
    lifetimeMinutes: 960,
    sizeClass: 'M',
    targetClass: 1,
  },
  { code: 'K162', typeId: 3, farSide: true },
];

function candidate(
  id: string,
  overrides: Partial<HoleMatchCandidate> = {},
): HoleMatchCandidate {
  return {
    id,
    wormholeTypeCode: null,
    sizeClass: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<JumpEvidence> = {}): JumpEvidence {

  const candidates = overrides.candidates ?? [];
  return {
    origin: { wormholeClassId: 7, securityStatus: 0.8 },
    destination: { wormholeClassId: 3, securityStatus: -1 },
    observedShipMassKg: null,
    candidates,
    scannedTypeCodes: candidates
      .map((row) => row.wormholeTypeCode)
      .filter((code): code is string => code !== null),
    staticTypeCodes: [],
    codex: CODEX,
    ...overrides,
  };
}

interface MatchCase {
  readonly name: string;
  readonly evidence: JumpEvidence;
  readonly expected: JumpMatchOutcome;
}

const ELIMINATION_CASES: readonly MatchCase[] = [
  {
    name: 'C247 is eliminated by a C1 destination',
    evidence: evidence({
      destination: { wormholeClassId: 1, securityStatus: -1 },
      candidates: [candidate('c247', { wormholeTypeCode: 'C247', sizeClass: 'L' })],
    }),
    expected: { kind: 'insert', survivors: [] },
  },
  {
    name: 'a cruiser is eliminated from a frigate-sized hole',
    evidence: evidence({
      observedShipMassKg: 6_000_000,
      candidates: [candidate('frig', { sizeClass: 'S' })],
    }),
    expected: { kind: 'insert', survivors: [] },
  },
  {
    name: 'a K162 unknown-space hint is eliminated by a C4 landing',
    evidence: evidence({
      destination: { wormholeClassId: 4, securityStatus: -1 },
      candidates: [
        candidate('k162', {
          wormholeTypeCode: 'K162',
          destinationHint: 'unknown',
        }),
      ],
    }),
    expected: { kind: 'insert', survivors: [] },
  },
  {
    name: 'all contradicted candidates produce a fresh-row decision',
    evidence: evidence({
      destination: { wormholeClassId: 4, securityStatus: -1 },
      candidates: [
        candidate('typed', { wormholeTypeCode: 'C247', sizeClass: 'L' }),
        candidate('hinted', {
          wormholeTypeCode: 'K162',
          destinationHint: 'unknown',
        }),
      ],
    }),
    expected: { kind: 'insert', survivors: [] },
  },
  {
    name: 'an absent candidate pool produces a fresh-row decision',
    evidence: evidence(),
    expected: { kind: 'insert', survivors: [] },
  },
];

describe('matchJump', () => {
  it.each(ELIMINATION_CASES)('$name', ({ evidence: input, expected }) => {
    expect(matchJump(input)).toEqual(expected);
  });

  it('admits the C13 unknown bucket and uncovered Drifter classes fail open', () => {
    expect(
      matchJump(
        evidence({
          destination: { wormholeClassId: 13, securityStatus: -1 },
          candidates: [
            candidate('shattered', {
              wormholeTypeCode: 'K162',
              destinationHint: 'unknown',
            }),
          ],
        }),
      ),
    ).toEqual({
      kind: 'resolve',
      candidateId: 'shattered',
      provenance: 'assumed',
      survivors: ['shattered'],
    });
    expect(
      matchJump(
        evidence({
          destination: { wormholeClassId: 14, securityStatus: -1 },
          candidates: [
            candidate('drifter', {
              wormholeTypeCode: 'K162',
              destinationHint: 'hisec',
            }),
          ],
        }),
      ),
    ).toEqual({
      kind: 'resolve',
      candidateId: 'drifter',
      provenance: 'assumed',
      survivors: ['drifter'],
    });
  });

  it('bands null-class k-space destinations by security status', () => {
    const input = evidence({
      destination: { wormholeClassId: null, securityStatus: 0.8 },
      candidates: [
        candidate('low', { wormholeTypeCode: 'K162', destinationHint: 'lowsec' }),
        candidate('high', { wormholeTypeCode: 'K162', destinationHint: 'hisec' }),
      ],
    });
    expect(matchJump(input)).toEqual({
      kind: 'resolve',
      candidateId: 'high',
      provenance: 'assumed',
      survivors: ['high'],
    });
  });

  it('verifies one typed survivor only when the origin statics census is complete', () => {
    const typed = candidate('typed', { wormholeTypeCode: 'C247', sizeClass: 'L' });
    const base = evidence({
      origin: { wormholeClassId: 2, securityStatus: -1 },
      candidates: [typed],
      staticTypeCodes: ['C247'],
    });
    expect(matchJump(base)).toEqual({
      kind: 'resolve',
      candidateId: 'typed',
      provenance: 'jump-verified',
      survivors: ['typed'],
    });
    expect(matchJump({ ...base, staticTypeCodes: [] })).toEqual({
      kind: 'resolve',
      candidateId: 'typed',
      provenance: 'assumed',
      survivors: ['typed'],
    });
    expect(matchJump({ ...base, staticTypeCodes: ['C247', 'Z647'] })).toEqual({
      kind: 'resolve',
      candidateId: 'typed',
      provenance: 'assumed',
      survivors: ['typed'],
    });

    expect(
      matchJump({
        ...base,
        staticTypeCodes: ['C247', 'Z647'],
        scannedTypeCodes: ['C247', 'Z647'],
      }),
    ).toEqual({
      kind: 'resolve',
      candidateId: 'typed',
      provenance: 'jump-verified',
      survivors: ['typed'],
    });
  });

  it('orders ambiguity by typed, hinted, untyped, then bare K162 evidence', () => {
    const input = evidence({
      candidates: [
        candidate('z-k162', { wormholeTypeCode: 'K162' }),
        candidate('z-untyped'),
        candidate('z-hinted', {
          wormholeTypeCode: 'K162',
          destinationHint: 'unknown',
        }),
        candidate('z-typed', { wormholeTypeCode: 'C247', sizeClass: 'L' }),
      ],
    });
    expect(matchJump(input)).toEqual({
      kind: 'resolve',
      candidateId: 'z-typed',
      provenance: 'assumed',
      survivors: ['z-typed', 'z-hinted', 'z-untyped', 'z-k162'],
    });
  });
});
