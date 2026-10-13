import { describe, expect, it } from 'vitest';
import {
  conflictFailure,
  dependencyUnavailableFailure,
  errorMessage,
  FAILURE_CATEGORIES,
  forbiddenFailure,
  isAppFailure,
  notFoundFailure,
  rateLimitedFailure,
  unauthenticatedFailure,
  unexpectedFailure,
  validationFailure,
} from './failure';

describe('application failures', () => {
  it('has exactly the eight roadmap categories and one constructor for each', () => {
    const failures = [
      validationFailure(),
      unauthenticatedFailure(),
      forbiddenFailure(),
      notFoundFailure(),
      conflictFailure(),
      rateLimitedFailure(12),
      dependencyUnavailableFailure(),
      unexpectedFailure(),
    ];

    expect(failures.map((entry) => entry.category)).toEqual(FAILURE_CATEGORIES);
    expect(new Set(failures.map((entry) => entry.category)).size).toBe(8);
  });

  it('defaults stable codes to their categories', () => {
    expect(validationFailure().code).toBe('validation');
    expect(rateLimitedFailure(3)).toMatchObject({
      category: 'rate_limited',
      code: 'rate_limited',
      retryAfterSeconds: 3,
    });
  });

  it('recognizes only closed failures at runtime', () => {
    expect(isAppFailure(forbiddenFailure('account_forbidden'))).toBe(true);
    expect(isAppFailure({ category: 'invented', code: 'invented' })).toBe(false);
    expect(isAppFailure({ category: 'forbidden', code: 403 })).toBe(false);
  });
});

describe('errorMessage', () => {
  it('reads the message of an Error and the string form of anything else thrown', () => {
    expect(errorMessage(new Error('socket hang up'))).toBe('socket hang up');
    expect(errorMessage(new TypeError('fetch failed'))).toBe('fetch failed');
    expect(errorMessage(new Error(''))).toBe('');
    expect(errorMessage('budget exhausted')).toBe('budget exhausted');
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
    expect(errorMessage(429)).toBe('429');
    expect(errorMessage({ code: 'rate_limited' })).toBe('[object Object]');
  });
});
