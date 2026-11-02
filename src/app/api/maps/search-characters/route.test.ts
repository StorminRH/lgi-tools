import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  esiFetch: vi.fn(),
  getFreshAccessTokenForCharacter: vi.fn(),
  listLinkedCharacters: vi.fn(),
  resolveEntityNamesStrict: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: (...args: unknown[]) => h.listLinkedCharacters(...args),
}));
vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: (...args: unknown[]) =>
    h.getFreshAccessTokenForCharacter(...args),
}));
vi.mock('@/data/esi-store', async () => {
  const { passThroughStub } = await import('@/data/esi-store/__tests__/pass-through-stub');
  return passThroughStub((...args) => h.esiFetch(...args));
});
vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNamesStrict: (...args: unknown[]) => h.resolveEntityNamesStrict(...args),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (work: () => unknown) => work(),
}));

import { postJson } from '@/lib/__tests__/route-requests';
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

const ROUTE = '/api/maps/search-characters';

const PORTRAIT = (id: number) => `https://images.evetech.net/characters/${id}/portrait?size=64`;

function resetMocks() {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.esiFetch.mockReset();
  h.getFreshAccessTokenForCharacter
    .mockReset()
    .mockResolvedValue({ kind: 'ok', accessToken: 'scoped-token', expiresAt: 1 });
  h.listLinkedCharacters.mockReset().mockResolvedValue([SCOPED_CHARACTER]);
  h.resolveEntityNamesStrict.mockReset().mockResolvedValue({
    '196379789': 'Chribba',
    '2112625428': 'Chribba Prime',
  });
}

test('POST /api/maps/search-characters uses one owned scoped token for typeahead and resolves result names', async () => {
  resetMocks();
  h.esiFetch.mockResolvedValueOnce(
    Response.json({ character: [196379789, 2112625428] }),
  );

  const request = postJson(ROUTE, { search: '  Chribba  ' });
  const response = await POST(request);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    mode: 'typeahead',
    results: [
      { characterId: 196379789, name: 'Chribba', portraitUrl: PORTRAIT(196379789) },
      { characterId: 2112625428, name: 'Chribba Prime', portraitUrl: PORTRAIT(2112625428) },
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
  expect(init.signal).toBe(request.signal);
  // A user is waiting on the typeahead: the search and its names take the gate's interactive floor.
  expect(h.esiFetch.mock.calls[0]![2]).toEqual({ interactive: true });
  expect(h.resolveEntityNamesStrict).toHaveBeenCalledWith([196379789, 2112625428], { interactive: true });
});

test('POST /api/maps/search-characters uses the public exact-name fallback only when no linked token carries the scope, keeping the submitted casing', async () => {
  // A linked character without the search scope.
  resetMocks();
  h.listLinkedCharacters.mockResolvedValueOnce([
    { ...SCOPED_CHARACTER, scope: 'publicData' },
  ]);
  h.esiFetch.mockResolvedValueOnce(
    Response.json({ characters: [{ id: 196379789, name: 'Chribba' }] }),
  );

  const unscoped = await POST(postJson(ROUTE, { search: 'Chribba' }));

  expect(unscoped.status).toBe(200);
  expect(await unscoped.json()).toEqual({
    mode: 'exact',
    results: [{ characterId: 196379789, name: 'Chribba', portraitUrl: PORTRAIT(196379789) }],
  });
  expect(h.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
  expect(h.resolveEntityNamesStrict).not.toHaveBeenCalled();
  expect(h.esiFetch).toHaveBeenCalledWith('https://esi.test/universe/ids/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(['Chribba']),
  }, { interactive: true });

  // No linked characters: the submitted casing goes to ESI, and the canonical character name comes back.
  resetMocks();
  h.listLinkedCharacters.mockResolvedValueOnce([]);
  h.esiFetch.mockResolvedValueOnce(
    Response.json({
      characters: [{ id: 196379789, name: 'Chribba' }],
      corporations: [{ id: 1, name: 'chribba' }],
    }),
  );

  const unlinked = await POST(postJson(ROUTE, { search: 'chribba' }));

  expect(unlinked.status).toBe(200);
  expect(await unlinked.json()).toEqual({
    mode: 'exact',
    results: [{ characterId: 196379789, name: 'Chribba', portraitUrl: PORTRAIT(196379789) }],
  });
  expect(h.esiFetch.mock.calls[0]?.[1]).toMatchObject({
    body: JSON.stringify(['chribba']),
  });
});

test('POST /api/maps/search-characters returns the declared unavailable problem, never the exact-name fallback, when a scoped search fails', async () => {
  // ESI fails the scoped search.
  resetMocks();
  h.esiFetch.mockResolvedValueOnce(Response.json({ error: 'down' }, { status: 503 }));
  const esiDown = await POST(postJson(ROUTE, { search: 'Chribba' }));
  expect(esiDown.status).toBe(503);
  expect(await esiDown.json()).toMatchObject({ code: 'character_search_unavailable' });
  expect(h.esiFetch).toHaveBeenCalledTimes(1);

  // The scoped search works but its result names cannot be resolved completely.
  resetMocks();
  h.esiFetch.mockResolvedValueOnce(Response.json({ character: [196379789] }));
  h.resolveEntityNamesStrict.mockRejectedValueOnce(new Error('names unavailable'));
  const namesDown = await POST(postJson(ROUTE, { search: 'Chribba' }));
  expect(namesDown.status).toBe(503);
  expect(await namesDown.json()).toMatchObject({ code: 'character_search_unavailable' });
  expect(h.esiFetch).toHaveBeenCalledTimes(1);

  // A scoped character exists but cannot vend a usable token.
  resetMocks();
  h.getFreshAccessTokenForCharacter.mockResolvedValueOnce({ kind: 'upstream_error' });
  const noToken = await POST(postJson(ROUTE, { search: 'Chribba' }));
  expect(noToken.status).toBe(503);
  expect(h.esiFetch).not.toHaveBeenCalled();

  // ESI refuses every scoped character's search.
  resetMocks();
  h.listLinkedCharacters.mockResolvedValueOnce([
    SCOPED_CHARACTER,
    { ...SCOPED_CHARACTER, characterId: 90000002, name: 'Alt Pilot' },
  ]);
  h.esiFetch.mockImplementation(async () =>
    Response.json({ error: 'forbidden' }, { status: 403 }),
  );
  const refused = await POST(postJson(ROUTE, { search: 'Chribba' }));
  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({ code: 'character_search_unavailable' });
  expect(h.esiFetch.mock.calls.map(([url]) => new URL(url as string).pathname)).toEqual([
    '/characters/90000001/search/',
    '/characters/90000002/search/',
  ]);
  expect(h.resolveEntityNamesStrict).not.toHaveBeenCalled();
});

test('POST /api/maps/search-characters rejects anonymous callers and bad input before reading or searching ESI', async () => {
  resetMocks();
  h.checkUserId.mockResolvedValueOnce({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  expect((await POST(postJson(ROUTE, { search: 'Chribba' }))).status).toBe(401);

  for (const body of [
    { search: 'x'.repeat(MIN_CHARACTER_SEARCH_LENGTH - 1) },
    { search: 'x'.repeat(MAX_CHARACTER_SEARCH_LENGTH + 1) },
    { search: 'Chribba', extra: true },
  ]) {
    expect((await POST(postJson(ROUTE, body))).status).toBe(400);
  }
  expect(h.listLinkedCharacters).not.toHaveBeenCalled();
  expect(h.esiFetch).not.toHaveBeenCalled();
});
