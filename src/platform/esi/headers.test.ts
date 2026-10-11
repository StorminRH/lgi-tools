import { expect, test } from 'vitest';
import { esiPageCount, httpDateMs, intHeader, parseIntOrNull } from './headers';

test('parseIntOrNull prefix-parses a base-10 integer and is null for a missing or non-numeric value', () => {
  expect(parseIntOrNull(null)).toBeNull();
  expect(parseIntOrNull('12')).toBe(12);
  expect(parseIntOrNull('12abc')).toBe(12);
  expect(parseIntOrNull('010')).toBe(10);
  expect(parseIntOrNull('x')).toBeNull();
  expect(parseIntOrNull('')).toBeNull();
});

test('intHeader parses the named header and is null when the answer lacks it', () => {
  const headers = new Headers({ 'X-ESI-Error-Limit-Remain': '87', 'Retry-After': 'soon' });

  expect(intHeader(headers, 'X-ESI-Error-Limit-Remain')).toBe(87);
  expect(intHeader(headers, 'Retry-After')).toBeNull();
  expect(intHeader(headers, 'X-ESI-Error-Limit-Reset')).toBeNull();
});

test('httpDateMs reads an HTTP-date as epoch ms and is null for garbage or a missing value', () => {
  expect(httpDateMs('Thu, 01 Jan 1970 00:00:00 GMT')).toBe(0);
  expect(httpDateMs('Mon, 15 Jun 2026 11:05:00 GMT')).toBe(Date.UTC(2026, 5, 15, 11, 5));
  expect(httpDateMs('not a date')).toBeNull();
  expect(httpDateMs(null)).toBeNull();
});

test('esiPageCount is one page when X-Pages is missing, zero or malformed, and the header otherwise', () => {
  expect(esiPageCount(new Headers())).toBe(1);
  expect(esiPageCount(new Headers({ 'X-Pages': '0' }))).toBe(1);
  expect(esiPageCount(new Headers({ 'X-Pages': 'abc' }))).toBe(1);
  expect(esiPageCount(new Headers({ 'X-Pages': '3' }))).toBe(3);
});
