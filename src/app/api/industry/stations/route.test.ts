import { expect, it, vi } from 'vitest';

const JITA_NAVY = { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142, security: 0.95 };

vi.mock('@/data/eve-data/queries', () => ({
  getManufacturingStationIndex: vi.fn(async () => [JITA_NAVY]),
}));

import { GET } from './route';

it('serves the manufacturing station index', async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ stations: [JITA_NAVY] });
});
