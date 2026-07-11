import { describe, it, expect } from 'vitest';
import { parseNumericRouteId } from './route-id';

describe('parseNumericRouteId', () => {
  it('parses a bare digit string', () => {
    expect(parseNumericRouteId('42')).toBe(42);
    expect(parseNumericRouteId('0')).toBe(0);
  });

  it('rejects non-digit and mixed input (never partial-parses "12abc" as 12)', () => {
    expect(parseNumericRouteId('12abc')).toBeNull();
    expect(parseNumericRouteId('abc')).toBeNull();
    expect(parseNumericRouteId('')).toBeNull();
    expect(parseNumericRouteId('1.5')).toBeNull();
    expect(parseNumericRouteId('-3')).toBeNull();
    expect(parseNumericRouteId(' 7')).toBeNull();
  });
});
