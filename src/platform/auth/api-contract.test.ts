import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  eveCharactersEndpoint,
  eveTokenEndpoint,
  eveTokenRequestSchema,
  type EveTokenOkResponse,
} from './api-contract';

describe('eve-token contract', () => {
  it('pins the 200 response shape Convex imports', () => {
    expectTypeOf<EveTokenOkResponse>().toEqualTypeOf<{
      accessToken: string;
      expiresAt: number;
    }>();
  });

  it('pins the internal endpoints and their closed statuses', () => {
    expect(Object.keys(eveTokenEndpoint.responses).map(Number)).toEqual([
      200, 400, 401, 404, 409, 500, 502,
    ]);
    expect(Object.keys(eveCharactersEndpoint.responses).map(Number)).toEqual([
      200, 400, 401, 500,
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
