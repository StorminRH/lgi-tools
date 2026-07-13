import { describe, expect, it } from 'vitest';
import { isIsoCalendarDate } from './iso-date';

describe('isIsoCalendarDate', () => {
  it('accepts real calendar dates, including leap day', () => {
    expect(isIsoCalendarDate('2026-07-13')).toBe(true);
    expect(isIsoCalendarDate('2024-02-29')).toBe(true);
  });

  it('rejects impossible dates and non-ISO shapes', () => {
    expect(isIsoCalendarDate('2026-02-30')).toBe(false);
    expect(isIsoCalendarDate('2025-02-29')).toBe(false);
    expect(isIsoCalendarDate('2026-7-13')).toBe(false);
    expect(isIsoCalendarDate('not-a-date')).toBe(false);
  });
});
