import { expect, test } from 'vitest';
import { registryCoverageDiff } from './schema-reflection';

test('registryCoverageDiff reports sorted missing and stale names and each repeated declaration once', () => {
  expect(
    registryCoverageDiff(new Set(['zeta', 'alpha', 'beta', 'gamma']), [
      'gamma',
      'stale_b',
      'beta',
      'gamma',
      'stale_a',
      'gamma',
      'beta',
      'stale_b',
    ]),
  ).toEqual({
    missing: ['alpha', 'zeta'],
    stale: ['stale_a', 'stale_b'],
    duplicate: ['beta', 'gamma', 'stale_b'],
  });
});

test('registryCoverageDiff clears matched names and handles empty inputs on either side', () => {
  expect(registryCoverageDiff(['session', 'account'], ['account', 'session'])).toEqual({
    missing: [],
    stale: [],
    duplicate: [],
  });
  expect(registryCoverageDiff([], [])).toEqual({ missing: [], stale: [], duplicate: [] });
  expect(registryCoverageDiff(['synthetic_b', 'synthetic_a'], [])).toEqual({
    missing: ['synthetic_a', 'synthetic_b'],
    stale: [],
    duplicate: [],
  });
  expect(registryCoverageDiff([], ['synthetic_b', 'synthetic_a'])).toEqual({
    missing: [],
    stale: ['synthetic_a', 'synthetic_b'],
    duplicate: [],
  });
});
