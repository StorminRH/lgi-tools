import { describe, expect, it } from 'vitest';
import { BOARD_GAPS, boardCharacterSchema, boardEndpoint, boardResponseSchema } from './api-contract';

describe('boardEndpoint', () => {
  it('is the one GET the board reads', () => {
    expect(boardEndpoint.method).toBe('GET');
    expect(boardEndpoint.path).toBe('/api/account/board');
    expect(boardEndpoint.request).toBeNull();
    expect(Object.keys(boardEndpoint.responses)).toEqual(['200']);
  });

  it('pins the closed reconnect-gap vocabulary', () => {
    expect([...BOARD_GAPS]).toEqual(['skills', 'location', 'wallet', 'clones', 'implants', 'structures', 'industry', 'orders']);
  });
});

describe('boardResponseSchema', () => {
  it('accepts an empty board with a catalog', () => {
    expect(boardResponseSchema.parse({ characters: [], skillCatalog: [] })).toEqual({ characters: [], skillCatalog: [] });
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
  };

  it('accepts pending and reconnect sections without data', () => {
    expect(boardCharacterSchema.safeParse(minimal).success).toBe(true);
    expect(boardCharacterSchema.safeParse({ ...minimal, wallet: { state: 'reconnect' } }).success).toBe(true);
  });

  it('rejects a ready section without data and an unknown state', () => {
    expect(boardCharacterSchema.safeParse({ ...minimal, wallet: { state: 'ready', refreshedAt: 1 } }).success).toBe(false);
    expect(boardCharacterSchema.safeParse({ ...minimal, wallet: { state: 'stale' } }).success).toBe(false);
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
