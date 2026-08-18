import { expect, it } from 'vitest';
import { decideCollapse, type CollapseDecisionInput } from './chain-collapse';

const ROOT = 31_000_001;
const A = 31_000_002;
const B = 31_000_003;
const K_SPACE = 30_000_142;

function input(
  overrides: Partial<CollapseDecisionInput> = {},
): CollapseDecisionInput {
  return {
    cutConnectionId: 'cut',
    systems: [
      { id: ROOT, isRoot: true },
      { id: A },
      { id: B },
    ],
    connections: [
      { id: 'root-a', fromSystemId: ROOT, toSystemId: A },
      { id: 'cut', fromSystemId: A, toSystemId: B },
    ],
    pilotsPresent: 'unknown',
    ...overrides,
  };
}

it('removes cut-off branches unless pilots are present or a loop still reaches home', () => {
  expect(decideCollapse(input())).toEqual({
    kind: 'remove',
    systemIds: [B],
    connectionIds: ['cut'],
  });
  for (const pilotsPresent of ['unknown', 'absent'] as const) {
    expect(decideCollapse(input({ pilotsPresent }))).toMatchObject({ kind: 'remove' });
  }
  expect(decideCollapse(input({ pilotsPresent: 'present' }))).toEqual({
    kind: 'retain',
  });
  expect(
    decideCollapse(
      input({
        systems: [
          { id: ROOT, isRoot: true },
          { id: A },
          { id: K_SPACE },
        ],
        connections: [
          { id: 'root-a', fromSystemId: ROOT, toSystemId: A },
          { id: 'cut', fromSystemId: A, toSystemId: K_SPACE },
        ],
      }),
    ),
  ).toEqual({
    kind: 'remove',
    systemIds: [K_SPACE],
    connectionIds: ['cut'],
  });
  expect(
    decideCollapse(
      input({
        connections: [
          { id: 'cut', fromSystemId: A, toSystemId: B },
          { id: 'other', fromSystemId: A, toSystemId: B },
        ],
      }),
    ),
  ).toEqual({ kind: 'retain' });
});

it('removes whole cut-off islands and every incident connection on the removed side', () => {
  expect(
    decideCollapse(
      input({
        systems: [
          { id: ROOT, isRoot: true },
          { id: A },
          { id: B },
          { id: 31_000_010 },
        ],
        connections: [
          { id: 'cut', fromSystemId: A, toSystemId: B },
          { id: 'unrelated', fromSystemId: ROOT, toSystemId: 31_000_010 },
        ],
      }),
    ),
  ).toEqual({
    kind: 'remove',
    systemIds: [A, B],
    connectionIds: ['cut'],
  });
  expect(
    decideCollapse(
      input({
        connections: [
          { id: 'root-a', fromSystemId: ROOT, toSystemId: A },
          { id: 'cut', fromSystemId: A, toSystemId: B },
          { id: 'b-extra', fromSystemId: B, toSystemId: 31_000_004 },
        ],
        systems: [
          { id: ROOT, isRoot: true },
          { id: A },
          { id: B },
          { id: 31_000_004 },
        ],
      }),
    ),
  ).toEqual({
    kind: 'remove',
    systemIds: [B, 31_000_004],
    connectionIds: ['b-extra', 'cut'],
  });
});
