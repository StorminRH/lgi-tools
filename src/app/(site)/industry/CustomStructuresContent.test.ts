import type { ReactElement } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const reads = vi.hoisted(() => ({
  session: vi.fn<() => Promise<BetterAuthSession | null>>(),
  custom: vi.fn(),
  corps: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: reads.session } } }));
vi.mock('@/components/composition/industry-workspace/StructuresManager', () => ({ StructuresManager: vi.fn() }));
vi.mock('@/components/composition/account/LoginButton', () => ({ EveSignInButton: vi.fn() }));
vi.mock('@/composition/sync/corp-structures-sync', () => ({ getCorpStructuresPageData: reads.corps }));
vi.mock('@/data/eve-data/queries', () => ({ getStructureTypes: async () => [], getStructureRigs: async () => [] }));
vi.mock('@/features/custom-structures/queries', () => ({ listCustomStructures: reads.custom }));

import { CustomStructuresContent } from './CustomStructuresContent';

beforeEach(() => {
  reads.session.mockReset();
  reads.custom.mockReset().mockResolvedValue([]);
  reads.corps.mockReset().mockResolvedValue([]);
});

test('server rows carry the account and active character that authorized their read', async () => {
  reads.session.mockResolvedValue(sessionFixture({ user: { id: 'account-a' }, characterId: 101 }));
  const result = await CustomStructuresContent() as ReactElement<{ owner: unknown }>;
  expect(result.props.owner).toEqual({ userId: 'account-a', characterId: 101 });
  expect(reads.custom).toHaveBeenCalledExactlyOnceWith('account-a');
  expect(reads.corps).toHaveBeenCalledExactlyOnceWith('account-a');
});

test.each([null, sessionFixture({ user: { id: 'account-a' }, characterId: null })])('a session without an active identity does not read structures', async (session) => {
  reads.session.mockResolvedValue(session);
  await CustomStructuresContent();
  expect(reads.custom).not.toHaveBeenCalled();
  expect(reads.corps).not.toHaveBeenCalled();
});
