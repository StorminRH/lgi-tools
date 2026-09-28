import { describe, expect, it, test } from 'vitest';
import { BOARD_GAPS, boardCharacterSchema, boardEndpoint, boardResponseSchema } from './api-contract';

test('the board is one GET and a closed reconnect-gap vocabulary', () => {
  expect(boardEndpoint.method).toBe('GET');
  expect(boardEndpoint.path).toBe('/api/account/board');
  expect(boardEndpoint.request).toBeNull();
  expect(Object.keys(boardEndpoint.responses)).toEqual(['200']);
  expect([...BOARD_GAPS]).toEqual(['skills', 'location', 'wallet', 'clones', 'implants', 'structures', 'industry', 'orders', 'assets']);
});

describe('boardResponseSchema', () => {
  it('accepts an empty board with a catalog', () => {
    const empty = { characters: [], skillCatalog: [], history: [] };
    expect(boardResponseSchema.parse(empty)).toEqual(empty);
  });

  const section = { state: 'pending' } as const;
  const minimal = {
    characterId: 1,
    name: 'x',
    portraitUrl: 'https://example.invalid/p',
    corporation: null,
    alliance: null,
    gaps: [],
    skills: section,
    profile: section,
    status: section,
    attributes: section,
    implants: section,
    clones: section,
    wallet: section,
    journal: section,
    industry: section,
    netWorth: section,
  };

  it('accepts pending and reconnect sections without data', () => {
    expect(boardCharacterSchema.safeParse(minimal).success).toBe(true);
    expect(boardCharacterSchema.safeParse({ ...minimal, wallet: { state: 'reconnect' } }).success).toBe(true);
  });

  it('rejects a ready section without data and an unknown state', () => {
    expect(boardCharacterSchema.safeParse({ ...minimal, wallet: { state: 'ready', refreshedAt: 1 } }).success).toBe(false);
    expect(boardCharacterSchema.safeParse({ ...minimal, wallet: { state: 'stale' } }).success).toBe(false);
  });

  it('accepts a ready net worth and a history day, and rejects a malformed day', () => {
    const netWorth = {
      state: 'ready',
      refreshedAt: 1,
      data: { total: 6, liquid: 1, assets: 2, sellOrders: 1, buyEscrow: 1, implants: 1 },
    };
    expect(boardCharacterSchema.safeParse({ ...minimal, netWorth }).success).toBe(true);
    const day = { day: '2026-09-27', netWorth: 6, liquidIsk: 1, included: 1, total: 2, pilots: { '1': { netWorth: 6, liquidIsk: 1 } } };
    expect(boardResponseSchema.safeParse({ characters: [], skillCatalog: [], history: [day] }).success).toBe(true);
    expect(boardResponseSchema.safeParse({ characters: [], skillCatalog: [], history: [{ ...day, day: '27/09/2026' }] }).success).toBe(false);
  });

  it('rejects a skill level outside 0..5 and an unlisted gap', () => {
    const skills = {
      state: 'ready',
      refreshedAt: 1,
      data: { totalSp: 1, unallocatedSp: null, queue: [], levels: { '3327': 6 }, known: 1, atV: 0 },
    };
    expect(boardCharacterSchema.safeParse({ ...minimal, skills }).success).toBe(false);
    expect(boardCharacterSchema.safeParse({ ...minimal, gaps: ['mail'] }).success).toBe(false);
  });
});
