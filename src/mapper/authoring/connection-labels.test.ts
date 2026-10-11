import { expect, test } from 'vitest';
import { leadsToReadout } from './connection-labels';

test('leads readout prefers the destination, then the hint label, then the unset text', () => {
  const destination = { label: 'J123456 - C4' };
  expect(leadsToReadout('dangerous', destination)).toBe('J123456 - C4');
  expect(leadsToReadout(null, destination, '')).toBe('J123456 - C4');

  expect(leadsToReadout('dangerous', null)).toBe('Dangerous (C4–C5)');
  expect(leadsToReadout('hisec', null, '')).toBe('High-sec');

  expect(leadsToReadout(null, null)).toBe('Unset');
  expect(leadsToReadout(null, null, '')).toBe('');
});
