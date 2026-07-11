import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ solarSystemExistsMock: vi.fn() }));

vi.mock('@/data/eve-data/queries', () => ({
  solarSystemExists: (...args: unknown[]) => h.solarSystemExistsMock(...args),
}));

import { rejectUnknownSystemPin } from './system-pin';

describe('rejectUnknownSystemPin', () => {
  beforeEach(() => {
    h.solarSystemExistsMock.mockReset();
  });

  it('passes a null pin without querying', async () => {
    expect(await rejectUnknownSystemPin(null)).toBeNull();
    expect(h.solarSystemExistsMock).not.toHaveBeenCalled();
  });

  it('passes a pin that references a real solar system', async () => {
    h.solarSystemExistsMock.mockResolvedValue(true);
    expect(await rejectUnknownSystemPin(30000142)).toBeNull();
    expect(h.solarSystemExistsMock).toHaveBeenCalledWith(30000142);
  });

  it('returns the 400 for a pin to an unknown system', async () => {
    h.solarSystemExistsMock.mockResolvedValue(false);
    const res = await rejectUnknownSystemPin(99999999);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(400);
    expect(await res?.text()).toBe('unknown system');
  });
});
