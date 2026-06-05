import { describe, expect, it } from 'vitest';
import { sanitiseUserText } from './sanitise';

const NUL = String.fromCharCode(0); // Cc (control)
const ZWSP = String.fromCharCode(0x200b); // Cf (zero-width space)

describe('sanitiseUserText', () => {
  it('strips control and zero-width format characters', () => {
    expect(sanitiseUserText(`a${NUL}b${ZWSP}c`, 100)).toBe('abc');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitiseUserText('  hello  ', 100)).toBe('hello');
  });

  it('truncates to the max length', () => {
    expect(sanitiseUserText('abcdef', 3)).toBe('abc');
  });

  it('returns an empty string for control-only / whitespace-only input', () => {
    expect(sanitiseUserText(`  ${NUL}  `, 100)).toBe('');
  });
});
