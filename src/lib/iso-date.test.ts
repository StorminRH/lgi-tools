import { expect, test, vi } from 'vitest';
import {
  daysBefore,
  isIsoCalendarDate,
  isoDay,
  isoDayFromNumber,
  isoDayNumber,
  isoDayStartMs,
  isUtcWeekend,
} from './iso-date';

test('isoDay names the UTC calendar day of a Date or epoch ms at both edges of the day', () => {
  expect(isoDay(new Date('2026-06-04T12:34:56Z'))).toBe('2026-06-04');
  expect(isoDay(new Date('2026-06-04T23:59:59.999Z'))).toBe('2026-06-04');
  expect(isoDay(new Date('2026-06-05T00:00:00Z'))).toBe('2026-06-05');
  expect(isoDay(new Date('2026-01-02T01:30:00+02:00'))).toBe('2026-01-01');
  expect(isoDay(Date.parse('2026-09-27T23:59:59Z'))).toBe('2026-09-27');
  expect(isoDay(0)).toBe('1970-01-01');
  expect(() => isoDay(new Date('not a date'))).toThrow(RangeError);
});

test('day starts and day numbers round-trip through UTC midnight and step one per calendar day', () => {
  expect(isoDayStartMs('2026-07-13')).toBe(Date.UTC(2026, 6, 13));
  expect(isoDayNumber('1970-01-01')).toBe(0);
  expect(isoDayNumber('1969-12-31')).toBe(-1);
  expect(isoDayNumber('2026-07-13')).toBe(20_647);
  expect(isoDayFromNumber(20_647)).toBe('2026-07-13');
  for (const day of ['2025-01-01', '2026-07-13', '2024-02-29', '1969-12-31']) {
    expect(isoDayFromNumber(isoDayNumber(day))).toBe(day);
  }
  expect(isoDayNumber('2026-07-13') - isoDayNumber('2026-07-12')).toBe(1);
  expect(isoDayNumber('2026-03-01') - isoDayNumber('2026-02-28')).toBe(1);
  expect(isoDayNumber('2024-03-01') - isoDayNumber('2024-02-28')).toBe(2);

  expect(isoDayStartMs('not-a-date')).toBeNaN();
  expect(isoDayStartMs('')).toBeNaN();
  expect(isoDayNumber('2026-13-01')).toBeNaN();
});

test('isUtcWeekend flags Saturday and Sunday only, and never an unparsable day', () => {
  expect(isUtcWeekend('2026-07-10')).toBe(false);
  expect(isUtcWeekend('2026-07-11')).toBe(true);
  expect(isUtcWeekend('2026-07-12')).toBe(true);
  expect(isUtcWeekend('2026-07-13')).toBe(false);
  expect(isUtcWeekend('not-a-date')).toBe(false);
});

test('daysBefore steps back whole 24-hour days from the same instant without moving it', () => {
  const now = new Date('2026-05-25T12:00:00Z');
  expect(daysBefore(now, 1).toISOString()).toBe('2026-05-24T12:00:00.000Z');
  expect(daysBefore(now, 7).toISOString()).toBe('2026-05-18T12:00:00.000Z');
  expect(daysBefore(now, 30).toISOString()).toBe('2026-04-25T12:00:00.000Z');
  expect(daysBefore(now, 400).toISOString()).toBe('2025-04-20T12:00:00.000Z');
  expect(now.toISOString()).toBe('2026-05-25T12:00:00.000Z');
  expect(daysBefore(new Date(Number.NaN), 1).getTime()).toBeNaN();
});

test('isIsoCalendarDate accepts only real YYYY-MM-DD calendar days', () => {
  expect(isIsoCalendarDate('2024-02-29')).toBe(true);
  expect(isIsoCalendarDate('2026-07-13')).toBe(true);
  expect(isIsoCalendarDate('2026-02-29')).toBe(false);
  expect(isIsoCalendarDate('2026-04-31')).toBe(false);
  expect(isIsoCalendarDate('2026-13-01')).toBe(false);
  expect(isIsoCalendarDate('2026-7-13')).toBe(false);
  expect(isIsoCalendarDate('2026-07-13T00:00:00Z')).toBe(false);
});

test('the UTC day helpers ignore the host time zone', () => {
  vi.stubEnv('TZ', 'Pacific/Kiritimati');
  try {
    const lateEvening = new Date('2026-07-11T23:00:00Z');
    expect(lateEvening.getDate()).toBe(12);
    expect(isoDay(lateEvening)).toBe('2026-07-11');
    expect(isoDayStartMs('2026-07-11')).toBe(Date.UTC(2026, 6, 11));
    expect(isoDayNumber('2026-07-13')).toBe(20_647);
    expect(isUtcWeekend('2026-07-12')).toBe(true);
    expect(isUtcWeekend('2026-07-13')).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});
