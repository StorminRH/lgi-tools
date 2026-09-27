import { expect, test } from 'vitest';
import { trackSeats } from './node-chrome';

test('glance marks take seats before one pilot seat, and zero pilots omit that seat', () => {
  expect(trackSeats(['combat', 'harvestables'], 3)).toEqual([
    { kind: 'glance', bucket: 'combat' },
    { kind: 'glance', bucket: 'harvestables' },
    { kind: 'pilot', count: 3 },
  ]);
  expect(trackSeats(['hacking'], 0)).toEqual([{ kind: 'glance', bucket: 'hacking' }]);
  expect(trackSeats([], 0)).toEqual([]);
});
