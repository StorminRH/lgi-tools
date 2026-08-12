import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  esiFetch: vi.fn(),
  getFreshAccessTokenForCharacter: vi.fn(),
  listLinkedCharacters: vi.fn(),
  logUsageEvent: vi.fn(),
  resolveEntityNamesStrict: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: (...args: unknown[]) => h.listLinkedCharacters(...args),
}));
vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: (...args: unknown[]) =>
    h.getFreshAccessTokenForCharacter(...args),
}));
vi.mock('@/platform/esi', () => ({
  esiFetch: (...args: unknown[]) => h.esiFetch(...args),
  esiUrl: (path: string) => `https://esi.test${path}`,
}));
vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNamesStrict: (...args: unknown[]) => h.resolveEntityNamesStrict(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));
vi.mock('next/server', () => ({ after: (work: () => unknown) => work() }));

import { POST } from './route';
import {
  MAX_CHARACTER_SEARCH_LENGTH,
  MIN_CHARACTER_SEARCH_LENGTH,
} from '@/data/maps/api-contract';

const SCOPED_CHARACTER = {
  characterId: 90000001,
  name: 'Linked Pilot',
  portraitUrl: 'https://images.evetech.net/characters/90000001/portrait?size=64',
  scope: 'publicData,esi-search.search_structures.v1',
  hasRefreshToken: true,
  linkedAt: new Date('2026-08-01T00:00:00Z'),
  corporationId: null,
  affiliationRefreshedAt: null,
};

function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/maps/search-characters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.esiFetch.mockReset();
  h.getFreshAccessTokenForCharacter
    .mockReset()
    .mockResolvedValue({ kind: 'ok', accessToken: 'scoped-token' });
  h.listLinkedCharacters.mockReset().mockResolvedValue([SCOPED_CHARACTER]);
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  h.resolveEntityNamesStrict.mockReset().mockResolvedValue({
    '196379789': 'Chribba',
    '2112625428': 'Chribba Prime',
  });
});

describe('POST /api/maps/search-characters', () => {
  it('uses one owned scoped token for typeahead and resolves result names', async () => {
    h.esiFetch.mockResolvedValueOnce(
      jsonResponse({ character: [196379789, 2112625428] }),
    );

    const response = await POST(request({ search: '  Chribba  ' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'typeahead',
      results: [
        {
          characterId: 196379789,
          name: 'Chribba',
          portraitUrl:
            'https://images.evetech.net/characters/196379789/portrait?size=64',
        },
        {
          characterId: 2112625428,
          name: 'Chribba Prime',
          portraitUrl:
            'https://images.evetech.net/characters/2112625428/portrait?size=64',
        },
      ],
    });
    expect(h.listLinkedCharacters).toHaveBeenCalledWith('user-1');
    expect(h.getFreshAccessTokenForCharacter).toHaveBeenCalledWith(90000001);
    const [url, init] = h.esiFetch.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/characters/90000001/search/');
    expect(parsed.searchParams.get('categories')).toBe('character');
    expect(parsed.searchParams.get('search')).toBe('Chribba');
    expect(parsed.searchParams.get('strict')).toBe('false');
    expect(init.headers).toEqual({ Authorization: 'Bearer scoped-token' });
    expect(h.resolveEntityNamesStrict).toHaveBeenCalledWith([196379789, 2112625428]);
  });

  it('uses the public exact-name fallback only when no linked token carries the scope', async () => {
    h.listLinkedCharacters.mockResolvedValueOnce([
      { ...SCOPED_CHARACTER, scope: 'publicData' },
    ]);
    h.esiFetch.mockResolvedValueOnce(
      jsonResponse({ characters: [{ id: 196379789, name: 'Chribba' }] }),
    );

    const response = await POST(request({ search: 'Chribba' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'exact',
      results: [
        {
          characterId: 196379789,
          name: 'Chribba',
          portraitUrl:
            'https://images.evetech.net/characters/196379789/portrait?size=64',
        },
      ],
    });
    expect(h.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
    expect(h.resolveEntityNamesStrict).not.toHaveBeenCalled();
    expect(h.esiFetch).toHaveBeenCalledWith('https://esi.test/universe/ids/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(['Chribba']),
    });
  });

  it('preserves submitted casing and accepts the exact resolver canonical character name', async () => {
    h.listLinkedCharacters.mockResolvedValueOnce([]);
    h.esiFetch.mockResolvedValueOnce(
      jsonResponse({
        characters: [{ id: 196379789, name: 'Chribba' }],
        corporations: [{ id: 1, name: 'chribba' }],
      }),
    );

    const response = await POST(request({ search: 'chribba' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'exact',
      results: [
        {
          characterId: 196379789,
          name: 'Chribba',
          portraitUrl:
            'https://images.evetech.net/characters/196379789/portrait?size=64',
        },
      ],
    });
    expect(h.esiFetch.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify(['chribba']),
    });
  });

  it('rejects short, oversized, and extra-key input before auth-owned search work', async () => {
    for (const body of [
      { search: 'x'.repeat(MIN_CHARACTER_SEARCH_LENGTH - 1) },
      { search: 'x'.repeat(MAX_CHARACTER_SEARCH_LENGTH + 1) },
      { search: 'Chribba', extra: true },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(h.listLinkedCharacters).not.toHaveBeenCalled();
    expect(h.esiFetch).not.toHaveBeenCalled();
  });

  it('returns the declared unavailable problem instead of silently falling back on scoped failure', async () => {
    h.esiFetch.mockResolvedValueOnce(jsonResponse({ error: 'down' }, 503));

    const response = await POST(request({ search: 'Chribba' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'character_search_unavailable',
    });
    expect(h.esiFetch).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable when scoped result names cannot be resolved completely', async () => {
    h.esiFetch.mockResolvedValueOnce(jsonResponse({ character: [196379789] }));
    h.resolveEntityNamesStrict.mockRejectedValueOnce(new Error('names unavailable'));

    const response = await POST(request({ search: 'Chribba' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'character_search_unavailable',
    });
    expect(h.esiFetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when scoped accounts exist but none can vend a usable token', async () => {
    h.getFreshAccessTokenForCharacter.mockResolvedValueOnce({
      kind: 'upstream_error',
    });

    const response = await POST(request({ search: 'Chribba' }));

    expect(response.status).toBe(503);
    expect(h.esiFetch).not.toHaveBeenCalled();
  });

  it('rejects anonymous callers before reading or searching ESI', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });

    expect((await POST(request({ search: 'Chribba' }))).status).toBe(401);
    expect(h.listLinkedCharacters).not.toHaveBeenCalled();
    expect(h.esiFetch).not.toHaveBeenCalled();
  });
});
