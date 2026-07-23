import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiContractError, EsiServerError } from '@/platform/esi';
import {
  fetchAdjustedPrices,
  fetchCostIndices,
  parseAdjustedPrices,
  parseCostIndices,
} from './source';

vi.mock('@/platform/esi', async () => {
  const actual = await vi.importActual<typeof import('@/platform/esi')>('@/platform/esi');
  return { ...actual, esiFetch: vi.fn() };
});

import { esiFetch } from '@/platform/esi';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.mocked(esiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('parseCostIndices', () => {
  it('flattens the nested per-system shape into one row per known activity', () => {
    const rows = parseCostIndices([
      {
        solar_system_id: 30000142,
        cost_indices: [
          { activity: 'manufacturing', cost_index: 0.05 },
          { activity: 'researching_time_efficiency', cost_index: 0.01 },
          { activity: 'researching_material_efficiency', cost_index: 0.02 },
          { activity: 'copying', cost_index: 0.03 },
          { activity: 'invention', cost_index: 0.04 },
          { activity: 'reaction', cost_index: 0.06 },
        ],
      },
    ]);
    expect(rows).toHaveLength(6);
    expect(rows).toContainEqual({
      solarSystemId: 30000142,
      activity: 'manufacturing',
      costIndex: 0.05,
    });
  });

  it('drops an unknown activity rather than failing the whole dataset', () => {
    const rows = parseCostIndices([
      {
        solar_system_id: 30000144,
        cost_indices: [
          { activity: 'manufacturing', cost_index: 0.1 },
          { activity: 'some_future_activity', cost_index: 0.9 },
        ],
      },
    ]);
    expect(rows).toEqual([
      { solarSystemId: 30000144, activity: 'manufacturing', costIndex: 0.1 },
    ]);
  });

  it('throws EsiContractError on a non-array body', () => {
    expect(() => parseCostIndices({ nope: true })).toThrow(EsiContractError);
  });

  it('throws EsiContractError when a consumed field has the wrong type', () => {
    expect(() =>
      parseCostIndices([
        { solar_system_id: 1, cost_indices: [{ activity: 'manufacturing', cost_index: 'x' }] },
      ]),
    ).toThrow(EsiContractError);
  });
});

describe('parseAdjustedPrices', () => {
  it('maps type_id/adjusted_price, preserves 0.0, and strips average_price', () => {
    const rows = parseAdjustedPrices([
      { adjusted_price: 33.2, average_price: 30.15, type_id: 18 },
      { adjusted_price: 0.0, average_price: 21.47, type_id: 41 },
    ]);
    expect(rows).toEqual([
      { typeId: 18, adjustedPrice: 33.2 },
      { typeId: 41, adjustedPrice: 0 },
    ]);
  });

  it('stores null when adjusted_price is absent (distinct from 0.0)', () => {
    const rows = parseAdjustedPrices([{ type_id: 99, average_price: 5 }]);
    expect(rows).toEqual([{ typeId: 99, adjustedPrice: null }]);
  });

  it('throws EsiContractError when type_id is the wrong type', () => {
    expect(() => parseAdjustedPrices([{ type_id: 'x' }])).toThrow(EsiContractError);
  });
});

describe('fetch* — gate failure handling', () => {
  it('turns a non-ok ESI response into EsiServerError', async () => {
    vi.mocked(esiFetch).mockResolvedValue(jsonResponse({ error: 'bad' }, 400));
    await expect(fetchCostIndices()).rejects.toBeInstanceOf(EsiServerError);
  });

  it('parses a successful adjusted-prices response', async () => {
    vi.mocked(esiFetch).mockResolvedValue(
      jsonResponse([{ type_id: 34, adjusted_price: 2.9 }]),
    );
    await expect(fetchAdjustedPrices()).resolves.toEqual([
      { typeId: 34, adjustedPrice: 2.9 },
    ]);
  });
});
