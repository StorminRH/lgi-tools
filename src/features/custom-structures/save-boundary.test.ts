import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  solarSystemExistsMock: vi.fn(),
  getStructureTypesMock: vi.fn(),
  getStructureRigsMock: vi.fn(),
}));

vi.mock('@/data/eve-data/queries', () => ({
  solarSystemExists: (...args: unknown[]) => h.solarSystemExistsMock(...args),
  getStructureTypes: (...args: unknown[]) => h.getStructureTypesMock(...args),
  getStructureRigs: (...args: unknown[]) => h.getStructureRigsMock(...args),
}));

import { rejectInvalidCustomStructure } from './save-boundary';

const azbel = { typeId: 35826, name: 'Azbel', groupId: 1404, rigSize: 3 };
const input = { structureTypeId: 35826, rigTypeIds: [], systemId: null };

describe('rejectInvalidCustomStructure', () => {
  beforeEach(() => {
    h.solarSystemExistsMock.mockReset();
    h.getStructureTypesMock.mockReset().mockResolvedValue([azbel]);
    h.getStructureRigsMock.mockReset().mockResolvedValue([]);
  });

  it('passes a known hull with no pin without querying the system', async () => {
    expect(await rejectInvalidCustomStructure(input)).toEqual({ ok: true });
    expect(h.solarSystemExistsMock).not.toHaveBeenCalled();
  });

  it('passes a pin that references a real solar system', async () => {
    h.solarSystemExistsMock.mockResolvedValue(true);
    expect(await rejectInvalidCustomStructure({ ...input, systemId: 30000142 })).toEqual({ ok: true });
    expect(h.solarSystemExistsMock).toHaveBeenCalledWith(30000142);
  });

  it('returns a typed validation failure for a pin to an unknown system', async () => {
    h.solarSystemExistsMock.mockResolvedValue(false);
    expect(await rejectInvalidCustomStructure({ ...input, systemId: 99999999 })).toEqual({
      ok: false,
      failure: { category: 'validation', code: 'unknown_system', detail: 'unknown system' },
    });
  });

  it('returns invalid_structure for an unknown hull before checking the system', async () => {
    expect(await rejectInvalidCustomStructure({ ...input, structureTypeId: 1 })).toEqual({
      ok: false,
      failure: { category: 'validation', code: 'invalid_structure', detail: 'unknown structure type' },
    });
    expect(h.solarSystemExistsMock).not.toHaveBeenCalled();
  });
});
