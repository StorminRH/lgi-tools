import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbiddenFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';

const h = vi.hoisted(() => ({
  checkAdminMutation: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkAdminMutation: (...args: unknown[]) => h.checkAdminMutation(...args),
}));

import { adminMutationGate } from './admin-mutation';

function request(): Request {
  return new Request('https://lgi.tools/api/admin/role', { method: 'POST' });
}

describe('adminMutationGate', () => {
  beforeEach(() => {
    h.checkAdminMutation.mockReset();
  });

  it('returns the admin session when the shared gate passes', async () => {
    const session = { user: { id: 'admin-1' }, characterId: 42, isAdmin: true };
    h.checkAdminMutation.mockResolvedValueOnce({ ok: true, session });

    await expect(adminMutationGate(request())).resolves.toEqual({
      ok: true,
      session,
    });
  });

  it('maps a gate failure to a problem response', async () => {
    h.checkAdminMutation.mockResolvedValueOnce({
      ok: false,
      failure: forbiddenFailure(),
    });

    const result = await adminMutationGate(request());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(problemBodySchema.parse(await result.response.json())).toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });
});
