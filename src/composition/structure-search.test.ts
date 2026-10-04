import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { searchUpwellStructures } from './structure-search';

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
vi.mock('@/platform/esi', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  esiUrl: (path: string) => `https://esi.test${path}`,
  esiFetch: (...args: unknown[]) => h.esiFetch(...args),
}));

const BOTH_SCOPES = 'esi-search.search_structures.v1 esi-universe.read_structures.v1';
const pilot = (characterId: number, scope: string, corporationId: number | null = null) => ({
  characterId,
  scope,
  hasRefreshToken: true,
  corporationId,
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

  describe('one valid search before parallel character searches', () => {
    const tokenOf = (init: { headers: { Authorization: string } }) => init.headers.Authorization.replace('Bearer ', '');
    /** Each token's search sees `seen[token]`, or fails with `failing[token]`; every structure reads unless `refused`. */
    function esiPerToken(seen: Record<string, number[]>, failing: Record<string, number> = {}, refused: string[] = []) {
      h.esiFetch.mockImplementation(async (url: string, init: { headers: { Authorization: string } }) => {
        const token = tokenOf(init);
        if (url.includes('/search/')) {
          return failing[token] ? json(failing[token]!, {}) : json(200, { structure: seen[token] ?? [] });
        }
        const id = Number(/structures\/(\d+)\//.exec(url)?.[1]);
        if (refused.includes(`${token}:${id}`)) return json(403, {});
        return json(200, { name: `S${id}`, solar_system_id: 30000142, type_id: 35825 });
      });
    }
    const searchesBy = () =>
      h.esiFetch.mock.calls
        .filter(([url]) => (url as string).includes('/search/'))
        .map(([url]) => Number(/characters\/(\d+)\//.exec(url as string)?.[1]));
    const readsOf = (id: number) =>
      h.esiFetch.mock.calls.filter(([url]) => (url as string).includes(`/structures/${id}/`)).length;

    beforeEach(() => {
      h.getFreshAccessTokenForCharacter.mockImplementation(async (id: number) => ({ kind: 'ok', accessToken: `tok-${id}` }));
    });

    it('searches all corp-mates because their individual access lists can differ', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES, 500), pilot(2, BOTH_SCOPES, 500), pilot(3, BOTH_SCOPES, 500)]);
      esiPerToken({ 'tok-1': [10], 'tok-2': [20], 'tok-3': [30] });
      expect((await searchUpwellStructures('user-1', 'any')).map((r) => r.structureId)).toEqual([10, 20, 30]);
      expect(searchesBy()).toEqual([1, 2, 3]);
    });

    it('each corporation searches, and a structure both see is read once', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES, 500), pilot(2, BOTH_SCOPES, 500), pilot(3, BOTH_SCOPES, 600)]);
      esiPerToken({ 'tok-1': [10, 30], 'tok-3': [30, 40] });
      expect((await searchUpwellStructures('user-1', 'any')).map((r) => r.structureId)).toEqual([10, 30, 40]);
      expect(searchesBy().sort()).toEqual([1, 2, 3]);
      expect(readsOf(30)).toBe(1);
    });

    it('keeps results when one remaining character search fails, without retrying it', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES), pilot(3, BOTH_SCOPES)]);
      esiPerToken({ 'tok-1': [], 'tok-3': [40] }, { 'tok-2': 502 });
      expect((await searchUpwellStructures('user-1', 'any')).map((r) => r.structureId)).toEqual([40]);
      expect(searchesBy()).toEqual([1, 2, 3]);
    });

    it.each([400, 502])('stops before fanout when the first search returns %i', async (status) => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES), pilot(3, BOTH_SCOPES)]);
      esiPerToken({}, { 'tok-1': status });
      await expect(searchUpwellStructures('user-1', 'any')).rejects.toThrow(`(${status})`);
      expect(searchesBy()).toEqual([1]);
    });

    it('does not admit the batch after a malformed successful response', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES)]);
      h.esiFetch.mockResolvedValue(json(200, { structure: 'invalid' }));
      await expect(searchUpwellStructures('user-1', 'any')).rejects.toThrow('invalid body');
      expect(searchesBy()).toEqual([1]);
    });

    it.each([401, 403])('tries the next character when the initial character is refused with %i', async (status) => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES), pilot(3, BOTH_SCOPES)]);
      esiPerToken({ 'tok-2': [], 'tok-3': [10] }, { 'tok-1': status });
      expect((await searchUpwellStructures('user-1', 'any')).map((r) => r.structureId)).toEqual([10]);
      expect(searchesBy()).toEqual([1, 2, 3]);
    });

    it('waits for the first valid response, then starts all 29 remaining searches together', async () => {
      h.listLinkedCharacters.mockResolvedValue(Array.from({ length: 30 }, (_, i) => pilot(i + 1, BOTH_SCOPES, 500)));
      const finish = new Map<number, (response: Response) => void>();
      h.esiFetch.mockImplementation((url: string) => {
        const id = Number(/characters\/(\d+)\//.exec(url)?.[1]);
        return new Promise<Response>((resolve) => finish.set(id, resolve));
      });
      const result = searchUpwellStructures('user-1', 'any');
      await vi.waitFor(() => expect(searchesBy()).toEqual([1]));
      expect(h.getFreshAccessTokenForCharacter).toHaveBeenCalledTimes(1);
      finish.get(1)!(json(200, { structure: [] }));
      await vi.waitFor(() => expect(searchesBy()).toEqual(Array.from({ length: 30 }, (_, i) => i + 1)));
      for (let id = 2; id <= 30; id++) finish.get(id)!(json(200, { structure: [] }));
      await expect(result).resolves.toEqual([]);
    });

    it('preserves a gateway budget refusal and does not start structure reads', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES)]);
      const error = new EsiBudgetExhaustedError(0, 'rate_limited', 60);
      h.esiFetch.mockResolvedValueOnce(json(200, { structure: [10] })).mockRejectedValueOnce(error);
      await expect(searchUpwellStructures('user-1', 'any')).rejects.toBe(error);
      expect(searchesBy()).toEqual([1, 2]);
      expect(readsOf(10)).toBe(0);
    });

    it('passes cancellation to search and detail reads', async () => {
      const controller = new AbortController();
      esiPerToken({ 'tok-9001': [10] });
      await searchUpwellStructures('user-1', 'any', controller.signal);
      expect(h.esiFetch.mock.calls).toHaveLength(2);
      for (const [, init] of h.esiFetch.mock.calls) expect(init.signal).toBe(controller.signal);
    });

    it('does not start remaining searches after cancellation during the initial check', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES), pilot(2, BOTH_SCOPES)]);
      const controller = new AbortController();
      h.esiFetch.mockImplementationOnce(async () => {
        controller.abort();
        return json(200, { structure: [] });
      });
      await expect(searchUpwellStructures('user-1', 'any', controller.signal)).rejects.toThrow();
      expect(searchesBy()).toEqual([1]);
    });

    it('a structure one token is refused is read with another that saw it', async () => {
      h.listLinkedCharacters.mockResolvedValue([pilot(1, BOTH_SCOPES, 500), pilot(3, BOTH_SCOPES, 600)]);
      esiPerToken({ 'tok-1': [30], 'tok-3': [30] }, {}, ['tok-1:30']);
      expect((await searchUpwellStructures('user-1', 'any')).map((r) => r.structureId)).toEqual([30]);
      expect(readsOf(30)).toBe(2);
    });
  });
});
