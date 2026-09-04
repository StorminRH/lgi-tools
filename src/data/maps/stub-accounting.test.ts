import { describe, expect, it } from 'vitest';
import {
  hiddenUnidentifiedSignatures,
  type ConnectionStubHole,
  type ScannedStubHole,
} from './stub-accounting';

const signatures = (
  count: number,
  wormholeTypeCode: string | null = null,
): readonly ScannedStubHole[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `SIG-${index + 1}`,
    wormholeTypeCode,
  }));

const line = (
  overrides: Partial<ConnectionStubHole> = {},
): ConnectionStubHole => ({
  wormholeTypeCode: null,
  linkedSignature: false,
  ...overrides,
});

describe('hidden unidentified signatures', () => {
  it.each([
    {
      name: 'root: two unclaimed statics plus four unidentified sigs hide the first two',
      input: {
        unclaimedStatics: 2,
        signatures: signatures(4),
        connections: [],
        isRoot: true,
      },
      hidden: ['SIG-1', 'SIG-2'],
    },
    {
      name: 'non-root: two unclaimed statics plus four unidentified sigs reserve the inbound',
      input: {
        unclaimedStatics: 2,
        signatures: signatures(4),
        connections: [],
        isRoot: false,
      },
      hidden: ['SIG-1', 'SIG-2', 'SIG-3'],
    },
    {
      name: 'two unclaimed statics plus one unidentified sig hide that sig',
      input: {
        unclaimedStatics: 2,
        signatures: signatures(1),
        connections: [],
        isRoot: true,
      },
      hidden: ['SIG-1'],
    },
    {
      name: 'a typed wanderer is never hidden',
      input: {
        unclaimedStatics: 2,
        signatures: signatures(1, 'K162'),
        connections: [],
        isRoot: true,
      },
      hidden: [],
    },
    {
      name: 'a sig-less jumped-in line absorbs one of four unidentified sigs after two statics',
      input: {
        unclaimedStatics: 2,
        signatures: signatures(4),
        connections: [line()],
        isRoot: false,
      },
      hidden: ['SIG-1', 'SIG-2', 'SIG-3'],
    },
    {
      name: 'no unclaimed statics draws every unidentified sig',
      input: {
        unclaimedStatics: 0,
        signatures: signatures(2),
        connections: [],
        isRoot: true,
      },
      hidden: [],
    },
  ])('$name', ({ input, hidden }) => {
    expect([...hiddenUnidentifiedSignatures(input)]).toEqual(hidden);
  });
});
