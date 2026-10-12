import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import type { EsiResponseMeta, EsiStoreKey } from './types';

const mocks = vi.hoisted(() => ({
  readStoredAuthed: vi.fn(),
  readStoredPaged: vi.fn(),
  readPassThroughAuthed: vi.fn(),
  postPassThroughAuthed: vi.fn(),
  commit: vi.fn<(metas: unknown, opts: unknown) => Promise<void>>(async () => {}),
}));

vi.mock('./index', () => ({
  readStoredAuthed: (key: unknown, accessToken: unknown) => mocks.readStoredAuthed(key, accessToken),
  readStoredPaged: (key: unknown, accessToken: unknown) => mocks.readStoredPaged(key, accessToken),
  readPassThroughAuthed: (route: unknown, params: unknown, accessToken: unknown) =>
    mocks.readPassThroughAuthed(route, params, accessToken),
  postPassThroughAuthed: (route: unknown, params: unknown, accessToken: unknown, body: unknown) =>
    mocks.postPassThroughAuthed(route, params, accessToken, body),
  commit: (metas: unknown, opts: unknown) => mocks.commit(metas, opts),
  datasetTag: (key: EsiStoreKey) => `eve:${key.route}:${key.holder.kind}`,
  refusalMeta: (key: EsiStoreKey, expiresAt: number | null, checkedAt: number): EsiResponseMeta => ({
    key,
    expiresAt: expiresAt ?? checkedAt + SPEC_MS,
    etags: [],
    lastModified: null,
    checkedAt,
  }),
}));

/** The spec cache time the refusalMeta stand-in falls back to when a 403 sent no Expires. */
const SPEC_MS = 3_600_000;

import { openReadSession } from './session';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const SKILLS_KEY: EsiStoreKey = { route: '/characters/{character_id}/skills/', holder: { kind: 'character', id: 91 } };
const QUEUE_KEY: EsiStoreKey = { route: '/characters/{character_id}/skillqueue/', holder: { kind: 'character', id: 91 } };
const ASSETS_KEY: EsiStoreKey = { route: '/corporations/{corporation_id}/assets/', holder: { kind: 'corporation', id: 98 } };
const STRUCTURE_ROUTE = '/universe/structures/{structure_id}/';

