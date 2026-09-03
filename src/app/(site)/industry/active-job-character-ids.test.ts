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

import { activeJobCharacterIds, corpJobsAccess } from './active-job-character-ids';

const CORP_SCOPES =
  'esi-characters.read_corporation_roles.v1 esi-industry.read_corporation_jobs.v1';

describe('activeJobCharacterIds', () => {
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

  it('returns [] for a signed-out viewer, without touching the DB', async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await activeJobCharacterIds()).toEqual([]);
    expect(listLinkedCharactersMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('degrades silently for a BetterAuthError only when the auth env is absent', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
    vi.stubEnv('SESSION_SECRET', undefined);
    getSessionMock.mockRejectedValue(new BetterAuthError('BETTER_AUTH_SECRET is missing'));
    expect(await activeJobCharacterIds()).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a BetterAuthError when the auth env IS configured (prod misconfig)', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'a-real-prod-secret');
    getSessionMock.mockRejectedValue(new BetterAuthError('something else went wrong'));
    expect(await activeJobCharacterIds()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('logs and degrades on an unexpected error (e.g. a DB failure)', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockRejectedValue(new Error('neon: connection terminated'));
    expect(await activeJobCharacterIds()).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns only the sync-eligible character ids on the happy path', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockResolvedValue([
      { characterId: 100, scope: 'esi-industry.read_character_jobs.v1', hasRefreshToken: true },
      { characterId: 200, scope: 'esi-industry.read_character_jobs.v1', hasRefreshToken: false },
    ]);
    expect(await activeJobCharacterIds()).toEqual([100]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('corpJobsAccess', () => {
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

  it('reports no linked characters for a signed-out viewer', async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await corpJobsAccess()).toEqual({
      eligibleCharacterIds: [],
      hasLinkedCharacters: false,
    });
  });

  it('returns only the corp-scoped, token-holding character ids', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockResolvedValue([
      { characterId: 100, scope: CORP_SCOPES, hasRefreshToken: true },
      { characterId: 200, scope: CORP_SCOPES, hasRefreshToken: false },
      { characterId: 300, scope: 'esi-industry.read_character_jobs.v1', hasRefreshToken: true },
    ]);
    expect(await corpJobsAccess()).toEqual({
      eligibleCharacterIds: [100],
      hasLinkedCharacters: true,
    });
  });

  it('flags scope-missing: linked characters exist but none are corp-eligible', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'eve-user-1' } });
    listLinkedCharactersMock.mockResolvedValue([
      { characterId: 300, scope: 'esi-industry.read_character_jobs.v1', hasRefreshToken: true },
    ]);
    expect(await corpJobsAccess()).toEqual({
      eligibleCharacterIds: [],
      hasLinkedCharacters: true,
    });
  });
});
