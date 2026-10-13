import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getNavServerStatus: vi.fn(),
  refresh: vi.fn(),
  runAfterResponse: vi.fn(),
}));

vi.mock('./queries', () => ({ getNavServerStatus: h.getNavServerStatus }));
vi.mock('./refresh', () => ({ refreshServerStatusOnView: h.refresh }));
vi.mock('@/lib/after-response', () => ({ runAfterResponse: h.runAfterResponse }));
vi.mock('@/data/esi-store', async () =>
  vi.importActual<typeof import('@/data/esi-store/expiry')>('@/data/esi-store/expiry'),
);

import { getServerStatusOnView } from './on-view';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const ONLINE = { state: 'online', players: 1, startedAt: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.getNavServerStatus.mockReset();
  h.runAfterResponse.mockReset();
});

describe('getServerStatusOnView', () => {
  it('shows the stored status and schedules nothing while CCP\'s copy is unexpired', async () => {
    h.getNavServerStatus.mockResolvedValue({ status: ONLINE, expiresAt: NOW + 1 });
    await expect(getServerStatusOnView()).resolves.toEqual(ONLINE);
    expect(h.runAfterResponse).not.toHaveBeenCalled();
  });

  it('shows the stored status at once and refreshes behind the response once it is due', async () => {
    h.getNavServerStatus.mockResolvedValue({ status: ONLINE, expiresAt: NOW });
    await expect(getServerStatusOnView()).resolves.toEqual(ONLINE);
    expect(h.runAfterResponse).toHaveBeenCalledWith('eve-status', 'status refresh', h.refresh);

    h.getNavServerStatus.mockResolvedValue({ status: { state: 'unknown' }, expiresAt: null });
    await expect(getServerStatusOnView()).resolves.toEqual({ state: 'unknown' });
    expect(h.runAfterResponse).toHaveBeenCalledTimes(2);
  });
});
