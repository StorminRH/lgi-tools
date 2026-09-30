// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest';

vi.mock('convex/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('convex/server')>();
  return {
    ...actual,
    defineApp: () => ({
      use() {
        return this;
      },
    }),
  };
});

import { mergeUserState, snapshotMergeTracking, restoreMergeTracking, listExpiredTrackingReceipts, deleteExpiredTrackingReceipts } from '../accountMerge';
import authConfig from '../auth.config';
import { finishSync, JUMP_CONTINUITY_MS } from '../characterLocationApply';
import { purgeForUser as purgeLocationForUser } from '../characterLocationPurge';
import { syncInputs } from '../characterLocationReads';
import { syncUser } from '../characterLocationSync';
import convexApp from '../convex.config';
import crons from '../crons';
import { currentUser, heartbeat, expirePresence } from '../engine';
import { chainDispatch, onSyncComplete } from '../engineComplete';
import { leave } from '../engineLeave';
import { sweep } from '../engineSweep';
import http from '../http';
import { mergeUserState as httpMergeUserState, snapshotMergeTracking as httpSnapshotMergeTracking, restoreMergeTracking as httpRestoreMergeTracking, listExpiredTrackingReceipts as httpListExpiredTrackingReceipts, deleteExpiredTrackingReceipts as httpDeleteExpiredTrackingReceipts } from '../httpAccountMerge';
import { purgeOnline } from '../httpEngine';
import { jumpEvidence as httpJumpEvidence, resolveJump, signatureElimination } from '../httpJump';
import { leaveSync, purgeLocationTracking } from '../httpLocation';
import { projectMapAccess, purgeMapAccess, purgeMapChain } from '../httpMapAccess';
import { authorizedAction, authorizedJsonAction } from '../lib/httpAuth';
import { requireSyncEnv } from '../lib/characterSync';
import { MAP_CONNECTION_SIGNATURE_SCAN_LIMIT } from '../lib/mapConnectionLookup';
import {
  CONNECTION_MASS_STATES,
  CONNECTION_PROVENANCES,
  NOTE_TARGET_KINDS,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_LIFE_STAGES,
} from '../lib/mapEntityContracts';
import {
  purgeUserClaims,
  purgeUserMapClaims,
  reconcileMapClaims,
  remapLegacyOwnerRoles,
} from '../mapAccessProjection';
import {
  restoreSeveredBranch,
  severConnection,
} from '../mapAuthoringCollapse';
import {
  setConnectionDestination,
  setConnectionDestinationHint,
  setConnectionLifeStage,
  setConnectionMassState,
  setConnectionShipSize,
  setConnectionWormholeType,
} from '../mapAuthoringFields';
import { addSystemFromNode, setHomeSystem, upsertLiveDestination } from '../mapAuthoringHome';
import {
  CEILING_SWEEP_BATCH,
  CEILING_SWEEP_SCAN,
  collapseExpiredConnections,
} from '../mapAuthoringSweep';
import {
  restoreConnection,
  restoreSystem,
  tombstoneConnection,
  tombstoneSystem,
} from '../mapAuthoringTombstone';
import { backfillChainRetention, purgeExpiredChainTombstones } from '../mapChainCleanup';
import { watchMapAccess } from '../mapChainAccess';
import {
  watchMapConnections,
  watchUnresolvedHoles,
} from '../mapChainConnections';
import { watchMapEvents } from '../mapChainEvents';
import { watchMapSystems } from '../mapChainSystems';
import { upsertUnresolvedHole } from '../mapFixtureHoles';
import { insertNoteFixture } from '../mapFixtureNotes';
import {
  insertConnectionFixture,
  placeJumpFixture,
  placeSystemFixture,
} from '../mapFixturePlace';
import {
  collapseJumpFixture,
  removeConnectionFixture,
  removeSystemFixture,
} from '../mapFixtureRemove';
import {
  recordSignatureSeen,
  setSignatureTombstone,
  upsertSignatureObservation,
} from '../mapFixtureSignatures';
import {
  advanceTrackedLocationFixture,
  clearTrackedCoverage,
  seedTrackedLocationFixture,
} from '../mapFixtureTracking';
import { readMapCollection } from '../mapFixtures';
import { resolveJumpAuthoring, supersedeDyingPairsForEndpoints } from '../mapJumpAuthoring';
import { connectionEvidence, jumpEvidence } from '../mapJumpEvidence';
import {
  confirmJumpIdentity,
  reassociateJumpDestination,
} from '../mapJumpIdentity';
import { deleteForMapCharacter, purgeForMap } from '../mapJumpBookkeeping';
import {
  HALLWAY_BACKFILL_BATCH,
  backfillHallwayConnections,
} from '../mapHallwayBackfill';
import { purgeMapBatch } from '../mapPurge';
import {
  STATIC_BACKFILL_BATCH,
  applyStaticPlaceholders,
  backfillStaticPlaceholders,
  ensureStaticPlaceholders,
  fetchSystemStatics,
  listLiveSystemsPage,
} from '../mapStatics';
import {
  MAP_ELIMINATION_CONNECTION_LIMIT,
  MAP_SCAN_ROW_LIMIT,
  MAP_SIGNATURE_PAGE_SIZE,
  applyEliminationDeductions,
  applyScan,
  eliminationEvidence,
  identifySignature,
  linkStubToResolvedConnection,
  purgeExpiredSignatureTombstones,
  removeSignatures,
  restoreSignatures,
  watchMapGlanceGroups,
  watchSystemSignatures,
} from '../mapScan';
import { coverage, forMap } from '../mapTrackingLive';
import { setTracking } from '../mapTrackingOptIn';
import {
  purgeForUser as purgeOnlineForUser,
} from '../onlineStatus';