function meta(key: EsiStoreKey, etag: string): EsiResponseMeta {
  return { key, expiresAt: NOW + 60_000, etags: [etag], lastModified: null, checkedAt: NOW };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('openReadSession', () => {
  it('answers in the port\'s shape, keeps each 200\'s meta aside, and commits them by dataset tag after the write', async () => {
    const session = openReadSession();
    mocks.readStoredAuthed
      .mockResolvedValueOnce({ kind: 'fresh', body: { total_sp: 1 }, etag: '"s"', meta: meta(SKILLS_KEY, '"s"') })
      .mockResolvedValueOnce({ kind: 'unchanged', expiresAt: NOW + 1 })
      .mockResolvedValueOnce({ kind: 'fresh', body: [], etag: '"q"', meta: meta(QUEUE_KEY, '"q"') });
    mocks.readStoredPaged.mockResolvedValueOnce({
      kind: 'fresh', items: [{ item_id: 1 }], etags: ['"p1"'], responseHeaders: [], meta: meta(ASSETS_KEY, '"p1"'),
    });

    await expect(session.readAuthed(SKILLS_KEY, 'token')).resolves.toEqual({ kind: 'fresh', body: { total_sp: 1 }, etag: '"s"' });
    await expect(session.readAuthed(SKILLS_KEY, 'token')).resolves.toEqual({ kind: 'unchanged', expiresAt: NOW + 1 });
    await expect(session.readAuthed(QUEUE_KEY, 'token')).resolves.toEqual({ kind: 'fresh', body: [], etag: '"q"' });
    await expect(session.readPaged(ASSETS_KEY, 'token')).resolves.toEqual({
      kind: 'fresh', items: [{ item_id: 1 }], etags: ['"p1"'], responseHeaders: [],
    });
    expect(mocks.readStoredAuthed).toHaveBeenCalledWith(SKILLS_KEY, 'token');
    expect(mocks.readStoredPaged).toHaveBeenCalledWith(ASSETS_KEY, 'token');
    expect(mocks.commit).not.toHaveBeenCalled();

    await session.commit();

    expect(mocks.commit.mock.calls).toEqual([
      [[meta(SKILLS_KEY, '"s"')], { tag: 'eve:/characters/{character_id}/skills/:character' }],
      [[meta(QUEUE_KEY, '"q"')], { tag: 'eve:/characters/{character_id}/skillqueue/:character' }],
      [[meta(ASSETS_KEY, '"p1"')], { tag: 'eve:/corporations/{corporation_id}/assets/:corporation' }],
    ]);

    await session.commit();
    expect(mocks.commit).toHaveBeenCalledTimes(3);
  });

  it('records expiries but no ETags once the bodies were discarded, and keeps them again after that commit', async () => {
    const session = openReadSession();
    mocks.readStoredAuthed
      .mockResolvedValueOnce({ kind: 'fresh', body: { total_sp: 1 }, etag: '"s"', meta: meta(SKILLS_KEY, '"s"') })
      .mockResolvedValueOnce({ kind: 'fresh', body: [], etag: '"q"', meta: meta(QUEUE_KEY, '"q"') });

    await session.readAuthed(SKILLS_KEY, 'token');
    session.discardBodies();
    await session.commit();

    expect(mocks.commit.mock.calls).toEqual([
      [[{ ...meta(SKILLS_KEY, '"s"'), etags: [] }], { tag: 'eve:/characters/{character_id}/skills/:character' }],
    ]);

    await session.readAuthed(QUEUE_KEY, 'token');
    await session.commit();
    expect(mocks.commit).toHaveBeenLastCalledWith([meta(QUEUE_KEY, '"q"')], { tag: 'eve:/characters/{character_id}/skillqueue/:character' });
  });

  it('commits nothing for a session whose reads were all unchanged or failed short of a refusal', async () => {
    const session = openReadSession();
    mocks.readStoredAuthed.mockResolvedValueOnce({ kind: 'unchanged', expiresAt: null });
    mocks.readStoredPaged.mockResolvedValueOnce({ kind: 'error', code: 'esi_404' });

    await session.readAuthed(SKILLS_KEY, 'token');
    await expect(session.readPaged(ASSETS_KEY, 'token')).resolves.toEqual({ kind: 'error', code: 'esi_404' });
    await session.commit();

    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('keeps a 403 aside as its key\'s answer, with no ETag, and records it once a write stands over it', async () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const session = openReadSession();
      mocks.readStoredAuthed
        .mockResolvedValueOnce({ kind: 'fresh', body: { total_sp: 1 }, etag: '"s"', meta: meta(SKILLS_KEY, '"s"') })
        .mockResolvedValueOnce({ kind: 'error', code: 'esi_403', expiresAt: NOW + 90_000 });
      mocks.readStoredPaged.mockResolvedValueOnce({ kind: 'error', code: 'esi_403' });

      await session.readAuthed(SKILLS_KEY, 'token');
      await expect(session.readAuthed(QUEUE_KEY, 'token')).resolves.toEqual({ kind: 'error', code: 'esi_403', expiresAt: NOW + 90_000 });
      await session.readPaged(ASSETS_KEY, 'token');
      expect(mocks.commit).not.toHaveBeenCalled();

      session.discardBodies();
      await session.commit();

      expect(mocks.commit.mock.calls).toEqual([
        [[{ ...meta(SKILLS_KEY, '"s"'), etags: [] }], { tag: 'eve:/characters/{character_id}/skills/:character' }],
        [
          [{ key: QUEUE_KEY, expiresAt: NOW + 90_000, etags: [], lastModified: null, checkedAt: NOW }],
          { tag: 'eve:/characters/{character_id}/skillqueue/:character' },
        ],
        [
          [{ key: ASSETS_KEY, expiresAt: NOW + SPEC_MS, etags: [], lastModified: null, checkedAt: NOW }],
          { tag: 'eve:/corporations/{corporation_id}/assets/:corporation' },
        ],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes pass-through reads straight through and keeps no meta for them', async () => {
    const session = openReadSession();
    mocks.readPassThroughAuthed.mockResolvedValueOnce({ kind: 'fresh', body: { name: 'Fort' }, etag: null, expiresAt: null });
    mocks.postPassThroughAuthed.mockResolvedValueOnce({ kind: 'fresh', body: [{ item_id: 1, name: 'Can' }], etag: null, expiresAt: null });

    await expect(session.readPassThrough(STRUCTURE_ROUTE, { structure_id: 7 }, 'token')).resolves.toMatchObject({ kind: 'fresh', body: { name: 'Fort' } });
    await expect(
      session.postPassThrough('/corporations/{corporation_id}/assets/names/', { corporation_id: 98 }, 'token', [1]),
    ).resolves.toMatchObject({ kind: 'fresh', body: [{ item_id: 1, name: 'Can' }] });
    expect(mocks.readPassThroughAuthed).toHaveBeenCalledWith(STRUCTURE_ROUTE, { structure_id: 7 }, 'token');
    expect(mocks.postPassThroughAuthed).toHaveBeenCalledWith('/corporations/{corporation_id}/assets/names/', { corporation_id: 98 }, 'token', [1]);
    await session.commit();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it.each([
    ['readAuthed', () => mocks.readStoredAuthed, (session: ReturnType<typeof openReadSession>) => session.readAuthed(SKILLS_KEY, 'token')],
    ['readPaged', () => mocks.readStoredPaged, (session: ReturnType<typeof openReadSession>) => session.readPaged(ASSETS_KEY, 'token')],
    ['readPassThrough', () => mocks.readPassThroughAuthed, (session: ReturnType<typeof openReadSession>) => session.readPassThrough(STRUCTURE_ROUTE, { structure_id: 7 }, 'token')],
    ['postPassThrough', () => mocks.postPassThroughAuthed, (session: ReturnType<typeof openReadSession>) => session.postPassThrough(STRUCTURE_ROUTE, { structure_id: 7 }, 'token', [])],
  ])('%s soft-fails an ESI server error but rethrows budget deferrals and unexpected failures', async (_name, esi, read) => {
    const session = openReadSession();
    esi().mockRejectedValueOnce(new EsiServerError(503));
    await expect(read(session)).resolves.toEqual({ kind: 'error', code: 'esi_server_error' });

    const budget = new EsiBudgetExhaustedError(19);
    esi().mockRejectedValueOnce(budget);
    await expect(read(session)).rejects.toBe(budget);

    const failure = new Error('unexpected');
    esi().mockRejectedValueOnce(failure);
    await expect(read(session)).rejects.toBe(failure);
  });
});
