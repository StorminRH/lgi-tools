import { describe, expect, it } from 'vitest';
import { parseSitesQuery } from './sites-query';

// The parser now consumes the request's URLSearchParams and reads exactly the
// keys the endpoint's query schema declares; the 400 detail strings are
// byte-identical to the hand-read signature they replaced.
const query = (params: Record<string, string> = {}) => new URLSearchParams(params);

describe('parseSitesQuery', () => {
  it('parses absent params to no filters', () => {
    expect(parseSitesQuery(query())).toEqual({ ok: true, data: {} });
  });

  it('parses a valid type filter', () => {
    expect(parseSitesQuery(query({ type: 'gas' }))).toEqual({
      ok: true,
      data: { type: 'gas' },
    });
  });

  it('parses a valid class filter', () => {
    expect(parseSitesQuery(query({ class: 'C5' }))).toEqual({
      ok: true,
      data: { class: 'C5' },
    });
  });

  it('parses both filters together', () => {
    expect(parseSitesQuery(query({ type: 'combat', class: 'C3' }))).toEqual({
      ok: true,
      data: { type: 'combat', class: 'C3' },
    });
  });

  it('ignores query parameters the endpoint never declared', () => {
    expect(parseSitesQuery(query({ type: 'gas', sort: 'name' }))).toEqual({
      ok: true,
      data: { type: 'gas' },
    });
  });

  it('formats an invalid type with the allowed values', () => {
    expect(parseSitesQuery(query({ type: 'bogus' }))).toEqual({
      ok: false,
      failure: {
        category: 'validation',
        code: 'invalid_query',
        detail: 'Invalid type. Must be one of: combat, gas, ore, relic, data',
      },
    });
  });

  it('formats an invalid class with the allowed values', () => {
    expect(parseSitesQuery(query({ class: 'C9' }))).toEqual({
      ok: false,
      failure: {
        category: 'validation',
        code: 'invalid_query',
        detail: 'Invalid class. Must be one of: C1, C2, C3, C4, C5, C6',
      },
    });
  });

  it('reports the first invalid field when both are invalid', () => {
    expect(parseSitesQuery(query({ type: 'bogus', class: 'C9' }))).toEqual({
      ok: false,
      failure: {
        category: 'validation',
        code: 'invalid_query',
        detail: 'Invalid type. Must be one of: combat, gas, ore, relic, data',
      },
    });
  });
});
