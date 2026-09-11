import { describe, expect, it } from 'vitest';
import type { SignatureWindowRow } from '../signatures/signature-model';
import {
  harvestableNamesForIntel,
  intelCategoryBlocks,
  intelLocationKind,
  staticSlotsFromCodes,
} from './intel-model';

const SYSTEM = 31_000_001;

function row(
  overrides: Partial<SignatureWindowRow> & Pick<SignatureWindowRow, 'group' | 'name'>,
): SignatureWindowRow {
  return {
    key: overrides.key ?? `${overrides.group}:${overrides.name}`,
    systemId: overrides.systemId ?? SYSTEM,
    signatureId: overrides.signatureId ?? 'ABC-001',
    kind: overrides.kind ?? 'anomaly',
    group: overrides.group,
    name: overrides.name,
    signalPct: null,
    firstSeenAt: 1,
    connection: null,
    className: null,
  };
}

describe('intelLocationKind', () => {
  it('splits wormhole class, security-chip k-space, and unknown facts', () => {
    expect(intelLocationKind({ security: -1, whClassId: 5 })).toBe('wormhole');
    expect(intelLocationKind({ security: -0.5, whClassId: 12 })).toBe('wormhole');
    expect(intelLocationKind({ security: 0.946, whClassId: null })).toBe('k-space');
    expect(intelLocationKind({ security: 0.9, whClassId: 7 })).toBe('k-space');
    expect(intelLocationKind({ security: null, whClassId: null })).toBe('none');
  });
});

describe('intelCategoryBlocks', () => {
  it('groups identified rows, keeps unnamed counts, and lists names only', () => {
    const rows = [
      row({ group: 'Combat Site', name: 'Sansha Hideout' }),
      row({ group: 'Combat Site', name: null, signatureId: 'UNK-001' }),
      row({ group: 'Gas Site', name: 'Barren Perimeter Reservoir' }),
      row({ group: 'Wormhole', name: 'C247' }),
      row({ group: 'Combat Site', name: 'Sansha Lookout', systemId: SYSTEM + 1 }),
    ];
    expect(intelCategoryBlocks(rows, SYSTEM)).toEqual([
      {
        bucket: 'harvestables',
        label: 'Harvestables',
        count: 1,
        names: ['Barren Perimeter Reservoir'],
      },
      {
        bucket: 'combat',
        label: 'Combat',
        count: 2,
        names: ['Sansha Hideout'],
      },
    ]);
    expect(harvestableNamesForIntel(rows, SYSTEM)).toEqual([
      'Barren Perimeter Reservoir',
    ]);
    expect(intelCategoryBlocks(rows, SYSTEM + 2)).toEqual([]);
  });
});

describe('staticSlotsFromCodes', () => {
  it('keeps codes that resolve to a class and drops the rest', () => {
    expect(
      staticSlotsFromCodes(['C247', 'K162', 'MISSING'], (code) =>
        code === 'C247' ? 'C3' : null,
      ),
    ).toEqual([{ code: 'C247', className: 'C3' }]);
  });
});
