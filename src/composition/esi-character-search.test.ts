import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkedCharacter } from '@/platform/auth/linked-characters';
import { firstScopedSearch } from './esi-character-search';

const h = vi.hoisted(() => ({
  getFreshAccessTokenForCharacter: vi.fn(),
  esiFetch: vi.fn(),
}));

vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: (...args: unknown[]) => h.getFreshAccessTokenForCharacter(...args),
}));
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(),
}));
vi.mock('@/data/esi-store', async () => {
  const { passThroughStub } = await import('@/data/esi-store/__tests__/pass-through-stub');
  return passThroughStub((...args) => h.esiFetch(...args));
});

const pilot = (characterId: number): LinkedCharacter => ({
  characterId,
  name: `Pilot ${characterId}`,
  portraitUrl: `https://images.test/${characterId}`,
  scope: 'esi-search.search_structures.v1',
  hasRefreshToken: true,
  linkedAt: new Date('2026-08-01T00:00:00Z'),
  corporationId: null,
  allianceId: null,
  affiliationRefreshedAt: null,
});

/** Each character's search answers with `statuses[characterId]`, or 200 with its own id as the hit. */
function searchAnswers(statuses: Record<number, number> = {}) {
  h.esiFetch.mockImplementation(async (url: string) => {
    const characterId = Number(/characters\/(\d+)\/search/.exec(url)?.[1]);
    const status = statuses[characterId];
    return status === undefined
      ? Response.json({ character: [characterId * 10] })
      : Response.json({ error: 'refused' }, { status });
  });
}

const searchedCharacters = () =>
  h.esiFetch.mock.calls.map(([url]) => Number(/characters\/(\d+)\/search/.exec(url as string)?.[1]));

beforeEach(() => {
  h.getFreshAccessTokenForCharacter
    .mockReset()
    .mockImplementation(async (characterId: number) => ({ kind: 'ok', accessToken: `tok-${characterId}` }));
  h.esiFetch.mockReset();
  searchAnswers();
});

describe('firstScopedSearch', () => {
  it('skips a character with no usable token and searches as the next one', async () => {
    h.getFreshAccessTokenForCharacter.mockResolvedValueOnce({ kind: 'reauth_required' });
    const result = await firstScopedSearch([pilot(1), pilot(2)], 'character', 'Pilot');
    expect(result).toEqual({ first: { accessToken: 'tok-2', ids: [20] }, remaining: [] });
    expect(searchedCharacters()).toEqual([2]);
    // A user is waiting on the search: the gate's interactive floor.
    expect(h.esiFetch.mock.calls[0]![2]).toEqual({ interactive: true });
  });

  it('skips a search ESI refuses and returns the characters after the first hit', async () => {
    searchAnswers({ 1: 401 });
    const third = pilot(3);
    const result = await firstScopedSearch([pilot(1), pilot(2), third], 'character', 'Pilot');
    expect(result.first).toEqual({ accessToken: 'tok-2', ids: [20] });
    expect(result.remaining).toEqual([third]);
    expect(searchedCharacters()).toEqual([1, 2]);
  });

  it('rethrows any other ESI failure without trying the next character', async () => {
    searchAnswers({ 1: 503 });
    await expect(firstScopedSearch([pilot(1), pilot(2)], 'character', 'Pilot')).rejects.toThrow(
      'Scoped ESI character search failed (503)',
    );
    expect(searchedCharacters()).toEqual([1]);
    expect(h.getFreshAccessTokenForCharacter).toHaveBeenCalledTimes(1);
  });

  it('rejects when every character is refused or has no usable token', async () => {
    searchAnswers({ 2: 403 });
    h.getFreshAccessTokenForCharacter.mockResolvedValueOnce({ kind: 'reauth_required' });
    await expect(firstScopedSearch([pilot(1), pilot(2)], 'structure', 'Azbel')).rejects.toThrow(
      'No scoped linked character has a usable ESI access token',
    );
    expect(searchedCharacters()).toEqual([2]);
  });

  it('rejects an already-aborted search before vending a token', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      firstScopedSearch([pilot(1)], 'character', 'Pilot', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
    expect(h.esiFetch).not.toHaveBeenCalled();
  });
});
