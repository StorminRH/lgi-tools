import { expect, it } from 'vitest';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';
import { staticSlotsForCodes } from './use-system-statics';

const codex: WormholeCodex = {
  version: 'test',
  byCode: (code) =>
    code === 'C247'
      ? {
          code,
          typeId: 1,
          farSide: false,
          totalMass: 1,
          maxJumpMass: 1,
          massRegen: 0,
          lifetimeMinutes: 960,
          sizeClass: 'L',
          targetClass: 3,
        }
      : null,
  codes: () => ['C247'],
};

it('decorates duplicate statics with stable per-system multiset identities', () => {
  expect(staticSlotsForCodes(31_000_001, ['C247', 'C247'], codex)).toEqual([
    {
      id: '31000001:C247:1',
      code: 'C247',
      className: 'C3',
      whClassId: 3,
    },
    {
      id: '31000001:C247:2',
      code: 'C247',
      className: 'C3',
      whClassId: 3,
    },
  ]);
});

it('withholds the whole system rather than fabricating an unknown class', () => {
  expect(staticSlotsForCodes(31_000_001, ['C247', 'MISSING'], codex)).toEqual([]);
});
