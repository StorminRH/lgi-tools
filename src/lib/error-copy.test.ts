import { describe, expect, it } from 'vitest';
import { resolveErrorMessage } from './error-copy';

const MESSAGES = { not_linked: 'That character is not linked.' };

describe('resolveErrorMessage', () => {
  it('maps a known code to its message', () => {
    expect(resolveErrorMessage('not_linked', MESSAGES, 'fallback')).toBe(
      'That character is not linked.',
    );
  });

  it('uses the fallback for an unknown code', () => {
    expect(resolveErrorMessage('mystery', MESSAGES, 'Something went wrong.')).toBe(
      'Something went wrong.',
    );
  });

  it('returns null for non-string input', () => {
    expect(resolveErrorMessage(undefined, MESSAGES, 'fallback')).toBeNull();
    expect(resolveErrorMessage(['a', 'b'], MESSAGES, 'fallback')).toBeNull();
  });
});
