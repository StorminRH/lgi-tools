import { describe, expect, it } from 'vitest';
import { toDateStr } from './queries';

describe('toDateStr', () => {
  it('formats a date as a YYYY-MM-DD string', () => {
    expect(toDateStr(new Date('2026-06-04T12:34:56Z'))).toBe('2026-06-04');
  });

  it('uses UTC (not local time) at the day boundary so range bounds are stable', () => {
    expect(toDateStr(new Date('2026-06-04T23:59:59Z'))).toBe('2026-06-04');
    expect(toDateStr(new Date('2026-06-05T00:00:00Z'))).toBe('2026-06-05');
  });
});
