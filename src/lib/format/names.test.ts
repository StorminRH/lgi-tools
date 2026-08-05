import { describe, expect, it } from 'vitest';
import { initials } from './names';

describe('initials', () => {
  it('builds a two-letter monogram from words or a single token', () => {
    expect(initials('John Doe')).toBe('JD');
    expect(initials('mary jane watson')).toBe('MJ');
    expect(initials('Cyrus')).toBe('CY');
    expect(initials('  Anne   Bell  ')).toBe('AB');
    expect(initials('x')).toBe('X');
  });
});
