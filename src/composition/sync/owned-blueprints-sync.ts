import { after } from 'next/server';
import { getCorpAssetEvidence } from '@/features/owned-assets/queries';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { isDue } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import {
  buildOwnedDetail,
  collectDetailNameIds,
  type OwnedBlueprintDetailEntry,
} from '@/features/owned-blueprints/detail';
import { ownedBlueprintsKey } from '@/features/owned-blueprints/keys';
import { getOwnedBlueprintMap, readBlueprintSyncState, saveOwnedBlueprints, stampBlueprintFresh } from '@/features/owned-blueprints/queries';
import { refreshOwnedBlueprintsForUser } from '@/features/owned-blueprints/refresh';
import type { OwnedBlueprintsPort } from '@/features/owned-blueprints/types';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { formatStationName } from '@/lib/format/names';
import { contextsByCorp } from '@/platform/auth/corp-visibility';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';

function makeOwnedBlueprintsPort(): OwnedBlueprintsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (owner) => isDue([ownedBlueprintsKey(owner)]),
    openSession: openReadSession,
    read: (session, owner, accessToken) => session.readPaged(ownedBlueprintsKey(owner), accessToken),
    readSyncState: (owner) => readBlueprintSyncState(owner),
    save: (owner, rows, etags) => saveOwnedBlueprints(owner, rows, etags),
    stampFresh: (owner) => stampBlueprintFresh(owner),
  };
}

export const refreshOwnedBlueprintsOnView = (userId: string) =>
  refreshOwnedBlueprintsForUser(makeOwnedBlueprintsPort(), userId);

export async function getOwnedBlueprintDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<OwnedBlueprintDetailEntry[]> {
  const viewer = await resolveCorpViewer(userId);
  const evidence = await mapByIdDroppingNulls(
    viewer.scope.corps.filter((grant) => grant.blueprints.kind === 'by-location').map((grant) => grant.corporationId),
    getCorpAssetEvidence,
  );
  const map = await getOwnedBlueprintMap(viewer.scope, evidence);
  after(() => refreshOwnedBlueprintsOnView(userId));
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectDetailNameIds(map, requestedTypeIds, contexts));
  return buildOwnedDetail(map, requestedTypeIds, names, formatStationName, contexts);
}
