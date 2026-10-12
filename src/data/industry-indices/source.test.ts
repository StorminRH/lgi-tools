import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsiContractError, EsiServerError } from '@/platform/esi';
import {
  fetchAdjustedPrices,
  fetchCostIndices,
  parseAdjustedPrices,
  parseCostIndices,
} from './source';

const fetchStoredMock = vi.fn();

vi.mock('@/data/esi-store', () => ({ fetchStored: (...args: unknown[]) => fetchStoredMock(...args) }));

const META = { key: { route: '/industry/systems/', holder: { kind: 'global' } }, expiresAt: 1, etags: [], lastModified: null, checkedAt: 0 };

beforeEach(() => {
  fetchStoredMock.mockReset();
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
  it('maps type_id, adjusted_price and average_price, preserving 0.0', () => {
    const rows = parseAdjustedPrices([
      { adjusted_price: 33.2, average_price: 30.15, type_id: 18 },
      { adjusted_price: 0.0, average_price: 21.47, type_id: 41 },
    ]);
    expect(rows).toEqual([
      { typeId: 18, adjustedPrice: 33.2, averagePrice: 30.15 },
      { typeId: 41, adjustedPrice: 0, averagePrice: 21.47 },
    ]);
  });

  it('stores null for whichever price is absent (distinct from 0.0)', () => {
    expect(parseAdjustedPrices([{ type_id: 99, average_price: 5 }])).toEqual([
      { typeId: 99, adjustedPrice: null, averagePrice: 5 },
    ]);
    expect(parseAdjustedPrices([{ type_id: 44992, adjusted_price: 0 }])).toEqual([
      { typeId: 44992, adjustedPrice: 0, averagePrice: null },
    ]);
  });

  it('throws EsiContractError when type_id is the wrong type', () => {
    expect(() => parseAdjustedPrices([{ type_id: 'x' }])).toThrow(EsiContractError);
  });
});

describe('fetch* — through the response store', () => {
  it('turns an error status into EsiServerError', async () => {
    fetchStoredMock.mockResolvedValue({ kind: 'error', status: 400 });
    await expect(fetchCostIndices()).rejects.toBeInstanceOf(EsiServerError);
    expect(fetchStoredMock).toHaveBeenCalledWith({ route: '/industry/systems/', holder: { kind: 'global' } });
  });

  it('parses a fresh adjusted-prices answer and hands back its meta', async () => {
    fetchStoredMock.mockResolvedValue({ kind: 'fresh', res: Response.json([{ type_id: 34, adjusted_price: 2.9 }]), meta: META });
    await expect(fetchAdjustedPrices()).resolves.toEqual({
      kind: 'fresh',
      rows: [{ typeId: 34, adjustedPrice: 2.9, averagePrice: null }],
      meta: META,
    });
    expect(fetchStoredMock).toHaveBeenCalledWith({ route: '/markets/prices/', holder: { kind: 'global' } });
  });

  it('passes an unchanged answer through as nothing to write', async () => {
    fetchStoredMock.mockResolvedValue({ kind: 'unchanged', expiresAt: 1 });
    await expect(fetchCostIndices()).resolves.toEqual({ kind: 'unchanged' });
  });
});
