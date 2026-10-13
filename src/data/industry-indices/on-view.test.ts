import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isDue: vi.fn(),
  batch: vi.fn(),
  refresh: vi.fn(),
  runAfterResponse: vi.fn(),
}));

vi.mock('@/data/esi-store', () => ({ isDue: h.isDue }));
vi.mock('./queries', () => ({ getSystemCostIndicesBatch: h.batch }));
vi.mock('./ingest', () => ({ refreshCostIndicesOnView: h.refresh }));
vi.mock('@/lib/after-response', () => ({ runAfterResponse: h.runAfterResponse }));

import { getSystemCostIndicesOnView } from './on-view';

const INDICES = new Map([[30000142, new Map([['manufacturing', 0.05]])]]);

beforeEach(() => {
  h.isDue.mockReset();
  h.batch.mockReset().mockResolvedValue(INDICES);
  h.runAfterResponse.mockReset();
});

describe('getSystemCostIndicesOnView', () => {
  it('serves the stored indices and schedules nothing while CCP\'s copy is unexpired', async () => {
    h.isDue.mockResolvedValue(false);
    await expect(getSystemCostIndicesOnView([30000142])).resolves.toBe(INDICES);
    expect(h.batch).toHaveBeenCalledWith([30000142]);
    expect(h.isDue).toHaveBeenCalledWith([{ route: '/industry/systems/', holder: { kind: 'global' } }]);
    expect(h.runAfterResponse).not.toHaveBeenCalled();
  });

  it('serves the stored indices at once and refreshes behind the response once they are due', async () => {
    h.isDue.mockResolvedValue(true);
    await expect(getSystemCostIndicesOnView([30000142])).resolves.toBe(INDICES);
    expect(h.runAfterResponse).toHaveBeenCalledWith('industry-indices', 'cost indices refresh', h.refresh);
  });
});
