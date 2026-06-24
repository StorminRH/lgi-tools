import { describe, expect, it } from 'vitest';
import { initials } from './names';

describe('initials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(initials('John Doe')).toBe('JD');
    expect(initials('mary jane watson')).toBe('MJ');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(initials('Cyrus')).toBe('CY');
  });

  it('trims and collapses surrounding / inner whitespace', () => {
    expect(initials('  Anne   Bell  ')).toBe('AB');
  });

  it('uppercases a one-character token', () => {
    expect(initials('x')).toBe('X');
  });
});
