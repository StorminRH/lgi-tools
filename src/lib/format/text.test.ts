import { expect, test } from 'vitest';
import { capitalize, humanizeIdentifier } from './text';

test('capitalize upper-cases only the first character', () => {
  expect(capitalize('')).toBe('');
  expect(capitalize('x')).toBe('X');
  expect(capitalize('armor resistances')).toBe('Armor resistances');
  expect(capitalize('sites')).toBe('Sites');
  expect(capitalize('Map')).toBe('Map');
});

test('humanizeIdentifier turns camel, snake and kebab identifiers into sentence case', () => {
  expect(humanizeIdentifier('droneTrackingBonus')).toBe('Drone tracking bonus');
  expect(humanizeIdentifier('detailMode')).toBe('Detail mode');
  expect(humanizeIdentifier('view')).toBe('View');
  expect(humanizeIdentifier('some_new_ccp_thing')).toBe('Some new ccp thing');
  expect(humanizeIdentifier('__double__')).toBe('Double');
  expect(humanizeIdentifier('wolf-rayet-effect')).toBe('Wolf rayet effect');
  expect(humanizeIdentifier('scan3dView')).toBe('Scan3d view');
  expect(humanizeIdentifier('level2Bonus')).toBe('Level2 bonus');
  expect(humanizeIdentifier('maxECMRange')).toBe('Max ECM range');
  expect(humanizeIdentifier('ESIStatus')).toBe('ESI status');
  expect(humanizeIdentifier('aBTest')).toBe('A b test');
  expect(humanizeIdentifier('Warp  Speed multiplier')).toBe('Warp speed multiplier');
  expect(humanizeIdentifier('')).toBe('');
});
