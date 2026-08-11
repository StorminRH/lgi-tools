import { describe, expect, it } from 'vitest';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import {
  eliminateSignatures,
  type EliminationConnection,
  type EliminationInput,
  type EliminationResult,
  type EliminationSignature,
} from './signature-eliminator';

const B274_CODEX_ENTRY: WormholeCodexEntry = {
  code: 'B274',
  typeId: 1,
  farSide: false,
  totalMass: 2_000_000_000,
  maxJumpMass: 300_000_000,
  massRegen: 0,
  lifetimeMinutes: 1_440,
  sizeClass: 'L',
  targetClass: 7,
};

const CODEX: readonly WormholeCodexEntry[] = [
  B274_CODEX_ENTRY,
  {
    code: 'H296',
    typeId: 2,
    farSide: false,
    totalMass: 3_000_000_000,
    maxJumpMass: 1_350_000_000,
    massRegen: 0,
    lifetimeMinutes: 1_440,
    sizeClass: 'XL',
    targetClass: 5,
  },
  { code: 'K162', typeId: 3, farSide: true },
];

function signature(
  signatureId: string,
  overrides: Partial<EliminationSignature> = {},
): EliminationSignature {
  return {
    signatureId,
    wormholeTypeCode: null,
    typeProvenance: null,
    ...overrides,
  };
}

function connection(
  connectionId: string,
  overrides: Partial<EliminationConnection> = {},
): EliminationConnection {
  return {
    connectionId,
    wormholeTypeCode: null,
    linkedSignature: true,
    ...overrides,
  };
}

function input(overrides: Partial<EliminationInput> = {}): EliminationInput {
  return {
    staticTypeCodes: [],
    signatures: [],
    connections: [],
    codex: CODEX,
    ...overrides,
  };
}

interface InferenceCase {
  readonly name: string;
  readonly input: EliminationInput;
  readonly expected: EliminationResult;
}

const INFERENCE_CASES = [
  {
    name: 'one unknown signature claims the only static at assumed tier',
    input: input({
      staticTypeCodes: ['B274'],
      signatures: [signature('AAA-111')],
    }),
    expected: {
      deductions: [
        { signatureId: 'AAA-111', typeCode: 'B274', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'one typed static crosses off the answer key for the second signature',
    input: input({
      staticTypeCodes: ['B274', 'H296'],
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'B274',
          typeProvenance: 'human',
        }),
        signature('BBB-222'),
      ],
    }),
    expected: {
      deductions: [
        { signatureId: 'BBB-222', typeCode: 'H296', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'a confirmed historical connection narrows the later scan',
    input: input({
      staticTypeCodes: ['B274', 'H296'],
      signatures: [signature('BBB-222')],
      connections: [
        connection('history', { wormholeTypeCode: 'B274' }),
      ],
    }),
    expected: {
      deductions: [
        { signatureId: 'BBB-222', typeCode: 'H296', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'K162 plus B274 crosses off to the worked H296 result',
    input: input({
      staticTypeCodes: ['B274', 'H296'],
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'K162',
          typeProvenance: 'human',
        }),
        signature('BBB-222', {
          wormholeTypeCode: 'B274',
          typeProvenance: 'human',
        }),
        signature('CCC-333'),
      ],
    }),
    expected: {
      deductions: [
        { signatureId: 'CCC-333', typeCode: 'H296', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'a typed K162 uniquely links the sig-less inbound connection',
    input: input({
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'K162',
          typeProvenance: 'human',
        }),
      ],
      connections: [connection('inbound', { linkedSignature: false })],
    }),
    expected: {
      deductions: [
        {
          signatureId: 'AAA-111',
          connectionId: 'inbound',
          provenance: 'assumed',
          expectedTypeCode: 'K162',
        },
      ],
      quiet: false,
    },
  },
  {
    name: 'an over-claimed static multiset contradicts quietly',
    input: input({
      staticTypeCodes: ['B274'],
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'B274',
          typeProvenance: 'human',
        }),
        signature('BBB-222', {
          wormholeTypeCode: 'B274',
          typeProvenance: 'confirmed',
        }),
      ],
    }),
    expected: { deductions: [], quiet: true },
  },
  {
    name: 'duplicate static slots remain a multiset after one is claimed',
    input: input({
      staticTypeCodes: ['B274', 'B274'],
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'B274',
          typeProvenance: 'jump-verified',
        }),
        signature('BBB-222'),
      ],
    }),
    expected: {
      deductions: [
        { signatureId: 'BBB-222', typeCode: 'B274', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'an assumed field may be recalculated',
    input: input({
      staticTypeCodes: ['B274'],
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'H296',
          typeProvenance: 'assumed',
        }),
      ],
    }),
    expected: {
      deductions: [
        { signatureId: 'AAA-111', typeCode: 'B274', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'a human field is never proposed for replacement',
    input: input({
      staticTypeCodes: ['B274'],
      signatures: [
        signature('AAA-111', {
          wormholeTypeCode: 'H296',
          typeProvenance: 'human',
        }),
      ],
    }),
    expected: { deductions: [], quiet: true },
  },
  {
    name: 'two open static answers remain insufficient and quiet',
    input: input({
      staticTypeCodes: ['B274', 'H296'],
      signatures: [signature('AAA-111')],
    }),
    expected: { deductions: [], quiet: true },
  },
  {
    name: 'attribute-identical duplicate code entries keep inference live',
    input: input({
      staticTypeCodes: ['B274'],
      signatures: [signature('AAA-111')],
      codex: [
        ...CODEX,
        { ...B274_CODEX_ENTRY, typeId: 99 },
      ],
    }),
    expected: {
      deductions: [
        { signatureId: 'AAA-111', typeCode: 'B274', provenance: 'assumed' },
      ],
      quiet: false,
    },
  },
  {
    name: 'a conflicting duplicate code entry fails closed',
    input: input({
      staticTypeCodes: ['B274'],
      signatures: [signature('AAA-111')],
      codex: [
        ...CODEX,
        {
          ...B274_CODEX_ENTRY,
          typeId: 100,
          maxJumpMass: B274_CODEX_ENTRY.maxJumpMass - 1,
        },
      ],
    }),
    expected: { deductions: [], quiet: true },
  },
] satisfies readonly InferenceCase[];

describe('eliminateSignatures', () => {
  it.each(INFERENCE_CASES)('$name', ({ input: evidence, expected }) => {
    expect(eliminateSignatures(evidence)).toStrictEqual(expected);
  });
});
