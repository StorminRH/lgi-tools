import { after } from 'next/server';
import { getCorpAssetEvidence } from '@/features/owned-assets/queries';
import { resolveCorpViewer } from '@/composition/corp-viewer';
import { withCorpContextDueKeys } from '@/data/corp-holdings/context-sync';
import { isDueFor, recordRefusalFor } from '@/data/esi-store';
import { openReadSession } from '@/data/esi-store/session';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import {
  buildOwnedDetail,
  collectDetailNameIds,
  type OwnedBlueprintDetailEntry,
} from '@/features/owned-blueprints/detail';
import { ownedBlueprintsDueKeys, ownedBlueprintsKey } from '@/features/owned-blueprints/keys';
import { getOwnedBlueprintMap, readBlueprintSyncState, saveOwnedBlueprints, stampBlueprintFresh } from '@/features/owned-blueprints/queries';
import { refreshOwnedBlueprintsForUser } from '@/features/owned-blueprints/refresh';
import type { OwnedBlueprintsPort } from '@/features/owned-blueprints/types';
import { mapByIdDroppingNulls } from '@/lib/fan-out';
import { formatStationName } from '@/lib/format/names';
import { singleFlight } from '@/lib/memoize';
import { contextsByCorp } from '@/platform/auth/corp-visibility';
import { refreshDue } from './live-dataset-view';
import { listCharactersWithHealth, readRolesForSync, vendTokenFor } from './owner-sync-port';

/** The port of one user's pass: a corporation's answer is shared, but a due check and a refusal are this user's. */
function makeOwnedBlueprintsPort(userId: string): OwnedBlueprintsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readRoles: readRolesForSync,
    isDue: (owner) => isDueFor(userId, [ownedBlueprintsKey(owner)]),
    openSession: openReadSession,
    read: (session, owner, accessToken) => session.readPaged(ownedBlueprintsKey(owner), accessToken),
    readSyncState: (owner) => readBlueprintSyncState(owner),
    save: (owner, rows, etags, _source, tx) => saveOwnedBlueprints(owner, rows, etags, { database: tx }),
    stampFresh: (owner) => stampBlueprintFresh(owner),
    recordRefusal: (owner, expiresAt) => recordRefusalFor(userId, [ownedBlueprintsKey(owner)], expiresAt),
  };
}

const ownedBlueprintsInFlight = singleFlight((userId: string) => refreshOwnedBlueprintsForUser(makeOwnedBlueprintsPort(userId), userId));

/** The refresh a view schedules: concurrent calls for one user in this process share one run, and a call after it settles runs again. */
export function refreshOwnedBlueprintsOnView(userId: string) {
  return ownedBlueprintsInFlight(userId);
}

export async function getOwnedBlueprintDetailOnView(
  userId: string,
  requestedTypeIds: number[],
): Promise<{ blueprints: OwnedBlueprintDetailEntry[]; refreshing: boolean }> {
  const viewer = await resolveCorpViewer(userId);
  const [evidence, refreshing] = await Promise.all([
    mapByIdDroppingNulls(
      viewer.scope.corps.filter((grant) => grant.blueprints.kind === 'by-location').map((grant) => grant.corporationId),
      getCorpAssetEvidence,
    ),
    refreshDue(userId, withCorpContextDueKeys(ownedBlueprintsDueKeys)),
  ]);
  const map = await getOwnedBlueprintMap(viewer.scope, evidence);
  after(() => refreshOwnedBlueprintsOnView(userId));
  const contexts = contextsByCorp(viewer.scope);
  const names = await resolveEntityNames(collectDetailNameIds(map, requestedTypeIds, contexts));
  return { blueprints: buildOwnedDetail(map, requestedTypeIds, names, formatStationName, contexts), refreshing };
}
