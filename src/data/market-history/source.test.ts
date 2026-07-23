import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/esi', async () => {
  const actual = await vi.importActual<typeof import('@/platform/esi')>('@/platform/esi');
  return { ...actual, esiFetch: vi.fn() };
});

import { EsiBudgetExhaustedError } from '@/platform/esi';
import { esiFetch } from '@/platform/esi';
import {
  fetchHistoryFromSource,
  parseEsiHistory,
  staleAfterFromExpires,
} from './source';

// The verified live ESI history item shape (2026-06-14).
const sampleItem = {
  average: 4.06,
  date: '2025-05-01',
  highest: 4.1,
  lowest: 4.04,
  order_count: 1471,
  volume: 6498537635,
};

function historyResponse(items: unknown[], expires?: string): Response {
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: expires ? { Expires: expires } : {},
  });
}

beforeEach(() => {
  vi.mocked(esiFetch).mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('parseEsiHistory', () => {
  it('maps the verified daily shape and carries volume as bigint', () => {
    const rows = parseEsiHistory([sampleItem]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      date: '2025-05-01',
      average: 4.06,
      highest: 4.1,
      lowest: 4.04,
      volume: BigInt(6498537635),
      orderCount: 1471,
    });
  });

  it('ignores unknown keys (upstream additions cannot break parsing)', () => {
    const rows = parseEsiHistory([{ ...sampleItem, donations: 7 }]);
    expect(rows[0]!.volume).toBe(BigInt(6498537635));
  });

  it('throws EsiContractError on a non-array or a missing consumed field', () => {
    expect(() => parseEsiHistory({ not: 'an array' })).toThrow();
    const { volume: _omitted, ...withoutVolume } = sampleItem;
    expect(() => parseEsiHistory([withoutVolume])).toThrow();
  });
});

describe('staleAfterFromExpires', () => {
  const now = new Date('2026-06-14T12:00:00Z');

  it('uses the Expires header (CCP next-day recompute) when present', () => {
    const sa = staleAfterFromExpires('Mon, 15 Jun 2026 11:05:00 GMT', now);
    expect(sa.toISOString()).toBe('2026-06-15T11:05:00.000Z');
  });

  it('falls back to now+24h when Expires is absent or unparseable', () => {
    const expected = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(staleAfterFromExpires(null, now).toISOString()).toBe(expected);
    expect(staleAfterFromExpires('not a date', now).toISOString()).toBe(expected);
  });
});

describe('fetchHistoryFromSource', () => {
  it('issues one ESI call per type and derives stale_after from Expires', async () => {
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const id = Number(/type_id=(\d+)/.exec(url)![1]);
      return historyResponse(
        [{ ...sampleItem, average: id }],
        'Mon, 15 Jun 2026 11:05:00 GMT',
      );
    });

    const { results, budgetExhausted } = await fetchHistoryFromSource([34, 35]);
    expect(budgetExhausted).toBe(false);
    expect(results).toHaveLength(2);
    expect(vi.mocked(esiFetch).mock.calls).toHaveLength(2);
    const r34 = results.find((r) => r.typeId === 34)!;
    expect(r34.source).toBe('esi');
    expect(r34.rows[0]!.average).toBe(34);
    expect(r34.staleAfter.toISOString()).toBe('2026-06-15T11:05:00.000Z');
  });

  it('skips a type on a 4xx (keeps its stored series) without failing the batch', async () => {
    vi.mocked(esiFetch).mockImplementation(async (url) => {
      const id = Number(/type_id=(\d+)/.exec(url)![1]);
      if (id === 99) return new Response('not found', { status: 404 });
      return historyResponse([sampleItem]);
    });

    const { results } = await fetchHistoryFromSource([34, 99]);
    expect(results.map((r) => r.typeId)).toEqual([34]);
  });

  it('flags budget exhaustion and stops dispatching', async () => {
    vi.mocked(esiFetch).mockRejectedValue(new EsiBudgetExhaustedError(0));
    const { results, budgetExhausted } = await fetchHistoryFromSource([1, 2, 3]);
    expect(results).toHaveLength(0);
    expect(budgetExhausted).toBe(true);
  });
});
