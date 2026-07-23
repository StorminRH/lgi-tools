import { describe, expect, it, vi } from 'vitest';
import { blueprintImage } from '@/data/eve-data/type-images';

vi.mock('@/transport/api-client', () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: {
      blueprints: [
        { blueprintTypeId: 691, productTypeId: 587, name: 'Rifter Blueprint' },
      ],
    },
  })),
}));

import { blueprintsSource } from './blueprints-source';

describe('blueprintsSource', () => {
  it('shows the blueprint scroll while retaining product type identity', async () => {
    const rows = await blueprintsSource.search('rifter', {
      session: null,
      isAdmin: false,
      recents: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('blueprint:691');
    expect(rows[0]!.icon).toEqual(blueprintImage(691));
    expect(rows[0]!.typeId).toBe(587);
  });
});
