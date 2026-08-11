import { describe, expect, it } from 'vitest';
import {
  believedHoles,
  type ConnectionStubHole,
  type ScannedStubHole,
  type StaticStubSlot,
} from './stub-accounting';

const STATICS: readonly StaticStubSlot[] = [
  { id: 'B274:1', code: 'B274', className: 'HS', whClassId: 7 },
  { id: 'H296:1', code: 'H296', className: 'C5', whClassId: 5 },
];

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

describe('stub accounting', () => {
  it.each([
    {
      name: 'two statics plus four unidentified sigs draw two Unknown surplus stubs',
      input: { statics: STATICS, signatures: signatures(4), connections: [] },
      expectedIds: ['B274:1', 'H296:1', 'SIG-3', 'SIG-4'],
      unknownCount: 2,
    },
    {
      name: 'two statics plus one unidentified sig stay at the two guaranteed holes',
      input: { statics: STATICS, signatures: signatures(1), connections: [] },
      expectedIds: ['B274:1', 'H296:1'],
      unknownCount: 0,
    },
    {
      name: 'a typed wanderer graduates to its own stub beside both statics',
      input: {
        statics: STATICS,
        signatures: signatures(1, 'K162'),
        connections: [],
      },
      expectedIds: ['B274:1', 'H296:1', 'SIG-1'],
      unknownCount: 0,
    },
    {
      name: 'a sig-less jumped-in line absorbs one of four unidentified sigs after two statics',
      input: {
        statics: STATICS,
        signatures: signatures(4),
        connections: [line()],
      },
      expectedIds: ['B274:1', 'H296:1', 'SIG-4'],
      unknownCount: 1,
    },
  ])('$name', ({ input, expectedIds, unknownCount }) => {
    const plan = believedHoles(input);
    expect([
      ...plan.staticStubs.map((stub) => stub.id),
      ...plan.signatureStubIds,
    ]).toEqual(expectedIds);
    expect(plan.unknownCount).toBe(unknownCount);
  });

  it('replaces a matching static with its code-carrying hole and restores it on collapse', () => {
    const matched = believedHoles({
      statics: STATICS,
      signatures: [],
      connections: [
        line({ wormholeTypeCode: 'B274', linkedSignature: true }),
      ],
    });
    expect(matched.staticStubs.map((stub) => stub.code)).toEqual(['H296']);

    const collapsed = believedHoles({
      statics: STATICS,
      signatures: [],
      connections: [],
    });
    expect(collapsed.staticStubs.map((stub) => stub.code)).toEqual([
      'B274',
      'H296',
    ]);
  });

  it('keeps duplicate static identities stable while consuming the multiset', () => {
    const duplicateStatics = [
      { id: 'C247:1', code: 'C247', className: 'C3', whClassId: 3 },
      { id: 'C247:2', code: 'C247', className: 'C3', whClassId: 3 },
    ];
    expect(
      believedHoles({
        statics: duplicateStatics,
        signatures: signatures(1, 'C247'),
        connections: [],
      }).staticStubs,
    ).toEqual([duplicateStatics[0]]);
  });

  it('degrades to no statics without hiding ordinary scanned rows', () => {
    expect(
      believedHoles({
        statics: [],
        signatures: signatures(2),
        connections: [],
      }),
    ).toEqual({
      staticStubs: [],
      signatureStubIds: ['SIG-1', 'SIG-2'],
      unknownCount: 2,
    });
  });
});
