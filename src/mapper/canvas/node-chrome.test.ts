import { expect, test } from 'vitest';
import { trackSeats } from './node-chrome';

test('marks plus a pilot count produce glance seats then one pilot seat', () => {
  expect(trackSeats(['combat', 'harvestables'], 3)).toEqual([
    { kind: 'glance', bucket: 'combat' },
    { kind: 'glance', bucket: 'harvestables' },
    { kind: 'pilot', count: 3 },
  ]);
});

test('zero pilots omits the pilot seat', () => {
  expect(trackSeats(['hacking'], 0)).toEqual([{ kind: 'glance', bucket: 'hacking' }]);
  expect(trackSeats([], 0)).toEqual([]);
});
