import { describe, expect, it } from 'vitest';
import { resolveErrorMessage } from './error-copy';

const MESSAGES = { not_linked: 'That character is not linked.' };

describe('resolveErrorMessage', () => {
  it('maps known codes, falls back for unknown, and ignores non-string input', () => {
    expect(resolveErrorMessage('not_linked', MESSAGES, 'fallback')).toBe(
      'That character is not linked.',
    );
    expect(resolveErrorMessage('mystery', MESSAGES, 'Something went wrong.')).toBe(
      'Something went wrong.',
    );
    expect(resolveErrorMessage(undefined, MESSAGES, 'fallback')).toBeNull();
    expect(resolveErrorMessage(['a', 'b'], MESSAGES, 'fallback')).toBeNull();
  });
});
