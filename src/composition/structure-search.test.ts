import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listLinkedCharacters: vi.fn(),
  getFreshAccessTokenForCharacter: vi.fn(),
  esiFetch: vi.fn(),
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: (...args: unknown[]) => h.listLinkedCharacters(...args),
}));
vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: (...args: unknown[]) => h.getFreshAccessTokenForCharacter(...args),
}));
vi.mock('@/platform/esi', () => ({
  esiUrl: (path: string) => `https://esi.test${path}`,
  esiFetch: (...args: unknown[]) => h.esiFetch(...args),
}));

import { searchUpwellStructures } from './structure-search';

const BOTH_SCOPES = 'esi-search.search_structures.v1 esi-universe.read_structures.v1';
const pilot = (characterId: number, scope: string) => ({
  characterId,
  scope,
  hasRefreshToken: true,
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** ESI stand-in: search returns ids; each structure read answers per `structures`. */
function esiAnswers(ids: number[], structures: Record<number, { status: number; body?: unknown }>) {
  h.esiFetch.mockImplementation(async (url: string) => {
    if (url.includes('/search/')) return json(200, { structure: ids });
    const id = Number(/structures\/(\d+)\//.exec(url)?.[1]);
    const answer = structures[id] ?? { status: 404 };
    return json(answer.status, answer.body ?? { error: 'nope' });
  });
}

beforeEach(() => {
  h.listLinkedCharacters.mockReset().mockResolvedValue([pilot(9001, BOTH_SCOPES)]);
  h.getFreshAccessTokenForCharacter.mockReset().mockResolvedValue({ kind: 'ok', accessToken: 'tok' });
  h.esiFetch.mockReset();
});

describe('searchUpwellStructures', () => {
  it('searches the structure category with the character token and resolves each hit', async () => {
    esiAnswers([1_035_000_000_001], {
      1_035_000_000_001: {
        status: 200,
        body: { name: 'Sobaseki - Industry Azbel', solar_system_id: 30001363, type_id: 35826, owner_id: 1 },
      },
    });
    const results = await searchUpwellStructures('user-1', 'Sobaseki');
    expect(results).toEqual([
      { structureId: 1_035_000_000_001, name: 'Sobaseki - Industry Azbel', systemId: 30001363, structureTypeId: 35826 },
    ]);
    const [searchUrl, init] = h.esiFetch.mock.calls[0]!;
    expect(searchUrl).toBe('https://esi.test/characters/9001/search/?categories=structure&search=Sobaseki&strict=false');
    expect(init).toEqual({ headers: { Authorization: 'Bearer tok' } });
  });

  it('drops structures ESI refuses (not on the access list) and keeps a missing type as null', async () => {
    esiAnswers([1, 2], {
      1: { status: 403 },
      2: { status: 200, body: { name: 'Typeless', solar_system_id: 30000142 } },
    });
    expect(await searchUpwellStructures('user-1', 'any')).toEqual([
      { structureId: 2, name: 'Typeless', systemId: 30000142, structureTypeId: null },
    ]);
  });

  it('returns nothing without calling ESI when no character holds both scopes', async () => {
    h.listLinkedCharacters.mockResolvedValue([pilot(9001, 'esi-search.search_structures.v1')]);
    expect(await searchUpwellStructures('user-1', 'any')).toEqual([]);
    expect(h.esiFetch).not.toHaveBeenCalled();
  });

  it('skips a character whose token cannot be refreshed', async () => {
    h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES)]);
    h.getFreshAccessTokenForCharacter
      .mockResolvedValueOnce({ kind: 'reauth_required' })
      .mockResolvedValueOnce({ kind: 'ok', accessToken: 'tok-2' });
    esiAnswers([], {});
    expect(await searchUpwellStructures('user-1', 'any')).toEqual([]);
    expect(h.esiFetch.mock.calls.map(([url]) => url as string)).toEqual([
      expect.stringContaining('/characters/2/search/'),
    ]);
  });

  it('searches with every scoped character and merges what each can see, once per structure', async () => {
    h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES)]);
    h.getFreshAccessTokenForCharacter.mockImplementation(async (id: number) => ({ kind: 'ok', accessToken: `tok-${id}` }));
    const seen: Record<string, number[]> = { 'tok-1': [10, 30], 'tok-2': [20, 30] };
    h.esiFetch.mockImplementation(async (url: string, init: { headers: { Authorization: string } }) => {
      const token = init.headers.Authorization.replace('Bearer ', '');
      if (url.includes('/search/')) return json(200, { structure: seen[token] });
      const id = Number(/structures\/(\d+)\//.exec(url)?.[1]);
      return json(200, { name: `S${id}`, solar_system_id: 30000142, type_id: 35825 });
    });
    const results = await searchUpwellStructures('user-1', 'any');
    expect(results.map((r) => r.structureId)).toEqual([10, 30, 20]);
  });

  it('throws when no scoped character has a usable token', async () => {
    h.getFreshAccessTokenForCharacter.mockResolvedValue({ kind: 'reauth_required' });
    await expect(searchUpwellStructures('user-1', 'any')).rejects.toThrow('usable ESI access token');
  });

  it('throws when ESI search fails or returns a malformed body', async () => {
    h.esiFetch.mockResolvedValueOnce(json(502, {}));
    await expect(searchUpwellStructures('user-1', 'any')).rejects.toThrow('(502)');
    h.esiFetch.mockResolvedValueOnce(json(200, { structure: 'nope' }));
    await expect(searchUpwellStructures('user-1', 'any')).rejects.toThrow('invalid body');
  });

  it('asks ESI for at most eight structures', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    esiAnswers(ids, {});
    await searchUpwellStructures('user-1', 'any');
    expect(h.esiFetch).toHaveBeenCalledTimes(1 + 8);
  });
});
