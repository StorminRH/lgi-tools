import { describe, expect, it } from 'vitest';
import { diffStatics } from './diff';

describe('diffStatics', () => {
  it('reports added, removed and changed systems plus vocabulary deltas', () => {
    expect(
      diffStatics(
        [
          { systemId: 1, code: 'A001' },
          { systemId: 1, code: 'B002' },
          { systemId: 2, code: 'C003' },
          { systemId: 4, code: 'X999' },
        ],
        [
          { systemId: 1, code: 'C003' },
          { systemId: 1, code: 'A001' },
          { systemId: 3, code: 'D004' },
        ],
      ),
    ).toEqual({
      systemsAdded: [{ systemId: 3, codes: ['D004'] }],
      systemsRemoved: [
        { systemId: 2, codes: ['C003'] },
        { systemId: 4, codes: ['X999'] },
      ],
      systemsChanged: [
        {
          systemId: 1,
          before: ['A001', 'B002'],
          after: ['A001', 'C003'],
        },
      ],
      codesAdded: ['D004'],
      codesRemoved: ['B002', 'X999'],
      totalDifferences: 4,
    });
  });

  it('carries every code an added or removed system gains or loses', () => {
    const difference = diffStatics(
      [
        { systemId: 1, code: 'B449' },
        { systemId: 1, code: 'A641' },
      ],
      [
        { systemId: 2, code: 'N766' },
        { systemId: 2, code: 'C247' },
      ],
    );

    expect(difference.systemsAdded).toEqual([
      { systemId: 2, codes: ['C247', 'N766'] },
    ]);
    expect(difference.systemsRemoved).toEqual([
      { systemId: 1, codes: ['A641', 'B449'] },
    ]);
  });

  it('deduplicates assignments and returns zero for equivalent sets', () => {
    expect(
      diffStatics(
        [
          { systemId: 1, code: 'A001' },
          { systemId: 1, code: 'A001' },
        ],
        [{ systemId: 1, code: 'A001' }],
      ),
    ).toEqual({
      systemsAdded: [],
      systemsRemoved: [],
      systemsChanged: [],
      codesAdded: [],
      codesRemoved: [],
      totalDifferences: 0,
    });
  });
});