describe('convex runtime exports', () => {
  it('keeps leftover files and named wrappers on the test graph', () => {
    const pinned = [
      authConfig,
      convexApp,
      crons,
      http,
      purgeOnline,
      httpJumpEvidence,
      resolveJump,
      signatureElimination,
      leaveSync,
      purgeLocationTracking,
      projectMapAccess,
      purgeMapAccess,
      purgeMapChain,
      httpMergeUserState,
      httpSnapshotMergeTracking,
      httpRestoreMergeTracking,
      httpListExpiredTrackingReceipts,
      httpDeleteExpiredTrackingReceipts,
      mergeUserState,
      snapshotMergeTracking,
      restoreMergeTracking,
      listExpiredTrackingReceipts,
      deleteExpiredTrackingReceipts,
      authorizedAction,
      authorizedJsonAction,
      JUMP_CONTINUITY_MS,
      syncUser,
      finishSync,
      syncInputs,
      purgeLocationForUser,
      chainDispatch,
      heartbeat,
      expirePresence,
      currentUser,
      leave,
      onSyncComplete,
      sweep,
      requireSyncEnv,
      MAP_CONNECTION_SIGNATURE_SCAN_LIMIT,
      CONNECTION_MASS_STATES,
      CONNECTION_PROVENANCES,
      NOTE_TARGET_KINDS,
      WORMHOLE_DESTINATION_HINTS,
      WORMHOLE_LIFE_STAGES,
      purgeUserClaims,
      purgeUserMapClaims,
      reconcileMapClaims,
      remapLegacyOwnerRoles,
      CEILING_SWEEP_BATCH,
      CEILING_SWEEP_SCAN,
      addSystemFromNode,
      collapseExpiredConnections,
      purgeExpiredChainTombstones,
      backfillChainRetention,
      restoreConnection,
      restoreSeveredBranch,
      restoreSystem,
      setConnectionDestination,
      setConnectionDestinationHint,
      setConnectionLifeStage,
      setConnectionMassState,
      setConnectionShipSize,
      setConnectionWormholeType,
      setHomeSystem,
      severConnection,
      tombstoneConnection,
      tombstoneSystem,
      upsertLiveDestination,
      watchMapAccess,
      watchMapConnections,
      watchMapEvents,
      watchMapSystems,
      watchUnresolvedHoles,
      advanceTrackedLocationFixture,
      clearTrackedCoverage,
      collapseJumpFixture,
      insertConnectionFixture,
      insertNoteFixture,
      placeJumpFixture,
      placeSystemFixture,
      readMapCollection,
      recordSignatureSeen,
      removeConnectionFixture,
      removeSystemFixture,
      seedTrackedLocationFixture,
      setSignatureTombstone,
      upsertSignatureObservation,
      upsertUnresolvedHole,
      confirmJumpIdentity,
      connectionEvidence,
      jumpEvidence,
      reassociateJumpDestination,
      resolveJumpAuthoring,
      supersedeDyingPairsForEndpoints,
      deleteForMapCharacter,
      purgeForMap,
      HALLWAY_BACKFILL_BATCH,
      backfillHallwayConnections,
      purgeMapBatch,
      STATIC_BACKFILL_BATCH,
      applyStaticPlaceholders,
      backfillStaticPlaceholders,
      ensureStaticPlaceholders,
      fetchSystemStatics,
      listLiveSystemsPage,
      MAP_ELIMINATION_CONNECTION_LIMIT,
      MAP_SCAN_ROW_LIMIT,
      MAP_SIGNATURE_PAGE_SIZE,
      applyEliminationDeductions,
      applyScan,
      eliminationEvidence,
      identifySignature,
      linkStubToResolvedConnection,
      purgeExpiredSignatureTombstones,
      removeSignatures,
      restoreSignatures,
      watchMapGlanceGroups,
      watchSystemSignatures,
      coverage,
      forMap,
      setTracking,
      purgeOnlineForUser,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
