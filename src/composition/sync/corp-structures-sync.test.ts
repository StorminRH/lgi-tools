import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  connection: vi.fn(),
  getCorpStructures: vi.fn(),
  getCorpStructureRigs: vi.fn(),
  listCorpStructureSyncStates: vi.fn(),
  resolveCorpViewer: vi.fn(),
  resolveEntityNames: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: mocks.after,
  connection: mocks.connection,
}));

vi.mock('@/composition/corp-viewer', () => ({ resolveCorpViewer: mocks.resolveCorpViewer }));

vi.mock('@/features/owned-structures/queries', () => ({
  getCorpStructureRigs: mocks.getCorpStructureRigs,
  getCorpStructures: mocks.getCorpStructures,
  listCorpStructureSyncStates: mocks.listCorpStructureSyncStates,
  readCorpStructureSyncState: vi.fn(),
  saveCorpStructures: vi.fn(),
  stampCorpStructuresFresh: vi.fn(),
}));

vi.mock('@/features/owned-structures/refresh', () => ({
  refreshCorpStructuresForUser: vi.fn(),
}));

vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: mocks.resolveEntityNames,
}));

vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: vi.fn(),
  readPagedEndpoint: vi.fn(),
  probeAndStoreRoles: vi.fn(),
  vendTokenFor: vi.fn(),
}));

import { buildCorpHoldingContext } from '@/data/corp-holdings/context';
import { narrowCorpRoles } from '@/platform/auth/corp-roles';
import { compileCorpGrant, type SharingState } from '@/platform/auth/corp-visibility';
import {
  getAvailableCorpStructuresForUser,
  getCorpStructuresForUserOnView,
  getCorpStructuresPageData,
} from './corp-structures-sync';

const SHARED_CORP = 2001;
const MANAGED_CORP = 2002;
const PRIVATE_CORP = 2003;

function viewerCorp(corporationId: number, sharing: SharingState, roles: string[]) {
  const grant = compileCorpGrant({
    corporationId,
    sharing,
    context: buildCorpHoldingContext(corporationId, [], null),
    members: [
      {
        characterId: 90001,
        roles: { kind: 'known', roles: narrowCorpRoles({ roles, rolesAtHq: [], rolesAtBase: [], rolesAtOther: [] }) },
        base: { kind: 'unknown' },
      },
    ],
  });
  return { corporationId, sharing, grant };
}

const fort = (structureId: number) => ({
  structureId,
  typeId: 35832,
  systemId: 30000142,
  securityClass: 'high',
  name: `Fort ${structureId}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.getCorpStructures.mockResolvedValue(new Map());
  mocks.listCorpStructureSyncStates.mockResolvedValue([]);
  mocks.getCorpStructureRigs.mockResolvedValue(new Map());
  mocks.resolveCorpViewer.mockResolvedValue({ corporations: [] });
  mocks.resolveEntityNames.mockResolvedValue({});
});

function viewWithThreeCorps(): void {
  mocks.resolveCorpViewer.mockResolvedValue({
    corporations: [
      viewerCorp(SHARED_CORP, 'on', []),
      viewerCorp(MANAGED_CORP, 'off', ['Station_Manager']),
      viewerCorp(PRIVATE_CORP, 'off', []),
    ],
  });
  mocks.getCorpStructures.mockResolvedValue(
    new Map([
      [SHARED_CORP, [fort(1)]],
      [MANAGED_CORP, [fort(2)]],
      [PRIVATE_CORP, [fort(3)]],
    ]),
  );
}

describe('corp structure reads', () => {
  it('waits for a real request before resolving the viewer on both read seams', async () => {
    await expect(getCorpStructuresPageData('user-1')).resolves.toEqual([]);
    await expect(getCorpStructuresForUserOnView('user-1')).resolves.toEqual({
      corporations: [],
    });

    expect(mocks.connection).toHaveBeenCalledTimes(2);
    expect(mocks.resolveCorpViewer).toHaveBeenCalledTimes(2);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resolveCorpViewer.mock.invocationCallOrder[0]!,
    );
  });

  it('offers the planner the structures of shared corps and of corps the viewer manages', async () => {
    viewWithThreeCorps();
    mocks.getCorpStructureRigs.mockResolvedValue(new Map([[2, { rigTypeIds: [37178], taxPct: 1.5 }]]));

    const available = await getAvailableCorpStructuresForUser('user-1');

    expect(available).toEqual([
      { structureId: 1, typeId: 35832, systemId: 30000142, securityClass: 'high', name: 'Fort 1', rigTypeIds: [], taxPct: null },
      { structureId: 2, typeId: 35832, systemId: 30000142, securityClass: 'high', name: 'Fort 2', rigTypeIds: [37178], taxPct: 1.5 },
    ]);
  });

  it('gives the settings and structures pages each corp with the viewer grant', async () => {
    viewWithThreeCorps();
    mocks.resolveEntityNames.mockResolvedValue({ [SHARED_CORP]: 'Shared Corp' });

    const pages = await getCorpStructuresPageData('user-1');

    expect(pages.map(({ corporationId, corporationName, structureAccess, canManageSharing, sharing, structures }) => ({
      corporationId,
      corporationName,
      structureAccess,
      canManageSharing,
      sharing,
      structureIds: structures.map((s) => s.structureId),
    }))).toEqual([
      { corporationId: SHARED_CORP, corporationName: 'Shared Corp', structureAccess: 'use', canManageSharing: false, sharing: 'on', structureIds: [1] },
      { corporationId: MANAGED_CORP, corporationName: `Corporation ${MANAGED_CORP}`, structureAccess: 'manage', canManageSharing: false, sharing: 'off', structureIds: [2] },
      { corporationId: PRIVATE_CORP, corporationName: `Corporation ${PRIVATE_CORP}`, structureAccess: 'none', canManageSharing: false, sharing: 'off', structureIds: [] },
    ]);
  });
});
