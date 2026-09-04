import { expect, it } from 'vitest';
import type { WormholeCodex } from '@/data/eve-data/universe-assets-client';
import {
  destinationClassIdForCode,
  staticClassForCode,
} from './use-system-statics';

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
      : code === 'K162'
        ? {
            code,
            typeId: 2,
            farSide: true,
            totalMass: 1,
            maxJumpMass: 1,
            massRegen: 0,
            lifetimeMinutes: 960,
            sizeClass: 'L',
            targetClass: 0,
          }
        : null,
  codes: () => ['C247', 'K162'],
};

it('resolves a named static to its destination class', () => {
  expect(destinationClassIdForCode('C247', codex)).toBe(3);
  expect(staticClassForCode('C247', codex)).toEqual({
    className: 'C3',
    whClassId: 3,
  });
});

it('withholds a class rather than fabricating one', () => {
  expect(destinationClassIdForCode('MISSING', codex)).toBeNull();
  expect(staticClassForCode('MISSING', codex)).toBeNull();
  expect(destinationClassIdForCode('K162', codex)).toBeNull();
  expect(staticClassForCode('K162', codex)).toBeNull();
  expect(staticClassForCode('C247', null)).toBeNull();
});
