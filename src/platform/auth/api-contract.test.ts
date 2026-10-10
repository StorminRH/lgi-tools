import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  eveTokenEndpoint,
  eveTokenRequestSchema,
  sanitiseAdminAccessQuery,
  type EveTokenOkResponse,
} from './api-contract';

describe('eve-token contract', () => {
  it('pins the 200 response shape Convex imports', () => {
    expectTypeOf<EveTokenOkResponse>().toEqualTypeOf<{
      accessToken: string;
      expiresAt: number;
    }>();
  });

  it('pins the internal endpoint and its closed statuses', () => {
    expect(Object.keys(eveTokenEndpoint.responses).map(Number)).toEqual([
      200, 400, 401, 404, 409, 500, 502,
    ]);
  });

  it('accepts an owning user id and positive integer characterId', () => {
    expect(eveTokenRequestSchema.safeParse({
      userId: 'eve-user-2117053828',
      characterId: 2117053828,
    }).success).toBe(true);
  });

  it('rejects missing or malformed ownership identifiers', () => {
    expect(eveTokenRequestSchema.safeParse({}).success).toBe(false);
    expect(eveTokenRequestSchema.safeParse({ userId: '', characterId: 123 }).success).toBe(false);
    expect(eveTokenRequestSchema.safeParse({ userId: 'user 1', characterId: 123 }).success).toBe(false);
    expect(eveTokenRequestSchema.safeParse({ userId: 'user-1', characterId: 1.5 }).success).toBe(false);
    expect(eveTokenRequestSchema.safeParse({ userId: 'user-1', characterId: 0 }).success).toBe(false);
    expect(eveTokenRequestSchema.safeParse({ userId: 'user-1', characterId: '123' }).success).toBe(false);
  });
});

describe('sanitiseAdminAccessQuery', () => {
  it('drops control characters, trims, and caps the text at 200 characters', () => {
    expect(sanitiseAdminAccessQuery('  Pilot\u0007 ')).toBe('Pilot');
    expect(sanitiseAdminAccessQuery('x'.repeat(250))).toBe('x'.repeat(200));
  });

  it('reads blank, absent, and repeated (?q=a&q=b) queries as no query', () => {
    expect(sanitiseAdminAccessQuery('   ')).toBeUndefined();
    expect(sanitiseAdminAccessQuery('\u0007')).toBeUndefined();
    expect(sanitiseAdminAccessQuery(undefined)).toBeUndefined();
    expect(sanitiseAdminAccessQuery(['a', 'b'])).toBeUndefined();
  });
});
