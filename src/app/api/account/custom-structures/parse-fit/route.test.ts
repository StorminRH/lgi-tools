import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  getStructureFitNameIndex: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureFitNameIndex: (...args: unknown[]) => h.getStructureFitNameIndex(...args),
}));

import { NextRequest } from 'next/server';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/account/custom-structures/parse-fit',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

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

    const response = await POST(makeRequest({ fit: '[Azbel, Test]' }));

    expect(response.status).toBe(401);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(h.getStructureFitNameIndex).not.toHaveBeenCalled();
  });
});
