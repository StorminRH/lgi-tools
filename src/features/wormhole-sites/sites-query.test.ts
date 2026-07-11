import { describe, expect, it } from 'vitest';
import { parseSitesQuery } from './sites-query';

describe('parseSitesQuery', () => {
  it('parses absent params to no filters', () => {
    expect(parseSitesQuery(null, null)).toEqual({ ok: true, data: {} });
  });

  it('parses a valid type filter', () => {
    expect(parseSitesQuery('gas', null)).toEqual({ ok: true, data: { type: 'gas' } });
  });

  it('parses a valid class filter', () => {
    expect(parseSitesQuery(null, 'C5')).toEqual({ ok: true, data: { class: 'C5' } });
  });

  it('parses both filters together', () => {
    expect(parseSitesQuery('combat', 'C3')).toEqual({
      ok: true,
      data: { type: 'combat', class: 'C3' },
    });
  });

  it('formats an invalid type with the allowed values', () => {
    expect(parseSitesQuery('bogus', null)).toEqual({
      ok: false,
      error: { error: 'Invalid type. Must be one of: combat, gas, ore, relic, data' },
    });
  });

  it('formats an invalid class with the allowed values', () => {
    expect(parseSitesQuery(null, 'C9')).toEqual({
      ok: false,
      error: { error: 'Invalid class. Must be one of: C1, C2, C3, C4, C5, C6' },
    });
  });

  it('reports the first invalid field when both are invalid', () => {
    expect(parseSitesQuery('bogus', 'C9')).toEqual({
      ok: false,
      error: { error: 'Invalid type. Must be one of: combat, gas, ore, relic, data' },
    });
  });
});
