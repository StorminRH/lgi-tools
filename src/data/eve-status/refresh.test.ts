import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiResponseMeta, EsiStoreKey } from '@/data/esi-store';

const h = vi.hoisted(() => ({
  fetchStored: vi.fn(),
  storedRow: vi.fn(),
  recordMetas: vi.fn(),
  serverErrorMeta: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidateTag: h.revalidateTag }));

type Init = { parse: (body: unknown, headers: Headers) => unknown };

/** The store's transport: a 200's body is parsed inside the call with the caller's parser, and a parse failure throws. */
async function fetchStored(key: unknown, init: Init): Promise<unknown> {
  const answer = await h.fetchStored(key, init);
  if (answer.kind !== 'fresh') return answer;
  return { kind: 'fresh', value: init.parse(await answer.res.json(), answer.res.headers), meta: answer.meta };
}

vi.mock('@/data/esi-store', async () => ({
  ...(await vi.importActual<typeof import('@/data/esi-store/downtime')>('@/data/esi-store/downtime')),
  fetchStored,
  storedRow: h.storedRow,
  recordMetas: h.recordMetas,
  serverErrorMeta: h.serverErrorMeta,
}));

import { EsiBudgetExhaustedError, EsiServerError } from '@/platform/esi';
import { refreshServerStatusOnView } from './refresh';

const STATUS_KEY: EsiStoreKey = { route: '/status/', holder: { kind: 'global' } };
const NOON = Date.parse('2026-10-12T12:00:00Z');
const DOWNTIME = Date.parse('2026-10-12T11:01:00Z');
const HALT_UNTIL = Date.parse('2026-10-12T11:30:00Z');

function meta(now: number, body?: unknown): EsiResponseMeta {
  return { key: STATUS_KEY, expiresAt: now + 30_000, etags: ['"s"'], lastModified: null, checkedAt: now, body };
}

function row(status: unknown, halt: unknown, expiresAt = NOON - 1) {
  return { expiresAt, etags: ['"old"'], lastModified: null, checkedAt: NOON - 60_000, body: { status, halt } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  h.fetchStored.mockReset();
  h.storedRow.mockReset().mockResolvedValue(null);
  h.recordMetas.mockReset().mockResolvedValue(undefined);
  h.revalidateTag.mockReset();
  h.serverErrorMeta.mockReset().mockImplementation((_key, _error, checkedAt: number) => meta(checkedAt));
});

describe('refreshServerStatusOnView', () => {
  it('stores a 200 as the parsed status with its meta and an empty halt, clearing no tag from the render that triggers it', async () => {
    const document = { players: 13_459, server_version: '3430261', start_time: '2026-10-12T11:03:21Z' };
    h.fetchStored.mockResolvedValue({ kind: 'fresh', res: Response.json(document), meta: meta(NOON, document) });

    await refreshServerStatusOnView();

    expect(h.recordMetas).toHaveBeenCalledWith(
      [{ ...meta(NOON), body: { status: { state: 'online', players: 13_459, startedAt: '2026-10-12T11:03:21Z' }, halt: { failures: [], haltUntil: null } } }],
    );
    expect(h.recordMetas).toHaveBeenCalledTimes(1);
    expect(h.revalidateTag).not.toHaveBeenCalled();
  });

  it('stores a 503 as offline under the expiry the answer carries, with no retry', async () => {
    h.fetchStored.mockRejectedValue(new EsiServerError(503, 'down', { expires: 'x' }));

    await refreshServerStatusOnView();

    expect(h.fetchStored).toHaveBeenCalledTimes(1);
    expect(h.serverErrorMeta).toHaveBeenCalledWith(STATUS_KEY, expect.any(EsiServerError), NOON);
    expect(h.recordMetas).toHaveBeenCalledWith(
      [{ ...meta(NOON), body: { status: { state: 'offline' }, halt: { failures: [], haltUntil: null } } }],
    );
    expect(h.recordMetas).toHaveBeenCalledTimes(1);
    expect(h.revalidateTag).not.toHaveBeenCalled();
  });

  it('counts a 503 inside the window toward the halt and halts on the second one 25 s later', async () => {
    vi.setSystemTime(DOWNTIME);
    h.fetchStored.mockRejectedValue(new EsiServerError(504));
    await refreshServerStatusOnView();
    expect(h.recordMetas.mock.calls[0]![0][0].body).toEqual({ status: { state: 'offline' }, halt: { failures: [DOWNTIME], haltUntil: null } });

    vi.setSystemTime(DOWNTIME + 30_000);
    h.storedRow.mockResolvedValue(row({ state: 'offline' }, { failures: [DOWNTIME], haltUntil: null }));
    await refreshServerStatusOnView();
    expect(h.recordMetas.mock.calls[1]![0][0].body).toEqual({
      status: { state: 'offline' },
      halt: { failures: [DOWNTIME, DOWNTIME + 30_000], haltUntil: HALT_UNTIL },
    });
  });

  it('records nothing on a failure that says nothing about the server, unless it breaks a streak', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const failure of [
      new EsiServerError(502),
      new EsiBudgetExhaustedError(0),
      new DOMException('signal timed out', 'TimeoutError'),
    ]) {
      h.fetchStored.mockRejectedValueOnce(failure);
      await refreshServerStatusOnView();
    }
    h.fetchStored.mockResolvedValueOnce({ kind: 'error', status: 404 });
    await refreshServerStatusOnView();
    h.fetchStored.mockResolvedValueOnce({ kind: 'fresh', res: Response.json({ players: 'many' }), meta: meta(NOON, { players: 'many' }) });
    await refreshServerStatusOnView();
    expect(h.recordMetas).not.toHaveBeenCalled();

    vi.setSystemTime(DOWNTIME + 10_000);
    const held = row({ state: 'offline' }, { failures: [DOWNTIME], haltUntil: null });
    h.storedRow.mockResolvedValue(held);
    h.fetchStored.mockRejectedValueOnce(new EsiServerError(502));
    await refreshServerStatusOnView();
    expect(h.recordMetas).toHaveBeenCalledWith(
      [{ key: STATUS_KEY, expiresAt: held.expiresAt, etags: ['"old"'], lastModified: null, checkedAt: held.checkedAt, body: { status: { state: 'offline' }, halt: { failures: [], haltUntil: null } } }],
    );
    errorSpy.mockRestore();
  });

  it('leaves the row alone when the store answers unchanged', async () => {
    h.fetchStored.mockResolvedValue({ kind: 'unchanged', expiresAt: NOON + 10_000 });
    await refreshServerStatusOnView();
    expect(h.storedRow).not.toHaveBeenCalled();
    expect(h.recordMetas).not.toHaveBeenCalled();
  });
});
