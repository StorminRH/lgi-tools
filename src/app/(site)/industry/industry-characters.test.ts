import { BetterAuthError } from 'better-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
const listLinkedCharactersMock = vi.fn();

vi.mock('@/composition/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: (userId: string) => listLinkedCharactersMock(userId),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ cacheLife: () => {} }));

import { industryCharacters, jobCharacterIds } from './industry-characters';

const JOB_SCOPE = 'esi-industry.read_character_jobs.v1';
const CORP_SCOPES = 'esi-characters.read_corporation_roles.v1 esi-industry.read_corporation_jobs.v1';

const linked = (characterId: number, scope: string, hasRefreshToken = true) => ({
  characterId,
  name: `Pilot ${characterId}`,
  portraitUrl: `p/${characterId}`,
  scope,
  hasRefreshToken,
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getSessionMock.mockReset();
  listLinkedCharactersMock.mockReset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.unstubAllEnvs();
});

describe('industryCharacters', () => {
  it('is null for a signed-out viewer, without touching the DB', async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await industryCharacters()).toBeNull();
    expect(listLinkedCharactersMock).not.toHaveBeenCalled();
  });

  it('is null when auth is not set up locally, and fails loudly when it is', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
    vi.stubEnv('SESSION_SECRET', undefined);
    getSessionMock.mockRejectedValue(new BetterAuthError('BETTER_AUTH_SECRET is missing'));
    expect(await industryCharacters()).toBeNull();

    vi.stubEnv('BETTER_AUTH_SECRET', 'a-real-prod-secret');
    await expect(industryCharacters()).rejects.toThrow('BETTER_AUTH_SECRET is missing');

    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('SESSION_SECRET', 'a-real-session-secret');
    await expect(industryCharacters()).rejects.toThrow('BETTER_AUTH_SECRET is missing');
  });

  it('lists every pilot and which of them can sync personal and corporation jobs', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockResolvedValue([
      linked(100, `${JOB_SCOPE} ${CORP_SCOPES}`),
      linked(200, JOB_SCOPE, false),
      linked(300, JOB_SCOPE),
    ]);
    const found = await industryCharacters();
    expect(found?.characters.map((c) => [c.characterId, c.needsReconnect])).toEqual([
      [100, false],
      [200, true],
      [300, false],
    ]);
    expect(found?.jobIds).toEqual([100, 300]);
    expect(found?.corpIds).toEqual([100]);
  });
});

describe('jobCharacterIds', () => {
  it('gives none for a signed-out viewer', async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await jobCharacterIds()).toEqual({ jobIds: [], corpIds: [] });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a failed read and gives none instead of failing the section', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockRejectedValue(new Error('neon: connection terminated'));
    expect(await jobCharacterIds()).toEqual({ jobIds: [], corpIds: [] });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('passes the eligible ids through', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockResolvedValue([linked(100, `${JOB_SCOPE} ${CORP_SCOPES}`)]);
    expect(await jobCharacterIds()).toEqual({ jobIds: [100], corpIds: [100] });
  });
});
