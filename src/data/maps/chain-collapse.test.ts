import { describe, expect, it } from 'vitest';
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
    isKnownSpace: (systemId) => systemId < 31_000_000,
    pilotsPresent: 'unknown',
    ...overrides,
  };
}

describe('chain collapse', () => {
  it('removes a dead wormhole-only branch and every incident connection', () => {
    expect(decideCollapse(input())).toEqual({
      kind: 'remove',
      systemIds: [B],
      connectionIds: ['cut'],
    });
  });

  it.each(['unknown', 'absent'] as const)(
    'does not earn retention from %s pilot knowledge',
    (pilotsPresent) => {
      expect(decideCollapse(input({ pilotsPresent }))).toMatchObject({ kind: 'remove' });
    },
  );

  it('retains components with present pilots or a k-space exit', () => {
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
    ).toEqual({ kind: 'retain' });
  });

  it('retains a loop edge whose endpoints remain connected', () => {
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

  it('evaluates both halves inside a retained island and leaves unrelated islands untouched', () => {
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
  });

  it('includes every connection incident to a removed component', () => {
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
});
