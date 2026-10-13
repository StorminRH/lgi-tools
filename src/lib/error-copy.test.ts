import { expect, test } from 'vitest';
import { resolveNotice } from './error-copy';

const COPY = { not_linked: 'That character is not linked.' };

test('resolveNotice maps own codes, falls back for unknown ones, and ignores a missing or repeated param', () => {
  expect(resolveNotice('not_linked', COPY, 'fallback')).toBe('That character is not linked.');
  expect(resolveNotice('not_linked', COPY)).toBe('That character is not linked.');
  expect(resolveNotice('mystery', COPY, 'Something went wrong.')).toBe('Something went wrong.');
  expect(resolveNotice('mystery', COPY)).toBeNull();
  expect(resolveNotice(undefined, COPY, 'fallback')).toBeNull();
  expect(resolveNotice(['not_linked', 'b'], COPY, 'fallback')).toBeNull();
});

test('resolveNotice never resolves an inherited Object.prototype member', () => {
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    expect(resolveNotice(key, COPY, 'fallback')).toBe('fallback');
    expect(resolveNotice(key, COPY)).toBeNull();
  }
});
