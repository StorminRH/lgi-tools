import { describe, expect, it } from 'vitest';
import type { WormholeCodexAsset } from '@/data/eve-data/universe-assets';
import {
  crossCheckStatics,
  UnresolvableCodexCodeError,
} from './cross-check';
import { parseLineageCsv, readLineageFixture } from './lineage';
import type { StaticsEntry } from './parse';

const CODEX: WormholeCodexAsset = {
  version: 'test',
  types: [
    {
      code: 'E175',
      typeId: 30831,
      farSide: false,
      totalMass: 1,
      maxJumpMass: 1,
      massRegen: 0,
      lifetimeMinutes: 16,
      sizeClass: 'S',
      targetClass: 1,
    },
    {
      code: 'C247',
      typeId: 30647,
      farSide: false,
      totalMass: 1,
      maxJumpMass: 1,
      massRegen: 0,
      lifetimeMinutes: 16,
      sizeClass: 'M',
      targetClass: 2,
    },
    {
      code: 'N766',
      typeId: 30655,
      farSide: false,
      totalMass: 1,
      maxJumpMass: 1,
      massRegen: 0,
      lifetimeMinutes: 16,
      sizeClass: 'M',
      targetClass: 3,
    },
  ],
};

describe('lineage fixture', () => {
  it('parses the committed Pathfinder CSV with MIT provenance comments skipped', () => {
    const rows = readLineageFixture();
    expect(rows).toHaveLength(3772);
    expect(rows[0]).toEqual({ systemId: 31002604, typeId: 34140 });
    expect(parseLineageCsv('# comment\nid;systemId;typeId\n1;1;2\n')).toEqual([
      { systemId: 1, typeId: 2 },
    ]);
  });
});

describe('crossCheckStatics', () => {
  it('reports full agreement for a committed feed/lineage/codex pair', () => {
    const entries: StaticsEntry[] = [
      { systemId: 31002318, systemName: 'J111613', code: 'E175' },
      { systemId: 31000002, systemName: 'J113551', code: 'C247' },
      { systemId: 31000002, systemName: 'J113551', code: 'N766' },
    ];
    const lineage = [
      { systemId: 31002318, typeId: 30831 },
      { systemId: 31000002, typeId: 30647 },
      { systemId: 31000002, typeId: 30655 },
    ];

    expect(crossCheckStatics(entries, lineage, CODEX)).toEqual({
      agreedSystems: 2,
      disagreements: [],
      lineageOnlySystems: [],
      feedOnlySystems: [],
    });
  });

  it('surfaces a seeded disagreement without resolving it', () => {
    const entries: StaticsEntry[] = [
      { systemId: 31002318, systemName: 'J111613', code: 'E175' },
    ];
    const lineage = [{ systemId: 31002318, typeId: 30647 }];

    expect(crossCheckStatics(entries, lineage, CODEX)).toEqual({
      agreedSystems: 0,
      disagreements: [
        {
          systemId: 31002318,
          feedTypeIds: [30831],
          lineageTypeIds: [30647],
        },
      ],
      lineageOnlySystems: [],
      feedOnlySystems: [],
    });
  });

  it('throws when a code has no codex entry', () => {
    expect(() =>
      crossCheckStatics(
        [{ systemId: 1, systemName: 'X', code: 'ZZZZ' }],
        [],
        CODEX,
      ),
    ).toThrow(UnresolvableCodexCodeError);
  });
});
