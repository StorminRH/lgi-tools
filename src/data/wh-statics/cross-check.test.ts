import { describe, expect, it } from 'vitest';
import type { WormholeCodexAsset } from '@/data/eve-data/universe-assets';
import {
  crossCheckStatics,
  UnknownCodexStaticError,
  UnknownLineageTypeError,
} from './cross-check';

const CODEX: WormholeCodexAsset = {
  version: 'test',
  types: [
    {
      code: 'A001',
      typeId: 1001,
      farSide: false,
      totalMass: 1,
      maxJumpMass: 1,
      massRegen: 0,
      lifetimeMinutes: 60,
      sizeClass: 'S',
      targetClass: 1,
    },
    {
      code: 'B002',
      typeId: 1002,
      farSide: false,
      totalMass: 1,
      maxJumpMass: 1,
      massRegen: 0,
      lifetimeMinutes: 60,
      sizeClass: 'S',
      targetClass: 2,
    },
  ],
};

describe('crossCheckStatics', () => {
  it('reports agreement and surfaces seeded disagreement and one-sided systems', () => {
    const result = crossCheckStatics(
      [
        { systemId: 1, systemName: 'J000001', code: 'A001' },
        { systemId: 2, systemName: 'J000002', code: 'B002' },
        { systemId: 4, systemName: 'J000004', code: 'A001' },
      ],
      [
        { systemId: 1, typeId: 1001 },
        { systemId: 2, typeId: 1001 },
        { systemId: 3, typeId: 1002 },
      ],
      CODEX,
    );

    expect(result).toEqual({
      agreedSystems: 1,
      disagreements: [
        {
          systemId: 2,
          feedCodes: ['B002'],
          lineageCodes: ['A001'],
        },
      ],
      lineageOnlySystems: [3],
      feedOnlySystems: [4],
    });
  });

  it('throws when a feed code has no codex entry', () => {
    expect(() =>
      crossCheckStatics(
        [{ systemId: 1, systemName: 'J000001', code: 'Z999' }],
        [],
        CODEX,
      ),
    ).toThrow(UnknownCodexStaticError);
  });

  it('throws when a lineage type id has no codex entry', () => {
    expect(() =>
      crossCheckStatics(
        [],
        [{ systemId: 1, typeId: 9999 }],
        CODEX,
      ),
    ).toThrow(UnknownLineageTypeError);
  });

  it('treats duplicate codex type ids for one stable code as agreement', () => {
    const baseEntry = CODEX.types[0];
    if (baseEntry === undefined) throw new Error('Seed codex has no first entry.');
    const duplicateCodeCodex: WormholeCodexAsset = {
      ...CODEX,
      types: [
        ...CODEX.types,
        {
          ...baseEntry,
          typeId: 2001,
        },
      ],
    };

    expect(
      crossCheckStatics(
        [{ systemId: 1, systemName: 'J000001', code: 'A001' }],
        [{ systemId: 1, typeId: 2001 }],
        duplicateCodeCodex,
      ),
    ).toEqual({
      agreedSystems: 1,
      disagreements: [],
      lineageOnlySystems: [],
      feedOnlySystems: [],
    });
  });
});
