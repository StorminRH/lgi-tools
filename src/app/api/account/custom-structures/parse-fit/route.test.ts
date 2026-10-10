import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  getStructureFitNameIndex: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureFitNameIndex: (...args: unknown[]) => h.getStructureFitNameIndex(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const ROUTE = '/api/account/custom-structures/parse-fit';

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.getStructureFitNameIndex.mockReset().mockResolvedValue(new Map());
});

describe('POST /api/account/custom-structures/parse-fit', () => {
  it('returns the declared 401 problem for an anonymous caller', async () => {
    h.checkUserId.mockResolvedValue({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });

    const response = await POST(postJson(ROUTE, { fit: '[Azbel, Test]' }));

    expect(response.status).toBe(401);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(h.getStructureFitNameIndex).not.toHaveBeenCalled();
  });
});
