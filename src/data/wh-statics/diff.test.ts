import { describe, expect, it } from 'vitest';
import { diffStatics } from './diff';

describe('diffStatics', () => {
  it('reports added, removed, and changed systems plus code vocabulary delta', () => {
    const promoted = [
      { systemId: 1, code: 'E175' },
      { systemId: 2, code: 'C247' },
      { systemId: 2, code: 'N766' },
      { systemId: 3, code: 'U210' },
    ];
    const incoming = [
      { systemId: 1, code: 'E175' },
      { systemId: 2, code: 'C247' },
      { systemId: 4, code: 'Z006' },
    ];

    expect(diffStatics(promoted, incoming)).toEqual({
      systemsAdded: [4],
      systemsRemoved: [3],
      systemsChanged: [
        {
          systemId: 2,
          before: ['C247', 'N766'],
          after: ['C247'],
        },
      ],
      codesAdded: ['Z006'],
      codesRemoved: ['N766', 'U210'],
      totalDifferences: 6,
    });
  });

  it('returns totalDifferences 0 when the sets match', () => {
    const entries = [
      { systemId: 1, code: 'E175' },
      { systemId: 2, code: 'C247' },
    ];
    expect(diffStatics(entries, entries).totalDifferences).toBe(0);
  });
});
